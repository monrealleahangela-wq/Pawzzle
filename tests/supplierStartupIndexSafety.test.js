const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { assertSupplierIndexesReady } = require('../services/supplierIndexReadinessService');
const { migrateSupplierProductLivePetIndex } = require('../scripts/migrateSupplierProductLivePetIndex');

const modelOptions = mode => JSON.parse(execFileSync(process.execPath, ['-e', `
  const Product = require('./models/SupplierProduct');
  const Partnership = require('./models/SupplierPartnership');
  console.log(JSON.stringify({ product: Product.schema.options, partnership: Partnership.schema.options }));
`], { cwd: path.join(__dirname, '..'), env: { ...process.env, NODE_ENV: mode }, encoding: 'utf8' }));

const productIndexes = () => [
  { name: '_id_', key: { _id: 1 }, unique: true },
  { name: 'itemType_1', key: { itemType: 1 } },
  { name: 'pet_1', key: { pet: 1 } },
  { name: 'supplier_1_sku_1', key: { supplier: 1, sku: 1 }, unique: true },
  { name: 'category_1', key: { category: 1 } },
  { name: 'supplier_1_isActive_1', key: { supplier: 1, isActive: 1 } },
  { name: 'supplier_live_pet_unique', key: { supplier: 1, pet: 1 }, unique: true,
    partialFilterExpression: { pet: { $type: 'objectId' } } }
];
const partnershipIndexes = () => [
  { name: '_id_', key: { _id: 1 }, unique: true },
  { name: 'store_1_supplier_1', key: { store: 1, supplier: 1 }, unique: true },
  { name: 'supplier_1_status_1', key: { supplier: 1, status: 1 } },
  { name: 'status_1_versions.terms.effectiveUntil_1',
    key: { status: 1, 'versions.terms.effectiveUntil': 1 } }
];
const fakeDb = (products = productIndexes(), partnerships = partnershipIndexes()) => {
  let writes = 0;
  return {
    collection: name => ({
      indexes: async () => name === 'supplierproducts' ? products : partnerships,
      createIndex: async () => { writes += 1; },
      dropIndex: async () => { writes += 1; }
    }),
    writes: () => writes
  };
};
const runProductionServer = (uri, { stopOnListen = false } = {}) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'production', MONGODB_URI: uri,
      HOST: '127.0.0.1', PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  let timedOut = false;
  let stoppedAfterListen = false;
  const capture = chunk => {
    output = (output + chunk.toString()).slice(-5000);
    if (stopOnListen && !stoppedAfterListen && output.includes('Pawzzle server listening')) {
      stoppedAfterListen = true;
      child.kill();
    }
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, 60000);
  child.on('error', reject);
  child.on('close', (code, signal) => {
    clearTimeout(timer);
    resolve({ code, signal, output, timedOut });
  });
});

test('production models never auto-create Supplier collections or indexes; test mode retains explicit index support', () => {
  const production = modelOptions('production');
  const uppercaseProduction = modelOptions('PRODUCTION');
  const isolatedTest = modelOptions('test');
  for (const model of [production.product, production.partnership,
    uppercaseProduction.product, uppercaseProduction.partnership]) {
    assert.equal(model.autoIndex, false);
    assert.equal(model.autoCreate, false);
  }
  for (const model of [isolatedTest.product, isolatedTest.partnership]) {
    assert.equal(model.autoIndex, true);
    assert.equal(model.autoCreate, true);
  }
});

