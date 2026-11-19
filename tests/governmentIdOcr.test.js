const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectGovernmentIdType,
  extractGovernmentId,
  normalizeDate
} = require('../utils/governmentIdOcr');

const jpeg = () => Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]);
const queryBlocks = answers => Object.entries(answers).flatMap(([alias, text], index) => [
  {
    BlockType: 'QUERY',
    Id: `q-${index}`,
    Query: { Alias: alias },
    Relationships: [{ Type: 'ANSWER', Ids: [`a-${index}`] }]
  },
  { BlockType: 'QUERY_RESULT', Id: `a-${index}`, Text: text, Confidence: 98 }
]);

test('recognizes supported Philippine government document types from document text', () => {
  assert.equal(detectGovernmentIdType('Republic of the Philippines PASSPORT P<PHLDELA<CRUZ'), 'passport');
  assert.equal(detectGovernmentIdType('LAND TRANSPORTATION OFFICE DRIVER\'S LICENSE'), 'drivers_license');
  assert.equal(detectGovernmentIdType('PAMBANSANG PAGKAKAKILANLAN PHILSYS'), 'philsys_id');
  assert.equal(detectGovernmentIdType('ordinary product receipt'), null);
  assert.equal(normalizeDate('23 NOV 2030'), '2030-11-23');
});

test('confirms the selected ID type and extracts registration details', async () => {
  let commandInput;
  const client = { send: async command => {
    commandInput = command.input;
    return {
      Blocks: [
        { BlockType: 'LINE', Text: 'REPUBLIC OF THE PHILIPPINES', Confidence: 99 },
        { BlockType: 'LINE', Text: 'PASSPORT', Confidence: 99 },
        { BlockType: 'LINE', Text: 'P<PHLDELA<CRUZ', Confidence: 99 },
        ...queryBlocks({
          firstName: 'Eugene',
          middleName: 'Santos',
          lastName: 'Pabello',
          city: 'Dasmarinas',
          province: 'Cavite',
          zipCode: '4114'
        })
      ]
    };
  } };

  const result = await extractGovernmentId({
    selectedType: 'passport',
    buffer: jpeg(),
    mimeType: 'image/jpeg'
  }, { client });

  assert.deepEqual(commandInput.FeatureTypes, ['QUERIES']);
  assert.equal(result.detectedType, 'passport');
  assert.equal(result.fields.firstName, 'Eugene');
  assert.equal(result.fields.province, 'Cavite');
  assert.equal(result.fields.zipCode, '4114');
});

test('rejects an uploaded document that does not match the selected ID type', async () => {
  const client = { send: async () => ({ Blocks: [
    { BlockType: 'LINE', Text: 'REPUBLIC OF THE PHILIPPINES', Confidence: 99 },
    { BlockType: 'LINE', Text: 'PASSPORT', Confidence: 99 }
  ] }) };

  await assert.rejects(
    extractGovernmentId({ selectedType: 'drivers_license', buffer: jpeg(), mimeType: 'image/jpeg' }, { client }),
    error => error.code === 'GOVERNMENT_ID_TYPE_MISMATCH'
      && error.statusCode === 422
      && /Philippine passport/.test(error.message)
  );
});

test('rejects images whose document type cannot be confirmed', async () => {
  const client = { send: async () => ({ Blocks: [
    { BlockType: 'LINE', Text: 'Sample membership card', Confidence: 99 }
  ] }) };
  await assert.rejects(
    extractGovernmentId({ selectedType: 'passport', buffer: jpeg(), mimeType: 'image/jpeg' }, { client }),
    error => error.code === 'GOVERNMENT_ID_TYPE_UNREADABLE'
  );
});

test('rejects a readable expired ID', async () => {
  const client = { send: async () => ({ Blocks: [
    { BlockType: 'LINE', Text: 'PASSPORT', Confidence: 99 },
    ...queryBlocks({ expirationDate: '23 NOV 2025' })
  ] }) };
  await assert.rejects(
    extractGovernmentId(
      { selectedType: 'passport', buffer: jpeg(), mimeType: 'image/jpeg' },
      { client, now: new Date('2026-11-19T00:00:00Z') }
    ),
    error => error.code === 'GOVERNMENT_ID_EXPIRED' && /expired/.test(error.message)
  );
});
