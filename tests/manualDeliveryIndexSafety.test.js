const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns');
const {
  INDEX_NAME, INDEX_KEYS, PARTIAL_FILTER, configureMaintenanceDns,
  safeErrorMessage, inspectManualDeliveryIndex
} = require('../scripts/manualDeliveryIndexMaintenance');

test('production Delivery startup leaves index creation to authorized maintenance', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'models', 'Delivery.js'), 'utf8');
  assert.match(source, /autoIndex:\s*process\.env\.NODE_ENV\s*!==\s*['"]production['"]/);
  assert.equal(INDEX_NAME, 'manual_delivery_store_idempotency_unique');
  assert.deepEqual(INDEX_KEYS, { store: 1, 'manualDelivery.idempotencyKey': 1 });
  assert.deepEqual(PARTIAL_FILTER, {
    sourceType: 'manual',
    'manualDelivery.idempotencyKey': { $type: 'string' }
  });
});

test('read-only preflight detects exact, missing and conflicting index metadata', async () => {
  const aggregate = conflicts => ({ toArray: async () => conflicts ? [{ conflicts }] : [] });
  const exact = await inspectManualDeliveryIndex({
    indexes: async () => [{ name: INDEX_NAME, key: INDEX_KEYS, unique: true, partialFilterExpression: PARTIAL_FILTER }],
    aggregate: () => aggregate(0)
  });
  assert.equal(exact.indexExact, true);
  assert.equal(exact.conflictingGroups, 0);

  const unsafe = await inspectManualDeliveryIndex({
    indexes: async () => [{ name: INDEX_NAME, key: INDEX_KEYS, unique: false }],
    aggregate: () => aggregate(2)
  });
  assert.equal(unsafe.indexExact, false);
  assert.equal(unsafe.conflictingGroups, 2);
});

test('maintenance DNS override is process-local, validated, and errors redact URI credentials', () => {
  const previousServers = dns.getServers();
  const previousConfigured = process.env.MONGODB_MAINTENANCE_DNS_SERVERS;
  try {
    process.env.MONGODB_MAINTENANCE_DNS_SERVERS = '1.1.1.1,8.8.8.8';
    assert.deepEqual(configureMaintenanceDns(), ['1.1.1.1', '8.8.8.8']);
    assert.throws(() => {
      process.env.MONGODB_MAINTENANCE_DNS_SERVERS = 'not-an-ip';
      configureMaintenanceDns();
    }, /DNS server IP addresses/);
    const exampleUri = ['mongodb+srv://operator', 'example-value@example.test/Petshop'].join(':');
    assert.equal(
      safeErrorMessage(new Error(`failed ${exampleUri}`)),
      'failed mongodb://<credentials>@example.test/Petshop'
    );
  } finally {
    if (previousConfigured === undefined) delete process.env.MONGODB_MAINTENANCE_DNS_SERVERS;
    else process.env.MONGODB_MAINTENANCE_DNS_SERVERS = previousConfigured;
    dns.setServers(previousServers);
  }
});
