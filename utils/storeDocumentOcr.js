const { AnalyzeDocumentCommand, TextractClient } = require('@aws-sdk/client-textract');

const configurationError = (message, code) => Object.assign(new Error(message), {
  statusCode: 503,
  code
});

const inputError = (message, code) => Object.assign(new Error(message), {
  statusCode: 400,
  code
});

const DOCUMENT_PROFILES = Object.freeze({
  business_registration: [
    ['certificate_number', 'What is the registration or certificate number?', 'businessRegistration.certificateNumber', 'text'],
    ['registered_name', 'What is the registered business name?', 'businessRegistration.registeredName', 'text'],
    ['registration_date', 'What is the registration date?', 'businessRegistration.registrationDate', 'date'],
    ['expiration_date', 'What is the expiration or validity end date?', 'businessRegistration.expirationDate', 'date']
  ],
  business_permit: [
    ['permit_number', 'What is the business or mayor permit number?', 'businessLicense.number', 'text'],
    ['issuing_authority', 'Which city, municipality, or authority issued this permit?', 'businessLicense.issuingAuthority', 'text'],
    ['issue_date', 'What is the permit issue date?', 'businessLicense.issueDate', 'date'],
    ['expiration_date', 'What is the permit expiration or validity end date?', 'businessLicense.expiryDate', 'date']
  ],
  barangay_clearance: [
    ['clearance_number', 'What is the barangay clearance number?', 'barangayClearance.number', 'text'],
    ['issuing_barangay', 'Which barangay issued this clearance?', 'barangayClearance.issuingBarangay', 'text'],
    ['issue_date', 'What is the clearance issue date?', 'barangayClearance.issueDate', 'date'],
    ['expiration_date', 'What is the clearance expiration or validity end date?', 'barangayClearance.expiryDate', 'date']
  ],
  bir_registration: [
    ['tin', 'What is the taxpayer identification number or TIN?', 'taxProfile.tin', 'tin'],
    ['branch_code', 'What is the BIR branch code?', 'taxProfile.branchCode', 'branch'],
    ['registered_name', 'What is the registered taxpayer or business name?', 'taxProfile.registeredName', 'text'],
    ['line_of_business', 'What is the registered line of business?', 'taxProfile.lineOfBusiness', 'text'],
    ['tax_type', 'Is the taxpayer VAT registered or Non-VAT registered?', 'taxProfile.declaredTaxStatus', 'tax_status']
  ]
});

const FIELD_LABELS = Object.freeze({
  'businessRegistration.certificateNumber': 'Registration number',
  'businessRegistration.registeredName': 'Registered business name',
  'businessRegistration.registrationDate': 'Registration date',
  'businessRegistration.expirationDate': 'Registration expiration date',
  'businessLicense.number': 'Business permit number',
  'businessLicense.issuingAuthority': 'Permit issuing authority',
  'businessLicense.issueDate': 'Business permit issue date',
  'businessLicense.expiryDate': 'Business permit expiration date',
  'barangayClearance.number': 'Barangay clearance number',
  'barangayClearance.issuingBarangay': 'Issuing barangay',
  'barangayClearance.issueDate': 'Barangay clearance issue date',
  'barangayClearance.expiryDate': 'Barangay clearance expiration date',
  'taxProfile.tin': 'Tax identification number',
  'taxProfile.branchCode': 'BIR branch code',
  'taxProfile.registeredName': 'BIR registered business name',
  'taxProfile.lineOfBusiness': 'Registered line of business',
  'taxProfile.declaredTaxStatus': 'Registered tax type'
});

const normalizedComparable = value => String(value || '')
  .normalize('NFKD')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

const extractionReview = (extraction, expectedValues = {}, now = new Date()) => {
  const fields = extraction?.fields || {};
  const issues = [];
  const readFields = Object.keys(fields);

  if (!readFields.length) {
    issues.push({
      status: 'unreadable',
      label: 'Document readability',
      message: 'No reliable details could be read. Upload a clearer image or enter the details manually.'
    });
  } else if (extraction.reviewRequired?.length) {
    issues.push({
      status: 'needs_review',
      label: 'Document readability',
      message: 'Some details could not be read clearly. Compare every suggested value with the document.'
    });
  }

  for (const [field, result] of Object.entries(fields)) {
    const expected = expectedValues?.[field];
    if (!expected || !result?.value) continue;
    if (normalizedComparable(expected) !== normalizedComparable(result.value)) {
      issues.push({
        status: 'mismatch',
        field,
        label: FIELD_LABELS[field] || 'Document information',
        message: `${FIELD_LABELS[field] || 'A document value'} does not match the information currently entered.`
      });
    }
  }

  const expirationField = Object.keys(fields).find(field => /(?:expirationDate|expiryDate)$/.test(field));
  if (expirationField) {
    const expiration = new Date(`${fields[expirationField].value}T23:59:59.999Z`);
    if (!Number.isNaN(expiration.getTime()) && expiration <= now) {
      issues.push({
        status: 'expired',
        field: expirationField,
        label: FIELD_LABELS[expirationField] || 'Document expiration date',
        message: 'This document appears to be expired. Upload a current copy before submitting.'
      });
    }
  }

  return {
    status: issues.length ? 'needs_attention' : 'ready_for_review',
    message: issues.length
      ? 'This document needs your attention before submission.'
      : 'The readable details are ready for your review.',
    issues
  };
};

const matchesImageSignature = (buffer, mimeType) => {
  if (!Buffer.isBuffer(buffer)) return false;
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  return false;
};

