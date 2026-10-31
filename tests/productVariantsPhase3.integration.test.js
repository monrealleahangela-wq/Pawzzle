const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const Inventory = require('../models/Inventory');
const InventoryLot = require('../models/InventoryLot');
const InventoryTransaction = require('../models/InventoryTransaction');
const SkuClaim = require('../models/SkuClaim');
const InventoryLedgerService = require('../services/inventoryLedgerService');
const { claimSku } = require('../services/skuClaimService');

const configuredUri = process.env.MONGODB_TRANSACTION_TEST_URI;
const id = () => new mongoose.Types.ObjectId();

test('isolated replica set keeps variant balances independent and receiving idempotent', {
  skip: !configuredUri && 'MONGODB_TRANSACTION_TEST_URI is not configured'
}, async () => {
  const parsed = new URL(configuredUri);
  assert.equal(parsed.protocol, 'mongodb:');
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.port, '27018');
  assert.equal(parsed.searchParams.get('replicaSet'), 'pawzzleTestRS');
  parsed.pathname = `/pawzzle_variant_inventory_${crypto.randomBytes(7).toString('hex')}`;
  mongoose.set('autoIndex', false);
  await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000, autoIndex: false });
  try {
    await Promise.all([ProductVariant.syncIndexes(), Inventory.syncIndexes(), InventoryLot.syncIndexes(), InventoryTransaction.syncIndexes(), SkuClaim.syncIndexes()]);
    const store = id();
    const user = id();
    const product = await Product.create({
      productMode: 'variant', name: 'Premium food', category: 'food', description: 'Food', shortDescription: 'Food',
      price: 100, stockQuantity: 0, stockStatus: 'out_of_stock', sku: `PARENT-${crypto.randomUUID()}`,
      images: ['/food.jpg'], addedBy: user, store
    });
    const makeVariant = (flavor, sku) => ProductVariant.create({
      product: product._id,
      attributes: [{ code: 'flavor', label: 'Flavor', valueCode: flavor, valueLabel: flavor }],
      sku, price: 150
    });
    const [chicken, beef] = await Promise.all([makeVariant('chicken', 'CHICKEN-1KG'), makeVariant('beef', 'BEEF-1KG')]);
    await claimSku({ namespaceType: 'store', owner: store, sku: product.sku, entityType: 'product', entity: product._id });
    await claimSku({ namespaceType: 'store', owner: store, sku: chicken.sku, entityType: 'product_variant', entity: chicken._id });
    await claimSku({ namespaceType: 'store', owner: store, sku: beef.sku, entityType: 'product_variant', entity: beef._id });
    process.env.SELLER_VARIANT_INVENTORY_ENABLED = 'true';
    process.env.SELLER_VARIANT_INVENTORY_CONCURRENCY_VERIFIED = 'true';
    process.env.SELLER_VARIANTS_ENABLED = 'true';
    process.env.SELLER_VARIANTS_CONCURRENCY_VERIFIED = 'true';
    process.env.SELLER_VARIANTS_AUTHORIZATION_VERIFIED = 'true';
    const receive = (variant, quantity, key) => InventoryLedgerService.receiveLot({
      store, product: product._id, productVariant: variant._id,
      lotNumber: `LOT-${variant.sku}`, quantity, unitCost: 100, performedBy: user, idempotencyKey: key
    });
    await receive(chicken, 10, 'receive:chicken');
    await receive(beef, 5, 'receive:beef');
    await receive(chicken, 10, 'receive:chicken');
    const balances = await Inventory.find({ product: product._id }).sort({ quantity: -1 }).lean();
    assert.equal(balances.length, 2);
    assert.deepEqual(balances.map(row => row.quantity), [10, 5]);
    assert.equal(await InventoryTransaction.countDocuments({ idempotencyKey: 'receive:chicken' }), 1);
    assert.equal((await Product.findById(product._id)).stockQuantity, 0);
  } finally {
    delete process.env.SELLER_VARIANT_INVENTORY_ENABLED;
    delete process.env.SELLER_VARIANT_INVENTORY_CONCURRENCY_VERIFIED;
    delete process.env.SELLER_VARIANTS_ENABLED;
    delete process.env.SELLER_VARIANTS_CONCURRENCY_VERIFIED;
    delete process.env.SELLER_VARIANTS_AUTHORIZATION_VERIFIED;
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
