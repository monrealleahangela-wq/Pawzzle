const test = require('node:test');
const assert = require('node:assert/strict');
const {
  requireCronSecret,
  readBearerToken,
  secretsMatch
} = require('../middleware/cronSecret');
const {
  normalizeBatchSize,
  createStoreReportsJobHandler
} = require('../controllers/internalJobsController');

const createResponse = () => ({
  statusCode: 200,
  headers: {},
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  set(name, value) {
    this.headers[name] = value;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  }
});

const withCronSecret = async (value, callback) => {
  const previous = process.env.STORE_REPORT_CRON_SECRET;
  if (value === undefined) delete process.env.STORE_REPORT_CRON_SECRET;
  else process.env.STORE_REPORT_CRON_SECRET = value;
  try {
    await callback();
  } finally {
    if (previous === undefined) delete process.env.STORE_REPORT_CRON_SECRET;
    else process.env.STORE_REPORT_CRON_SECRET = previous;
  }
};

test('cron secret middleware fails closed when the secret is not configured', async () => {
  await withCronSecret(undefined, () => {
    const response = createResponse();
    let continued = false;
    requireCronSecret({ get: () => '' }, response, () => { continued = true; });
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.success, false);
    assert.equal(continued, false);
  });
});

test('cron secret middleware rejects missing and incorrect bearer tokens', async () => {
  const secret = 'a'.repeat(64);
  await withCronSecret(secret, () => {
    for (const authorization of ['', `Bearer ${'b'.repeat(64)}`, secret]) {
      const response = createResponse();
      let continued = false;
      requireCronSecret({ get: () => authorization }, response, () => { continued = true; });
      assert.equal(response.statusCode, 401);
      assert.equal(response.body.message, 'Unauthorized.');
      assert.equal(continued, false);
    }
  });
});

test('cron secret middleware accepts only the configured bearer token', async () => {
  const secret = 'c'.repeat(64);
  await withCronSecret(secret, () => {
    const request = { get: () => `Bearer ${secret}` };
    const response = createResponse();
    let continued = false;
    requireCronSecret(request, response, () => { continued = true; });
    assert.equal(continued, true);
    assert.equal(response.body, null);
  });
});

test('bearer parsing and comparison do not accept malformed values', () => {
  assert.equal(readBearerToken({ get: () => 'Basic abc' }), '');
  assert.equal(readBearerToken({ get: () => 'Bearer token-value' }), 'token-value');
  assert.equal(secretsMatch('same', 'same'), true);
  assert.equal(secretsMatch('short', 'different-length'), false);
});

test('batch size is bounded to a safe range', () => {
  assert.equal(normalizeBatchSize(undefined), 25);
  assert.equal(normalizeBatchSize(0), 25);
  assert.equal(normalizeBatchSize(10), 10);
  assert.equal(normalizeBatchSize(1000), 100);
});

test('scheduled report endpoint returns a compact successful summary', async () => {
  const previous = process.env.STORE_REPORT_BATCH_SIZE;
  process.env.STORE_REPORT_BATCH_SIZE = '40';
  const response = createResponse();
  let receivedOptions;
  try {
    const handler = createStoreReportsJobHandler({
      runReports: async options => {
        receivedOptions = options;
        return [{ status: 'sent' }, { status: 'sent' }];
      }
    });
    await handler({}, response);
  } finally {
    if (previous === undefined) delete process.env.STORE_REPORT_BATCH_SIZE;
    else process.env.STORE_REPORT_BATCH_SIZE = previous;
  }
  assert.deepEqual(receivedOptions, { limit: 40 });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(response.body.processed, 2);
  assert.equal(response.body.sent, 2);
  assert.equal(response.body.failed, 0);
  assert.equal(response.body.success, true);
  assert.equal(typeof response.body.completedAt, 'string');
});

test('scheduled report endpoint reports partial delivery failures without leaking details', async () => {
  const response = createResponse();
  const originalError = console.error;
  console.error = () => {};
  try {
    const handler = createStoreReportsJobHandler({
      runReports: async () => [
        { store: 'private-store-id', status: 'sent' },
        { store: 'another-private-id', status: 'failed', error: 'private provider failure' }
      ]
    });
    await handler({}, response);
  } finally {
    console.error = originalError;
  }
  assert.equal(response.statusCode, 500);
  assert.deepEqual(Object.keys(response.body).sort(), ['completedAt', 'failed', 'processed', 'sent', 'success']);
  assert.equal(response.body.failed, 1);
  assert.equal(JSON.stringify(response.body).includes('private'), false);
});

test('scheduled report endpoint safely handles an unexpected runner error', async () => {
  const response = createResponse();
  const originalError = console.error;
  console.error = () => {};
  try {
    const handler = createStoreReportsJobHandler({
      runReports: async () => { throw new Error('database details must stay private'); }
    });
    await handler({}, response);
  } finally {
    console.error = originalError;
  }
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, {
    success: false,
    message: 'Scheduled report processing failed.'
  });
});
