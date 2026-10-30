const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const SupplierVariantMapping = require('../models/SupplierVariantMapping');
const SupplierProduct = require('../models/SupplierProduct');
const SupplierProductVariant = require('../models/SupplierProductVariant');
const { commitPurchaseOrderStock, releasePurchaseOrderStock } = require('../services/procurementStockCommitmentService');

const configuredUri = process.env.MONGODB_TRANSACTION_TEST_URI;
const safeLocalReplicaUri = uri => {
  if (!uri) return false;
  const parsed = new URL(uri);
  const localHosts = parsed.host.split(',').every(host => /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host));
  const database = parsed.pathname.replace(/^\//, '');
  return localHosts && /^pawzzle_variant_phase2_test_[a-z0-9_-]+$/i.test(database);
};
const integration = configuredUri && safeLocalReplicaUri(configuredUri) ? test : test.skip;

integration('variant mapping physical indexes reject concurrent duplicate mappings', async () => {
  await mongoose.connect(configuredUri, { autoIndex: false, serverSelectionTimeoutMS: 5000 });
  try {
    await mongoose.connection.dropDatabase();
    await SupplierVariantMapping.syncIndexes();
    const base = {
      store: new mongoose.Types.ObjectId(),
      sellerProduct: new mongoose.Types.ObjectId(),
      sellerVariant: new mongoose.Types.ObjectId(),
      supplier: new mongoose.Types.ObjectId(),
      supplierProduct: new mongoose.Types.ObjectId(),
      supplierVariant: new mongoose.Types.ObjectId(),
      status: 'confirmed',
      confirmedBy: new mongoose.Types.ObjectId(),
      confirmedAt: new Date(),
      statusHistory: [{ status: 'confirmed', actor: new mongoose.Types.ObjectId() }]
    };
    const results = await Promise.allSettled([
      SupplierVariantMapping.create(base),
      SupplierVariantMapping.create({ ...base, _id: new mongoose.Types.ObjectId() })
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 11000);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

integration('exact supplier variant stock commitment is atomic and cancellation restores once', async () => {
  await mongoose.connect(configuredUri, { autoIndex: false, serverSelectionTimeoutMS: 5000 });
  try {
    await mongoose.connection.dropDatabase();
    await Promise.all([SupplierProduct.syncIndexes(), SupplierProductVariant.syncIndexes()]);
    const supplier = new mongoose.Types.ObjectId();
    const parent = await SupplierProduct.create({
      productMode: 'variant', supplier, itemType: 'pet_supply', name: 'Food', sku: 'FOOD',
      category: 'accessories', wholesalePrice: 1, availableStock: 0, minimumOrderQuantity: 1
    });
    const variant = await SupplierProductVariant.create({
      supplierProduct: parent._id,
      attributes: [{ code: 'flavor', label: 'Flavor', valueCode: 'beef', valueLabel: 'Beef' }],
      sku: 'FOOD-BEEF', wholesalePrice: 120, availableStock: 10, minimumOrderQuantity: 1
    });
    const makeOrder = () => ({
      _id: new mongoose.Types.ObjectId(), supplier,
      items: [{
        supplierProduct: parent._id, supplierVariant: variant._id, itemType: 'pet_supply',
        productName: 'Food — Beef', quantity: 6, supplierStockCommittedQuantity: 0,
        supplierStockCommitmentReleased: false
      }]
    });
    const orders = [makeOrder(), makeOrder()];
    const results = await Promise.allSettled(orders.map(order => mongoose.connection.transaction(session => (
      commitPurchaseOrderStock({ order, session })
    ))));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    assert.equal((await SupplierProductVariant.findById(variant._id)).availableStock, 4);
    const winner = orders[results.findIndex(result => result.status === 'fulfilled')];
    await mongoose.connection.transaction(session => releasePurchaseOrderStock({ order: winner, session }));
    assert.equal((await SupplierProductVariant.findById(variant._id)).availableStock, 10);
    await mongoose.connection.transaction(session => releasePurchaseOrderStock({ order: winner, session }));
    assert.equal((await SupplierProductVariant.findById(variant._id)).availableStock, 10);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