test('read-only startup gate requires exact migrated and baseline indexes before traffic', async () => {
  const ready = fakeDb();
  assert.deepEqual(await assertSupplierIndexesReady(ready),
    { supplierProductReady: true, supplierPartnershipReady: true });
  const legacy = { name: 'supplier_1_pet_1', key: { supplier: 1, pet: 1 }, unique: true, sparse: true };
  for (const db of [
    fakeDb([...productIndexes(), legacy]),
    fakeDb(productIndexes().filter(index => index.name !== 'supplier_live_pet_unique')),
    fakeDb(productIndexes().filter(index => index.name !== 'supplier_1_sku_1')),
    fakeDb(productIndexes(), partnershipIndexes().filter(index => index.name !== 'store_1_supplier_1'))
  ]) {
    await assert.rejects(assertSupplierIndexesReady(db), /index migration|index.*missing/i);
    assert.equal(db.writes(), 0);
  }
  assert.equal(ready.writes(), 0);
});

test('server gates production listening before scheduled work and never invokes migration', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const gate = source.indexOf('await assertSupplierIndexesReady(mongoose.connection.db)');
  const firstSweep = source.indexOf('expireBookingProposals().catch');
  const productionListen = source.indexOf('if (isProduction) startListening();');
  assert.ok(gate > 0 && gate < firstSweep && firstSweep < productionListen);
  assert.match(source, /if \(!isProduction\) startListening\(\)/);
  assert.doesNotMatch(source, /migrateSupplierProductLivePetIndex|dropIndex\(/);
});

const configuredUri = process.env.MONGODB_TRANSACTION_TEST_URI;
test('isolated MongoDB confirms production model init is inert and explicit migration unlocks readiness', {
  skip: !configuredUri && 'MONGODB_TRANSACTION_TEST_URI is not configured'
}, async () => {
  const parsed = new URL(configuredUri);
  assert.equal(parsed.protocol, 'mongodb:');
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.port, '27018');
  assert.equal(parsed.searchParams.get('replicaSet'), 'pawzzleTestRS');
  parsed.pathname = `/pawzzle_supplier_startup_${crypto.randomBytes(7).toString('hex')}`;
  const previousMode = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const SupplierProduct = require('../models/SupplierProduct');
  const SupplierPartnership = require('../models/SupplierPartnership');
  if (previousMode === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousMode;
  await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000 });
  try {
    const db = mongoose.connection.db;
    await db.createCollection('supplierproducts');
    await db.collection('supplierproducts').createIndex({ supplier: 1, pet: 1 },
      { name: 'supplier_1_pet_1', unique: true, sparse: true });
    const blockedStartup = await runProductionServer(parsed.toString());
    assert.equal(blockedStartup.timedOut, false, JSON.stringify({
      observedReadinessFailure: blockedStartup.output.includes('Production database/index readiness failed'),
      observedListener: blockedStartup.output.includes('Pawzzle server listening'),
      outputBytes: blockedStartup.output.length
    }));
    assert.equal(blockedStartup.code, 1);
    assert.match(blockedStartup.output, /Production database\/index readiness failed: SUPPLIER_INDEX_MIGRATION_REQUIRED/);
    assert.doesNotMatch(blockedStartup.output, /Pawzzle server listening/);
    await SupplierProduct.init();
    await SupplierPartnership.init();
    assert.equal((await db.collection('supplierproducts').indexes()).some(index => index.name === 'supplier_live_pet_unique'), false);
    assert.equal((await db.listCollections({ name: 'supplierpartnerships' }).toArray()).length, 0);
    await assert.rejects(assertSupplierIndexesReady(db), /index migration/);
    // These explicit calls stand in for a separately authorized change on the
    // disposable database; they are never part of application startup.
    await SupplierProduct.createIndexes();
    await migrateSupplierProductLivePetIndex(db.collection('supplierproducts'), { apply: true });
    await db.createCollection('supplierpartnerships');
    await SupplierPartnership.createIndexes();
    assert.deepEqual(await assertSupplierIndexesReady(db),
      { supplierProductReady: true, supplierPartnershipReady: true });
    const readyStartup = await runProductionServer(parsed.toString(), { stopOnListen: true });
    assert.equal(readyStartup.timedOut, false);
    assert.match(readyStartup.output, /Pawzzle server listening/);
    assert.doesNotMatch(readyStartup.output, /Production database\/index readiness failed/);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
