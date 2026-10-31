const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

const Inventory = require('../models/Inventory');
const InventoryLot = require('../models/InventoryLot');
const InventoryTransaction = require('../models/InventoryTransaction');
const InventoryReservation = require('../models/InventoryReservation');
const Order = require('../models/Order');
const OrderReturn = require('../models/OrderReturn');
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const SkuClaim = require('../models/SkuClaim');
const InventoryLedgerService = require('../services/inventoryLedgerService');
const { claimSku } = require('../services/skuClaimService');
const { restoreCancelledVariantStock } = require('../services/variantOrderLifecycleService');
const { processExpiredReservationBatch } = require('../services/reservationExpirationJobService');
const { inspectVariantReturn } = require('../services/orderReturnLifecycleService');

const configuredUri = process.env.MONGODB_TRANSACTION_TEST_URI;
const id = () => new mongoose.Types.ObjectId();
const lifecycleFlags = [
  'SELLER_VARIANTS_ENABLED', 'SELLER_VARIANTS_CONCURRENCY_VERIFIED', 'SELLER_VARIANTS_AUTHORIZATION_VERIFIED',
  'SELLER_VARIANT_INVENTORY_ENABLED', 'SELLER_VARIANT_INVENTORY_CONCURRENCY_VERIFIED',
  'CUSTOMER_VARIANT_BROWSING_ENABLED', 'CUSTOMER_VARIANT_PURCHASING_ENABLED',
  'CUSTOMER_VARIANT_RESERVATION_CONCURRENCY_VERIFIED', 'CUSTOMER_VARIANT_PAYMENT_RECONCILIATION_VERIFIED',
  'CUSTOMER_VARIANT_AUTHORIZATION_VERIFIED', 'CUSTOMER_VARIANT_FULFILLMENT_ENABLED',
  'CUSTOMER_VARIANT_CANCELLATION_ENABLED', 'CUSTOMER_VARIANT_RETURNS_ENABLED',
  'CUSTOMER_VARIANT_RESTOCK_IDEMPOTENCY_VERIFIED', 'CUSTOMER_VARIANT_FULFILLMENT_AUTHORIZATION_VERIFIED',
  'CUSTOMER_VARIANT_RESERVATION_EXPIRY_JOB_VERIFIED'
];

