const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const InventoryReservation = require('../models/InventoryReservation');
const Order = require('../models/Order');
const OrderReturn = require('../models/OrderReturn');
const { applyItemFulfillmentStage, assertImmutableVariantItems, pickingInstructions } = require('../services/variantOrderLifecycleService');
const { getCustomerVariantLifecycleReadiness } = require('../services/customerVariantLifecycleReadinessService');

const source = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

test('order snapshots expose exact-variant fulfillment and return states', () => {
  const itemSchema = Order.schema.path('items').schema;
  assert.ok(itemSchema.path('variantSnapshot.sku'));
  assert.ok(itemSchema.path('variantSnapshot.attributes'));
  assert.ok(itemSchema.path('fulfillment.status'));
  assert.ok(itemSchema.path('returnStatus'));
});

test('fulfillment instructions use immutable variant snapshots without current catalog substitution', () => {
  const order = new Order({
    customer: '507f1f77bcf86cd799439011', addedBy: '507f1f77bcf86cd799439012',
    store: '507f1f77bcf86cd799439013', totalAmount: 250, deliveryMethod: 'pickup',
    items: [{
      itemType: 'product', itemId: '507f1f77bcf86cd799439014', variantId: '507f1f77bcf86cd799439015',
      name: 'Food', price: 250, quantity: 2,
      variantSnapshot: {
        sku: 'BEEF-1KG', retailUnitPrice: 250,
        attributes: [{ code: 'flavor', valueCode: 'beef', valueLabel: 'Beef' }]
      }
    }]
  });
  assert.doesNotThrow(() => assertImmutableVariantItems(order));
  const [instruction] = pickingInstructions(order);
  assert.equal(instruction.productVariant.toString(), '507f1f77bcf86cd799439015');
  assert.equal(instruction.sku, 'BEEF-1KG');
  assert.equal(instruction.quantity, 2);
  applyItemFulfillmentStage(order, 'ready_for_pickup', order.addedBy);
  assert.equal(order.items[0].fulfillment.status, 'packed');
  assert.ok(order.items[0].fulfillment.exactVariantVerifiedAt);
});

test('return cases preserve exact purchased variant and use idempotency indexes', () => {
  assert.ok(OrderReturn.schema.path('itemSnapshot.productVariant'));
  assert.ok(OrderReturn.schema.path('itemSnapshot.sku'));
  assert.ok(OrderReturn.schema.path('inspection.resellableQuantity'));
  const indexes = new Map(OrderReturn.schema.indexes().map(([key, options]) => [options.name, { key, options }]));
  assert.equal(indexes.get('order_return_item_unique').options.unique, true);
  assert.equal(indexes.get('order_return_restock_idempotency_unique').options.unique, true);
});

test('reservation expiration storage supports multi-instance leases', () => {
  assert.ok(InventoryReservation.schema.path('expirationLease.token'));
  const indexes = new Map(InventoryReservation.schema.indexes().map(([key, options]) => [options.name, key]));
  assert.deepEqual(indexes.get('inventory_reservation_worker_claim'), {
    status: 1, expiresAt: 1, 'expirationLease.expiresAt': 1
  });
  const worker = source('services/reservationExpirationJobService.js');
  assert.match(worker, /findOneAndUpdate/);
  assert.match(worker, /Math\.min\(200/);
  assert.doesNotMatch(worker, /setInterval|setTimeout/);
});

test('variant cancellation and return restocking are exact and retry-safe', () => {
  const ledger = source('services/inventoryLedgerService.js');
  const cancellation = source('services/variantOrderLifecycleService.js');
  const returns = source('services/orderReturnLifecycleService.js');
  assert.match(ledger, /productVariant/);
  assert.match(ledger, /idempotencyKey/);
  assert.match(cancellation, /cancelled-order-variant-restock/);
  assert.match(returns, /order-return-restock/);
  assert.doesNotMatch(cancellation, /stockQuantity/);
});

test('variant lifecycle remains fail-closed by default', async () => {
  const readiness = await getCustomerVariantLifecycleReadiness();
  assert.equal(readiness.fulfillmentEnabled, false);
  assert.equal(readiness.cancellationEnabled, false);
  assert.equal(readiness.returnsEnabled, false);
  assert.equal(readiness.expirationWorkerEnabled, false);
});

test('payment and order flows guard lifecycle races and parent-stock fallback', () => {
  const payment = source('services/paymentReconciliationService.js');
  const order = source('controllers/orderController.js');
  const delivery = source('services/deliveryAssignmentService.js');
  assert.match(payment, /status: cancelled \? 'cancelled' : \{ \$ne: 'cancelled' \}/);
  assert.match(payment, /refund review is required/);
  assert.match(order, /if \(!item\.variantId\) await StockSyncService\.reduceStockOnOrder/);
  assert.match(delivery, /restoreCancelledVariantStock/);
});

test('customer and store order surfaces render immutable variant details', () => {
  assert.match(source('client/src/utils/paymentSummary.js'), /variantSnapshot\?\.sku/);
  assert.match(source('client/src/pages/customer/OrderDetail.js'), /Selected variant/);
  assert.match(source('client/src/pages/customer/Orders.js'), /variantSnapshot\?\.attributes/);
  assert.match(source('client/src/pages/admin/Orders.js'), /variantSnapshot\?\.sku/);
});
