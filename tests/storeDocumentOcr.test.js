const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  DOCUMENT_PROFILES,
  extractionReview,
  extractStoreDocument,
  matchesImageSignature,
  normalizeDate
} = require('../utils/storeDocumentOcr');
const { extractStoreDocumentFields } = require('../controllers/storeDocumentOcrController');

const jpeg = () => Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]);

const blocksFor = answers => Object.entries(answers).flatMap(([alias, answer], index) => {
  const queryId = `query-${index}`;
  const answerId = `answer-${index}`;
  return [
    { BlockType: 'QUERY', Id: queryId, Query: { Alias: alias }, Relationships: [{ Type: 'ANSWER', Ids: [answerId] }] },
    { BlockType: 'QUERY_RESULT', Id: answerId, Text: answer.text, Confidence: answer.confidence }
  ];
});

test('extracts only high-confidence structured fields and normalizes expiry dates', async () => {
  let commandInput;
  const client = { send: async command => {
    commandInput = command.input;
    return { Blocks: blocksFor({
      permit_number: { text: 'BP-2027-001', confidence: 99 },
      issuing_authority: { text: 'City of Dasmarinas', confidence: 96 },
      issue_date: { text: 'January 2, 2027', confidence: 94 },
      expiration_date: { text: '12/31/2027', confidence: 92 }
    }) };
  } };
  const result = await extractStoreDocument({
    documentType: 'business_permit', buffer: jpeg(), mimeType: 'image/jpeg'
  }, { client, confidenceThreshold: 85 });

  assert.deepEqual(commandInput.FeatureTypes, ['QUERIES']);
  assert.equal(commandInput.QueriesConfig.Queries.length, 4);
  assert.equal(result.fields['businessLicense.number'].value, 'BP-2027-001');
  assert.equal(result.fields['businessLicense.issueDate'].value, '2027-01-02');
  assert.equal(result.fields['businessLicense.expiryDate'].value, '2027-12-31');
  assert.equal(result.provider, 'aws_textract');
});

test('omits low-confidence values and rejects an expiry that is not after issue', async () => {
  const client = { send: async () => ({ Blocks: blocksFor({
    clearance_number: { text: 'BC-100', confidence: 72 },
    issue_date: { text: '2027-02-01', confidence: 96 },
    expiration_date: { text: '2027-01-01', confidence: 95 }
  }) }) };
  const result = await extractStoreDocument({
    documentType: 'barangay_clearance', buffer: jpeg(), mimeType: 'image/jpeg'
  }, { client, confidenceThreshold: 85 });

  assert.equal(result.fields['barangayClearance.number'], undefined);
  assert.equal(result.fields['barangayClearance.expiryDate'], undefined);
  assert.deepEqual(result.reviewRequired.map(item => item.field).sort(), [
    'barangayClearance.expiryDate', 'barangayClearance.number'
  ]);
});

test('BIR profile has no expiry query and image validation checks file signatures', () => {
  assert.equal(DOCUMENT_PROFILES.bir_registration.some(([_alias, _question, field]) => /expir/i.test(field)), false);
  assert.equal(matchesImageSignature(jpeg(), 'image/jpeg'), true);
  assert.equal(matchesImageSignature(Buffer.from('not-an-image'), 'image/jpeg'), false);
  assert.equal(normalizeDate('February 29, 2028'), '2028-02-29');
  assert.equal(normalizeDate('February 29, 2027'), '');
});

test('document review reports friendly mismatches and expired evidence without provider terminology', () => {
  const review = extractionReview({
    fields: {
      'businessRegistration.registeredName': { value: 'Different Trading', confidence: 99 },
      'businessRegistration.expirationDate': { value: '2026-01-01', confidence: 99 }
    },
    reviewRequired: []
  }, { 'businessRegistration.registeredName': 'Pawzzle Trading' }, new Date('2026-11-19T00:00:00.000Z'));
  assert.equal(review.status, 'needs_attention');
  assert.ok(review.issues.some(issue => issue.status === 'mismatch'));
  assert.ok(review.issues.some(issue => issue.status === 'expired'));
  assert.doesNotMatch(JSON.stringify(review), /aws|textract|ocr/i);
});

test('controller clears the in-memory document buffer even when validation fails', async () => {
  const buffer = jpeg();
  const req = { file: { buffer, mimetype: 'image/jpeg' }, body: { documentType: 'unknown' } };
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await extractStoreDocumentFields(req, response);
  assert.equal(response.statusCode, 400);
  assert.ok(buffer.every(byte => byte === 0));
});

test('OCR route is authenticated, rate limited, memory uploaded, and error handled', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'storeApplications.js'), 'utf8');
  assert.match(source, /router\.post\([\s\S]*?'\/ocr\/extract',[\s\S]*?authenticate,[\s\S]*?authRateLimits\.storeDocumentOcr,[\s\S]*?uploadStoreDocumentOcr,[\s\S]*?handleUploadError,[\s\S]*?extractStoreDocumentFields/);
});