const getConfidenceThreshold = configured => {
  const value = Number(configured ?? process.env.STORE_DOCUMENT_OCR_CONFIDENCE_THRESHOLD ?? 85);
  if (!Number.isFinite(value) || value < 70 || value > 100) {
    throw configurationError('The secure document check is not configured correctly.', 'STORE_DOCUMENT_OCR_INVALID_THRESHOLD');
  }
  return value;
};

const createTextractClient = () => {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (!region) {
    throw configurationError('The secure document check is temporarily unavailable.', 'STORE_DOCUMENT_OCR_NOT_CONFIGURED');
  }
  return new TextractClient({ region });
};

const pad = value => String(value).padStart(2, '0');

const isoDate = (year, month, day) => {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  const date = new Date(Date.UTC(numericYear, numericMonth - 1, numericDay));
  if (date.getUTCFullYear() !== numericYear || date.getUTCMonth() !== numericMonth - 1 || date.getUTCDate() !== numericDay) return '';
  return `${numericYear}-${pad(numericMonth)}-${pad(numericDay)}`;
};

const normalizeDate = value => {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  let match = text.match(/\b(20\d{2}|19\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (match) return isoDate(match[1], match[2], match[3]);
  match = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|19\d{2})\b/);
  if (match) return isoDate(match[3], match[1], match[2]);
  match = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2}|19\d{2})\b/i);
  if (match) {
    const month = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(match[1].toLowerCase()) + 1;
    return isoDate(match[3], month, match[2]);
  }
  return '';
};

const normalizeValue = (value, type) => {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  if (type === 'date') return normalizeDate(text);
  if (type === 'tin') return text.replace(/[^0-9-]/g, '').replace(/-{2,}/g, '-').slice(0, 20);
  if (type === 'branch') return text.replace(/[^0-9A-Za-z-]/g, '').slice(0, 12);
  if (type === 'tax_status') {
    const normalized = text.toLowerCase();
    if (/non[-\s]?vat/.test(normalized)) return 'non_vat_registered';
    if (/\bvat\b/.test(normalized)) return 'vat_registered';
    return '';
  }
  return text.slice(0, 300);
};

const queryResultsByAlias = blocks => {
  const byId = new Map((blocks || []).map(block => [block.Id, block]));
  const results = new Map();
  for (const block of blocks || []) {
    if (block.BlockType !== 'QUERY' || !block.Query?.Alias) continue;
    const answerIds = (block.Relationships || [])
      .filter(relationship => relationship.Type === 'ANSWER')
      .flatMap(relationship => relationship.Ids || []);
    const answer = answerIds.map(id => byId.get(id)).find(candidate => candidate?.BlockType === 'QUERY_RESULT');
    if (answer?.Text) results.set(block.Query.Alias, answer);
  }
  return results;
};

const mapTextractError = error => {
  if (['BadDocumentException', 'UnsupportedDocumentException', 'DocumentTooLargeException', 'InvalidParameterException'].includes(error?.name)) {
    return inputError('Use a clear, single-page JPG or PNG image of the document.', 'STORE_DOCUMENT_OCR_UNUSABLE_IMAGE');
  }
  return configurationError('The secure document check is temporarily unavailable.', 'STORE_DOCUMENT_OCR_UNAVAILABLE');
};

const extractStoreDocument = async ({ documentType, buffer, mimeType }, options = {}) => {
  const profile = DOCUMENT_PROFILES[documentType];
  if (!profile) throw inputError('Select a supported store document type.', 'STORE_DOCUMENT_OCR_UNSUPPORTED_TYPE');
  if (!matchesImageSignature(buffer, mimeType)) {
    throw inputError('Choose a valid JPG or PNG document image.', 'STORE_DOCUMENT_OCR_INVALID_IMAGE');
  }
  const threshold = getConfidenceThreshold(options.confidenceThreshold);
  const client = options.client || createTextractClient();
  let response;
  try {
    response = await client.send(new AnalyzeDocumentCommand({
      Document: { Bytes: buffer },
      FeatureTypes: ['QUERIES'],
      QueriesConfig: {
        Queries: profile.map(([alias, question]) => ({ Alias: alias, Text: question }))
      }
    }));
  } catch (error) {
    if (error?.statusCode && error?.code) throw error;
    throw mapTextractError(error);
  }

  const answers = queryResultsByAlias(response.Blocks);
  const fields = {};
  const reviewRequired = [];
  for (const [alias, _question, field, type] of profile) {
    const answer = answers.get(alias);
    if (!answer) continue;
    const confidence = Number(answer.Confidence || 0);
    const value = normalizeValue(answer.Text, type);
    if (!value || confidence < threshold) {
      reviewRequired.push({ field, confidence });
      continue;
    }
    fields[field] = { value, confidence };
  }

  const issueField = documentType === 'business_permit'
    ? 'businessLicense.issueDate'
    : documentType === 'barangay_clearance'
      ? 'barangayClearance.issueDate'
      : 'businessRegistration.registrationDate';
  const expiryField = documentType === 'business_permit'
    ? 'businessLicense.expiryDate'
    : documentType === 'barangay_clearance'
      ? 'barangayClearance.expiryDate'
      : 'businessRegistration.expirationDate';
  if (fields[issueField] && fields[expiryField] && fields[expiryField].value <= fields[issueField].value) {
    reviewRequired.push({ field: expiryField, confidence: fields[expiryField].confidence });
    delete fields[expiryField];
  }

  return {
    documentType,
    provider: 'aws_textract',
    confidenceThreshold: threshold,
    fields,
    reviewRequired
  };
};

module.exports = {
  DOCUMENT_PROFILES,
  FIELD_LABELS,
  matchesImageSignature,
  getConfidenceThreshold,
  normalizeDate,
  normalizeValue,
  queryResultsByAlias,
  extractionReview,
  extractStoreDocument
};
