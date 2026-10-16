const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const SupplierProduct = require('../models/SupplierProduct');
const { migrateSupplierProductLivePetIndex } = require('../scripts/migrateSupplierProductLivePetIndex');

const configuredUri = process.env.MONGODB_TRANSACTION_TEST_URI;

test('real MongoDB permits distinct supplier SKUs after the live-pet index migration', {
  skip: !configuredUri && 'MONGODB_TRANSACTION_TEST_URI is not configured'
}, async () => {
  const parsed = new URL(configuredUri);
  assert.equal(parsed.protocol, 'mongodb:');
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.port, '27018');
  assert.equal(parsed.searchParams.get('replicaSet'), 'pawzzleTestRS');
  parsed.pathname = `/pawzzle_supplier_sku_${crypto.randomBytes(7).toString('hex')}`;

  mongoose.set('autoIndex', false);
  await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000 });
  try {
    const collection = mongoose.connection.db.collection('supplierproducts');
    await mongoose.connection.db.createCollection('supplierproducts');
    await collection.createIndex({ supplier: 1, sku: 1 }, { unique: true, name: 'supplier_1_sku_1' });
    await collection.createIndex({ supplier: 1, pet: 1 }, { unique: true, sparse: true, name: 'supplier_1_pet_1' });

    const supplierA = new mongoose.Types.ObjectId();
    const supplierB = new mongoose.Types.ObjectId();
    const base = {
      itemType: 'pet_supply', category: 'pet_food', wholesalePrice: 100,
      availableStock: 10, minimumOrderQuantity: 1, unitOfMeasure: 'pack'
    };
    await SupplierProduct.create({ ...base, supplier: supplierA, name: 'First', sku: 'FIRST' });
    await assert.rejects(
      SupplierProduct.create({ ...base, supplier: supplierA, name: 'Second', sku: 'CAT991' }),
      error => error?.code === 11000 && error?.keyPattern?.pet === 1
    );

    const migration = await migrateSupplierProductLivePetIndex(collection, { apply: true });
    assert.equal(migration.ready, true);
    const second = await SupplierProduct.create({ ...base, supplier: supplierA, name: 'Second', sku: 'CAT991' });
    assert.equal(second.sku, 'CAT991');
    await assert.rejects(
      SupplierProduct.create({ ...base, supplier: supplierA, name: 'Duplicate', sku: 'CAT991' }),
      error => error?.code === 11000 && error?.keyPattern?.sku === 1
    );
    const otherSupplier = await SupplierProduct.create({
      ...base, supplier: supplierB, name: 'Other supplier', sku: 'CAT991'
    });
    assert.equal(otherSupplier.sku, 'CAT991');

    const pet = new mongoose.Types.ObjectId();
    await SupplierProduct.create({
      ...base, supplier: supplierA, itemType: 'live_pet', category: 'live_pets',
      name: 'Exact pet', sku: 'PET-1', pet, availableStock: 1, unitOfMeasure: 'piece'
    });
    await assert.rejects(SupplierProduct.create({
      ...base, supplier: supplierA, itemType: 'live_pet', category: 'live_pets',
      name: 'Duplicate exact pet', sku: 'PET-2', pet, availableStock: 1, unitOfMeasure: 'piece'
    }), error => error?.code === 11000 && error?.keyPattern?.pet === 1);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