test('two expiration workers release each exact reservation once', {
  skip: !configuredUri && 'MONGODB_TRANSACTION_TEST_URI is not configured'
}, async () => {
  const parsed = new URL(configuredUri);
  assert.equal(parsed.protocol, 'mongodb:');
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.port, '27018');
  assert.equal(parsed.searchParams.get('replicaSet'), 'pawzzleTestRS');
  parsed.pathname = `/pawzzle_variant_lifecycle_${crypto.randomBytes(7).toString('hex')}`;
  mongoose.set('autoIndex', false);
  await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000, autoIndex: false });
  try {
    await Promise.all([Inventory.syncIndexes(), InventoryReservation.syncIndexes()]);
    const store = id();
    const product = id();
    const variant = id();
    const orderA = id();
    const orderB = id();
    const customer = id();
    await Inventory.create({ store, product, productVariant: variant, quantity: 4, reservedQuantity: 4 });
    await InventoryReservation.create([
      { reservationKey: `expiry-${crypto.randomUUID()}`, customer, order: orderA, store, product, productVariant: variant, quantity: 2, expiresAt: new Date(Date.now() - 1000) },
      { reservationKey: `expiry-${crypto.randomUUID()}`, customer, order: orderB, store, product, productVariant: variant, quantity: 2, expiresAt: new Date(Date.now() - 1000) }
    ]);
    const [first, second] = await Promise.all([
      processExpiredReservationBatch({ limit: 10 }),
      processExpiredReservationBatch({ limit: 10 })
    ]);
    assert.equal(first.expired + second.expired, 2);
    assert.equal(first.errors.length + second.errors.length, 0);
    const balance = await Inventory.findOne({ store, product, productVariant: variant });
    assert.equal(balance.quantity, 4);
    assert.equal(balance.reservedQuantity, 0);
    assert.equal(await InventoryReservation.countDocuments({ status: 'expired' }), 2);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test('refunded cancellation restores consumed exact-variant stock once', {
  skip: !configuredUri && 'MONGODB_TRANSACTION_TEST_URI is not configured'
}, async () => {
  const parsed = new URL(configuredUri);
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.port, '27018');
  assert.equal(parsed.searchParams.get('replicaSet'), 'pawzzleTestRS');
  parsed.pathname = `/pawzzle_variant_cancellation_${crypto.randomBytes(7).toString('hex')}`;
  lifecycleFlags.forEach(flag => { process.env[flag] = 'true'; });
  mongoose.set('autoIndex', false);
  await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000, autoIndex: false });
  try {
    await Promise.all([
      ProductVariant.syncIndexes(), Inventory.syncIndexes(), InventoryLot.syncIndexes(),
      InventoryTransaction.syncIndexes(), InventoryReservation.syncIndexes(),
      OrderReturn.syncIndexes(), SkuClaim.syncIndexes()
    ]);
    const store = id();
    const seller = id();
    const customer = id();
    const product = await Product.create({
      productMode: 'variant', name: 'Lifecycle food', category: 'food', description: 'Food', shortDescription: 'Food',
      price: 200, stockQuantity: 0, stockStatus: 'out_of_stock', sku: `PARENT-${crypto.randomUUID()}`,
      images: ['/food.jpg'], addedBy: seller, store, visibility: 'published', isActive: true,
      weight: 1, weightUnit: 'kg'
    });
    const variant = await ProductVariant.create({
      product: product._id,
      attributes: [{ code: 'flavor', label: 'Flavor', valueCode: 'beef', valueLabel: 'Beef' }],
      sku: `BEEF-${crypto.randomUUID()}`, price: 225, weight: 1, weightUnit: 'kg'
    });
    await claimSku({ namespaceType: 'store', owner: store, sku: product.sku, entityType: 'product', entity: product._id });
    await claimSku({ namespaceType: 'store', owner: store, sku: variant.sku, entityType: 'product_variant', entity: variant._id });
    await InventoryLot.create({
      store, product: product._id, productVariant: variant._id, lotNumber: 'ORIGINAL-LOT',
      quantityReceived: 2, quantityAvailable: 2, createdBy: seller
    });
    await Inventory.create({ store, product: product._id, productVariant: variant._id, quantity: 2, reservedQuantity: 0 });
    const order = await Order.create({
      customer, addedBy: seller, store, totalAmount: 225, deliveryMethod: 'pickup', phoneNumber: '09171234567',
      paymentMethod: 'paymongo', paymentStatus: 'refunded', status: 'cancelled',
      items: [{
        itemType: 'product', itemId: product._id, variantId: variant._id, name: 'Lifecycle food', price: 225, quantity: 1,
        variantSnapshot: {
          sku: variant.sku, retailUnitPrice: 225,
          attributes: [{ code: 'flavor', label: 'Flavor', valueCode: 'beef', valueLabel: 'Beef' }]
        }
      }]
    });
    const reservation = await InventoryReservation.create({
      reservationKey: `consumed-${crypto.randomUUID()}`, customer, order: order._id, store,
      product: product._id, productVariant: variant._id, quantity: 1, status: 'consumed',
      expiresAt: new Date(Date.now() + 60000), consumedAt: new Date(), paymentId: 'pay_refunded'
    });
    await mongoose.connection.transaction(session => InventoryLedgerService.issueReservedVariantInSession({
      store, product: product._id, productVariant: variant._id, quantity: 1,
      order: order._id, orderItem: order.items[0]._id, performedBy: customer,
      idempotencyKey: `order-variant-sale:${order._id}:${reservation._id}`
    }, session));
    assert.equal((await Inventory.findOne({ productVariant: variant._id })).quantity, 1);
    const first = await restoreCancelledVariantStock({ orderId: order._id, actorId: seller });
    const retry = await restoreCancelledVariantStock({ orderId: order._id, actorId: seller });
    assert.equal(first.restored, 1);
    assert.equal(retry.restored, 0);
    assert.equal((await Inventory.findOne({ productVariant: variant._id })).quantity, 2);
    assert.equal(await InventoryTransaction.countDocuments({ type: 'return_in', referenceId: order.items[0]._id }), 1);
  } finally {
    lifecycleFlags.forEach(flag => { delete process.env[flag]; });
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test('physical return inspection restocks only the accepted resellable variant once', {
  skip: !configuredUri && 'MONGODB_TRANSACTION_TEST_URI is not configured'
}, async () => {
  const parsed = new URL(configuredUri);
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.port, '27018');
  assert.equal(parsed.searchParams.get('replicaSet'), 'pawzzleTestRS');
  parsed.pathname = `/pawzzle_variant_return_${crypto.randomBytes(7).toString('hex')}`;
  lifecycleFlags.forEach(flag => { process.env[flag] = 'true'; });
  mongoose.set('autoIndex', false);
  await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000, autoIndex: false });
  try {
    await Promise.all([
      ProductVariant.syncIndexes(), Inventory.syncIndexes(), InventoryLot.syncIndexes(),
      InventoryTransaction.syncIndexes(), InventoryReservation.syncIndexes(),
      OrderReturn.syncIndexes(), SkuClaim.syncIndexes()
    ]);
    const store = id();
    const seller = id();
    const customer = id();
    const product = await Product.create({
      productMode: 'variant', name: 'Return food', category: 'food', description: 'Food', shortDescription: 'Food',
      price: 300, stockQuantity: 0, stockStatus: 'out_of_stock', sku: `RETURN-PARENT-${crypto.randomUUID()}`,
      images: ['/return-food.jpg'], addedBy: seller, store, visibility: 'published', isActive: true,
      weight: 1, weightUnit: 'kg'
    });
    const variant = await ProductVariant.create({
      product: product._id,
      attributes: [{ code: 'flavor', label: 'Flavor', valueCode: 'salmon', valueLabel: 'Salmon' }],
      sku: `RETURN-SALMON-${crypto.randomUUID()}`, price: 325, weight: 1, weightUnit: 'kg'
    });
    await claimSku({ namespaceType: 'store', owner: store, sku: product.sku, entityType: 'product', entity: product._id });
    await claimSku({ namespaceType: 'store', owner: store, sku: variant.sku, entityType: 'product_variant', entity: variant._id });
    const order = await Order.create({
      customer, addedBy: seller, store, totalAmount: 650, deliveryMethod: 'pickup', phoneNumber: '09171234567',
      paymentMethod: 'paymongo', paymentStatus: 'paid', status: 'delivered',
      items: [{
        itemType: 'product', itemId: product._id, variantId: variant._id, name: 'Return food', price: 325, quantity: 2,
        variantSnapshot: {
          sku: variant.sku, retailUnitPrice: 325,
          attributes: [{ code: 'flavor', label: 'Flavor', valueCode: 'salmon', valueLabel: 'Salmon' }]
        }
      }]
    });
    const record = await OrderReturn.create({
      order: order._id, orderItem: order.items[0]._id, customer, store,
      itemSnapshot: {
        parentProduct: product._id, productVariant: variant._id, name: 'Return food', sku: variant.sku,
        attributes: order.items[0].variantSnapshot.attributes, unitPrice: 325, purchasedQuantity: 2
      },
      requestedQuantity: 2, reason: 'One sealed unit can be resold.', status: 'received',
      history: [{ action: 'received', toStatus: 'received', actor: seller }]
    });
    const platformAdmin = { _id: seller, role: 'super_admin' };
    const first = await inspectVariantReturn({
      user: platformAdmin, returnId: record._id, acceptedQuantity: 2, resellableQuantity: 1, note: 'One sealed; one damaged.'
    });
    const retry = await inspectVariantReturn({
      user: platformAdmin, returnId: record._id, acceptedQuantity: 2, resellableQuantity: 1, note: 'Retry.'
    });
    await assert.rejects(
      inspectVariantReturn({
        user: platformAdmin, returnId: record._id, acceptedQuantity: 2, resellableQuantity: 2, note: 'Unsafe change.'
      }),
      error => error.code === 'RETURN_NOT_RECEIVED'
    );
    assert.equal(first.status, 'refund_pending');
    assert.equal(retry.status, 'refund_pending');
    assert.equal((await Inventory.findOne({ productVariant: variant._id })).quantity, 1);
    assert.equal(await InventoryTransaction.countDocuments({ type: 'return_in', referenceId: order.items[0]._id }), 1);
  } finally {
    lifecycleFlags.forEach(flag => { delete process.env[flag]; });
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
