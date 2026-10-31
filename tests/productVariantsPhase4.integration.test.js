const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const Inventory = require('../models/Inventory');
const InventoryLot = require('../models/InventoryLot');
const InventoryTransaction = require('../models/InventoryTransaction');
const InventoryReservation = require('../models/InventoryReservation');
const SkuClaim = require('../models/SkuClaim');
const Order = require('../models/Order');
const { claimSku } = require('../services/skuClaimService');
const {
  consumeOrderReservations,
  releaseOrderReservations,
  reserveOrderItems
} = require('../services/inventoryReservationService');

const configuredUri = process.env.MONGODB_TRANSACTION_TEST_URI;
const id = () => new mongoose.Types.ObjectId();
const flags = [
  'SELLER_VARIANTS_ENABLED', 'SELLER_VARIANTS_CONCURRENCY_VERIFIED', 'SELLER_VARIANTS_AUTHORIZATION_VERIFIED',
  'SELLER_VARIANT_INVENTORY_ENABLED', 'SELLER_VARIANT_INVENTORY_CONCURRENCY_VERIFIED',
  'CUSTOMER_VARIANT_BROWSING_ENABLED', 'CUSTOMER_VARIANT_PURCHASING_ENABLED',
  'CUSTOMER_VARIANT_RESERVATION_CONCURRENCY_VERIFIED', 'CUSTOMER_VARIANT_PAYMENT_RECONCILIATION_VERIFIED',
  'CUSTOMER_VARIANT_AUTHORIZATION_VERIFIED'
];

test('isolated replica set enforces exact-variant reservation concurrency and idempotency', {
  skip: !configuredUri && 'MONGODB_TRANSACTION_TEST_URI is not configured'
}, async () => {
  const parsed = new URL(configuredUri);
  assert.equal(parsed.protocol, 'mongodb:');
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.port, '27018');
  assert.equal(parsed.searchParams.get('replicaSet'), 'pawzzleTestRS');
  parsed.pathname = `/pawzzle_variant_checkout_${crypto.randomBytes(7).toString('hex')}`;
  flags.forEach(flag => { process.env[flag] = 'true'; });
  mongoose.set('autoIndex', false);
  await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000, autoIndex: false });
  try {
    await Promise.all([
      ProductVariant.syncIndexes(), Inventory.syncIndexes(), InventoryLot.syncIndexes(),
      InventoryTransaction.syncIndexes(), InventoryReservation.syncIndexes(), SkuClaim.syncIndexes()
    ]);
    const store = id();
    const seller = id();
    const customerA = id();
    const customerB = id();
    const product = await Product.create({
      productMode: 'variant', name: 'Checkout food', category: 'food', description: 'Food', shortDescription: 'Food',
      price: 120, stockQuantity: 0, stockStatus: 'out_of_stock', sku: `PARENT-${crypto.randomUUID()}`,
      images: ['/food.jpg'], addedBy: seller, store, visibility: 'published', isActive: true,
      weight: 1, weightUnit: 'kg'
    });
    const variant = await ProductVariant.create({
      product: product._id, attributes: [{ code: 'flavor', label: 'Flavor', valueCode: 'beef', valueLabel: 'Beef' }],
      sku: `BEEF-${crypto.randomUUID()}`, price: 145, weight: 1, weightUnit: 'kg'
    });
    await claimSku({ namespaceType: 'store', owner: store, sku: product.sku, entityType: 'product', entity: product._id });
    await claimSku({ namespaceType: 'store', owner: store, sku: variant.sku, entityType: 'product_variant', entity: variant._id });
    await Inventory.create({ store, product: product._id, productVariant: variant._id, quantity: 1, reservedQuantity: 0 });

    const makeOrder = customer => new Order({
      customer, addedBy: seller, store, totalAmount: 145, deliveryMethod: 'pickup',
      items: [{ itemType: 'product', itemId: product._id, variantId: variant._id, name: 'Checkout food — Beef', price: 145, quantity: 1 }]
    });
    const orderA = makeOrder(customerA);
    const orderB = makeOrder(customerB);
    const reserve = (order, customer) => mongoose.connection.transaction(session => reserveOrderItems({ order, customerId: customer, session }));
    const competed = await Promise.allSettled([reserve(orderA, customerA), reserve(orderB, customerB)]);
    assert.equal(competed.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(competed.filter(result => result.status === 'rejected').length, 1);
    const winningOrder = competed[0].status === 'fulfilled' ? orderA : orderB;
    const balance = await Inventory.findOne({ productVariant: variant._id });
    assert.equal(balance.quantity, 1);
    assert.equal(balance.reservedQuantity, 1);

    await consumeOrderReservations({ orderId: winningOrder._id, paymentId: 'pay_test_once' });
    await consumeOrderReservations({ orderId: winningOrder._id, paymentId: 'pay_test_once' });
    const consumed = await Inventory.findOne({ productVariant: variant._id });
    assert.equal(consumed.quantity, 0);
    assert.equal(consumed.reservedQuantity, 0);

    await Inventory.updateOne({ productVariant: variant._id }, { $set: { quantity: 1, reservedQuantity: 0 } });
    const releaseOrder = makeOrder(customerA);
    await reserve(releaseOrder, customerA);
    await releaseOrderReservations({ orderId: releaseOrder._id, reason: 'test cancellation' });
    await releaseOrderReservations({ orderId: releaseOrder._id, reason: 'duplicate cancellation' });
    const released = await Inventory.findOne({ productVariant: variant._id });
    assert.equal(released.quantity, 1);
    assert.equal(released.reservedQuantity, 0);
  } finally {
    flags.forEach(flag => { delete process.env[flag]; });
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
