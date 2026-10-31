const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Cart = require('../models/Cart');
const Inventory = require('../models/Inventory');
const InventoryReservation = require('../models/InventoryReservation');
const Order = require('../models/Order');
const { subtractPurchasedItems } = require('../services/checkoutCartService');
const { snapshotProductWeight } = require('../services/parcelWeightService');
const { getCustomerVariantReadiness } = require('../services/customerVariantReadinessService');

const source = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

test('cart and order schemas retain exact normalized variant identity and immutable snapshots', () => {
  assert.ok(Cart.schema.path('items').schema.path('productVariant'));
  assert.ok(Cart.schema.path('items').schema.path('variantSnapshot.sku'));
  assert.ok(Order.schema.path('items').schema.path('variantId'));
  assert.ok(Order.schema.path('items').schema.path('variantSnapshot.retailUnitPrice'));
});
test('cart cleanup separates two variants of the same parent product', () => {
  const parent = '507f1f77bcf86cd799439011';
  const chicken = '507f1f77bcf86cd799439012';
  const beef = '507f1f77bcf86cd799439013';
  const cart = [
    { itemType: 'product', itemId: parent, productVariant: chicken, quantity: 2 },
    { itemType: 'product', itemId: parent, productVariant: beef, quantity: 3 }
  ];
  const remaining = subtractPurchasedItems(cart, [{ items: [
    { itemType: 'product', itemId: parent, variantId: chicken, quantity: 1 }
  ] }]);
  assert.equal(remaining.length, 2);
  assert.equal(remaining.find(item => item.productVariant === chicken).quantity, 1);
  assert.equal(remaining.find(item => item.productVariant === beef).quantity, 3);
});

test('normalized variant weight is captured independently of the parent', () => {
  const snapshot = snapshotProductWeight(
    { weight: 5, weightUnit: 'kg', updatedAt: new Date() },
    { variantId: 'variant-1', normalizedVariant: { weight: 250, weightUnit: 'g', weightIncludesPackaging: true } }
  );
  assert.equal(snapshot.productWeightMilligrams, 250000);
  assert.equal(snapshot.source, 'normalized_variant');
});

test('reservation storage is exact-variant and production-safe by default', () => {
  assert.ok(Inventory.schema.path('reservedQuantity'));
  assert.ok(InventoryReservation.schema.path('productVariant'));
  assert.equal(InventoryReservation.schema.options.autoIndex, process.env.NODE_ENV !== 'production');
  const indexes = new Map(InventoryReservation.schema.indexes().map(([key, options]) => [options.name, { key, options }]));
  assert.equal(indexes.get('inventory_reservation_key_unique').options.unique, true);
  assert.deepEqual(indexes.get('inventory_reservation_expiry').key, { status: 1, expiresAt: 1 });
});

test('customer variant purchasing is fail-closed without a verified database and flags', async () => {
  const readiness = await getCustomerVariantReadiness();
  assert.equal(readiness.purchasingEnabled, false);
  assert.ok(readiness.reasons.some(reason => /MongoDB is not connected|not true|not verified/i.test(reason)));
});

test('payment initiation requires a reservation for normalized variant orders', () => {
  const paymentController = source('controllers/paymentController.js');
  const reservationService = source('services/inventoryReservationService.js');
  assert.match(paymentController, /requireReservation:\s*order\.items\.some/);
  assert.match(reservationService, /VARIANT_RESERVATION_REQUIRED/);
});

test('checkout, payment, and reconciliation use exact variant authority', () => {
  assert.match(source('services/orderPricingService.js'), /resolveCustomerProductSelection/);
  assert.match(source('controllers/orderController.js'), /reserveOrderItems/);
  assert.match(source('controllers/paymentController.js'), /assertOrderReservationsPayable/);
  assert.match(source('services/paymentReconciliationService.js'), /consumeOrderReservations/);
  assert.match(source('controllers/orderController.js'), /variantId: item\.variantId \? String\(item\.variantId\)/);
  assert.match(source('client/src/pages/customer/Checkout.js'), /productVariant \|\| item\.variantId/);
});
