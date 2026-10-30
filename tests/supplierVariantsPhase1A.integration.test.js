const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const SupplierProduct = require('../models/SupplierProduct');
const SupplierProductVariant = require('../models/SupplierProductVariant');
const SkuClaim = require('../models/SkuClaim');
const { claimSku, releaseSku, replaceSkuClaim } = require('../services/skuClaimService');

const configuredUri = process.env.MONGODB_TRANSACTION_TEST_URI;
const safeLocalReplicaUri = uri => {
  if (!uri) return false;
  const parsed = new URL(uri);
  const localHosts = parsed.host.split(',').every(host => /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host));
  const database = parsed.pathname.replace(/^\//, '');
  return localHosts && /^pawzzle_variant_phase1a_test_[a-z0-9_-]+$/i.test(database);
};
const integration = configuredUri && safeLocalReplicaUri(configuredUri) ? test : test.skip;

integration('supplier variant indexes and transactional SKU claims enforce concurrency safety', async () => {
  await mongoose.connect(configuredUri, { autoIndex: false, serverSelectionTimeoutMS: 5000 });
  try {
    await mongoose.connection.dropDatabase();
    await Promise.all([
      SupplierProduct.syncIndexes(),
      SupplierProductVariant.syncIndexes(),
      SkuClaim.syncIndexes()
    ]);
    const supplier = new mongoose.Types.ObjectId();
    const parent = await SupplierProduct.create({
      productMode: 'variant', supplier, itemType: 'pet_supply', name: 'Premium Food',
      sku: 'PREMIUM-FOOD', category: 'pet_food', wholesalePrice: 120,
      availableStock: 0, minimumOrderQuantity: 1
    });
    await mongoose.connection.transaction(session => claimSku({
      namespaceType: 'supplier', owner: supplier, sku: parent.sku,
      entityType: 'supplier_product', entity: parent._id, session
    }));

    await assert.rejects(
      mongoose.connection.transaction(session => claimSku({
        namespaceType: 'supplier', owner: supplier, sku: 'premium-food',
        entityType: 'supplier_product_variant', entity: new mongoose.Types.ObjectId(), session
      })),
      error => error.code === 'DUPLICATE_SKU_NAMESPACE_CLAIM'
    );

    const makeVariant = (sku, value) => new SupplierProductVariant({
      supplierProduct: parent._id, supplier,
      attributes: [{ code: 'flavor', label: 'Flavor', valueCode: value.toLowerCase(), valueLabel: value }],
      sku, wholesalePrice: 120, availableStock: 10, minimumOrderQuantity: 1,
      regulatoryReview: { scope: 'variant', status: 'pending_review' }
    });
    const first = makeVariant('PREMIUM-CHICKEN', 'Chicken');
    await mongoose.connection.transaction(async session => {
      first.$session(session);
      await claimSku({ namespaceType: 'supplier', owner: supplier, sku: first.sku, entityType: 'supplier_product_variant', entity: first._id, session });
      await first.save({ session });
    });

    const concurrent = await Promise.allSettled([1, 2].map(() => mongoose.connection.transaction(session => claimSku({
      namespaceType: 'supplier', owner: supplier, sku: 'CONCURRENT-SKU',
      entityType: 'supplier_product_variant', entity: new mongoose.Types.ObjectId(), session
    }))));
    assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(concurrent.filter(result => result.status === 'rejected').length, 1);

    await mongoose.connection.transaction(async session => {
      await replaceSkuClaim({
        namespaceType: 'supplier', owner: supplier,
        previousSku: 'PREMIUM-CHICKEN', nextSku: 'PREMIUM-CHICKEN-V2',
        entityType: 'supplier_product_variant', entity: first._id, session
      });
      first.sku = 'PREMIUM-CHICKEN-V2';
      first.$session(session);
      await first.save({ session });
    });
    assert.ok(await SkuClaim.exists({ normalizedSku: 'PREMIUM-CHICKEN', isActive: false }));
    assert.ok(await SkuClaim.exists({ normalizedSku: 'PREMIUM-CHICKEN-V2', isActive: true }));

    await mongoose.connection.transaction(session => releaseSku({
      entityType: 'supplier_product_variant', entity: first._id, reason: 'test release', session
    }));
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
