const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const SupplierProduct = require('../models/SupplierProduct');
const { supplierProductDuplicateResponse } = require('../utils/supplierProductDuplicate');
const {
  LEGACY_INDEX_NAME,
  REPLACEMENT_INDEX_NAME,
  migrateSupplierProductLivePetIndex
} = require('../scripts/migrateSupplierProductLivePetIndex');

const legacyIndex = {
  name: LEGACY_INDEX_NAME,
  key: { supplier: 1, pet: 1 },
  unique: true,
  sparse: true
};
const replacementIndex = {
  name: REPLACEMENT_INDEX_NAME,
  key: { supplier: 1, pet: 1 },
  unique: true,
  partialFilterExpression: { pet: { $type: 'objectId' } }
};

const fakeCollection = ({ indexes = [legacyIndex], duplicates = 0 } = {}) => {
  let current = indexes.map(index => ({ ...index }));
  const writes = [];
  return {
    indexes: async () => current,
    aggregate: () => ({ toArray: async () => duplicates ? [{ count: duplicates }] : [] }),
    createIndex: async (keys, options) => {
      writes.push({ action: 'create', keys, options });
      current.push({ key: keys, ...options });
      return options.name;
    },
    dropIndex: async name => {
      writes.push({ action: 'drop', name });
      current = current.filter(index => index.name !== name);
    },
    writes
  };
};

test('SupplierProduct indexes SKU per supplier and live pets only by actual ObjectId reference', () => {
  const indexes = SupplierProduct.schema.indexes();
  const sku = indexes.find(([keys]) => keys.supplier === 1 && keys.sku === 1);
  const livePet = indexes.find(([, options]) => options.name === REPLACEMENT_INDEX_NAME);
  assert.equal(sku[1].unique, true);
  assert.deepEqual(livePet, [
    { supplier: 1, pet: 1 },
    { unique: true, name: REPLACEMENT_INDEX_NAME, partialFilterExpression: { pet: { $type: 'objectId' } }, background: true }
  ]);

  const ordinary = new SupplierProduct({
    supplier: new mongoose.Types.ObjectId(), itemType: 'pet_supply', name: 'Cat food',
    sku: 'CAT991', category: 'pet_food', wholesalePrice: 460, availableStock: 100
  });
  assert.equal(ordinary.pet, undefined);
});

test('duplicate-key responses distinguish a real SKU duplicate from the legacy pet-index defect', () => {
  assert.deepEqual(supplierProductDuplicateResponse({
    code: 11000,
    keyPattern: { supplier: 1, sku: 1 },
    keyValue: { supplier: 'supplier-a', sku: 'CAT991' }
  }), {
    status: 409,
    code: 'SUPPLIER_SKU_EXISTS',
    message: 'A product with this SKU already exists in your supplier catalog.'
  });

  const legacyConflict = supplierProductDuplicateResponse({
    code: 11000,
    message: 'E11000 duplicate key error index: supplier_1_pet_1 dup key',
    keyPattern: { supplier: 1, pet: 1 },
    keyValue: { supplier: 'supplier-a', pet: null }
  }, { itemType: 'pet_supply' });
  assert.equal(legacyConflict.status, 503);
  assert.equal(legacyConflict.code, 'SUPPLIER_PRODUCT_INDEX_MIGRATION_REQUIRED');
  assert.doesNotMatch(legacyConflict.message, /SKU already exists/i);
});

test('index preflight is read-only and the guarded migration creates before it drops', async () => {
  const collection = fakeCollection();
  assert.deepEqual(await migrateSupplierProductLivePetIndex(collection), {
    legacyPresent: true,
    replacementPresent: false,
    duplicateLivePetGroups: 0,
    ready: false,
    changed: false
  });
  assert.deepEqual(collection.writes, []);

  const result = await migrateSupplierProductLivePetIndex(collection, { apply: true });
  assert.equal(result.ready, true);
  assert.equal(result.changed, true);
  assert.deepEqual(collection.writes.map(write => write.action), ['create', 'drop']);

  const second = await migrateSupplierProductLivePetIndex(collection, { apply: true });
  assert.equal(second.changed, false);
});

test('index migration refuses duplicate live-pet groups and unexpected index definitions without writes', async () => {
  const duplicates = fakeCollection({ duplicates: 2 });
  await assert.rejects(
    migrateSupplierProductLivePetIndex(duplicates, { apply: true }),
    /duplicates block migration \(2 group\(s\)\)/
  );
  assert.deepEqual(duplicates.writes, []);

  const unexpected = fakeCollection({ indexes: [{ ...legacyIndex, sparse: false }] });
  await assert.rejects(migrateSupplierProductLivePetIndex(unexpected), /Unexpected legacy/);
  assert.deepEqual(unexpected.writes, []);
});
