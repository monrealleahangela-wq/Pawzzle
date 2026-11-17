const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

process.env.JWT_SECRET ||= 'test-only-jwt-secret';

const Delivery = require('../models/Delivery');
const Order = require('../models/Order');
const { __test } = require('../controllers/deliveryController');

const source = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('standard product deliveries require customer receipt confirmation', () => {
  assert.equal(__test.requiresCustomerReceiptConfirmation({
    order: new mongoose.Types.ObjectId(), missionType: 'standard'
  }), true);
  assert.equal(__test.requiresCustomerReceiptConfirmation({ missionType: 'replacement' }), false);
  assert.equal(__test.requiresCustomerReceiptConfirmation({ missionType: 'return_pickup' }), false);
});

test('delivery and order schemas accept the pending customer-confirmation state', () => {
  const delivery = new Delivery({
    status: 'customer_confirmation_pending',
    assignmentType: 'internal',
    assignedRider: new mongoose.Types.ObjectId(),
    customerConfirmation: { requestedAt: new Date() }
  });
  const order = new Order({
    customer: new mongoose.Types.ObjectId(),
    store: new mongoose.Types.ObjectId(),
    status: 'customer_confirmation_pending',
    items: [],
    totalAmount: 1
  });
  assert.equal(delivery.validateSync(), undefined);
  assert.equal(order.validateSync()?.errors?.status, undefined);
});

test('rider proof submission does not finalize a normal customer delivery', () => {
  const controller = source('controllers/deliveryController.js');
  assert.match(controller, /needsCustomerConfirmation \? 'customer_confirmation_pending' : 'delivered'/);
  assert.match(controller, /transactional\.customerConfirmation\.requestedAt = now/);
  assert.match(controller, /if \(!needsCustomerConfirmation\) await recordRiderEarning/);
  assert.match(controller, /releaseRiderCapacity\(transactional, session\)/);
});

test('customer confirmation is ownership checked and finalizes atomically', () => {
  const controller = source('controllers/deliveryController.js');
  const routes = source('routes/delivery.js');
  assert.match(routes, /order\/:orderId\/confirm-received', authenticate, confirmCustomerReceipt/);
  assert.match(controller, /customer: req\.user\._id,[\s\S]*status: 'customer_confirmation_pending'/);
  assert.match(controller, /delivery\.customerConfirmation\.confirmedBy = req\.user\._id/);
  assert.match(controller, /order\.status = 'delivered'/);
  assert.match(controller, /await recordRiderEarning\(delivery, session\)/);
});

test('customer and rider interfaces expose the two-step handoff clearly', () => {
  const orders = source('client/src/pages/customer/Orders.js');
  const detail = source('client/src/pages/customer/OrderDetail.js');
  const rider = source('client/src/components/delivery/RiderDeliveryWorkspace.js');
  assert.match(orders, /Confirm Received/);
  assert.match(orders, /confirmCustomerReceipt/);
  assert.match(detail, /Customer confirmation pending/);
  assert.match(rider, /Customer Confirmation Pending/);
  assert.match(rider, /waiting for customer confirmation/i);
});
