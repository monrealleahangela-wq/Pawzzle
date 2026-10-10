const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

process.env.JWT_SECRET ||= 'test-only-jwt-secret';

const Delivery = require('../models/Delivery');
const Order = require('../models/Order');
const Review = require('../models/Review');
const { __test: deliveryTest } = require('../controllers/deliveryController');
const { buildParcelEstimate, productWeightKg } = require('../services/orderPricingService');
const { normalizeProductWeight } = require('../utils/catalogListing');

const source = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('valid product weights produce a quantity-aware order parcel estimate', () => {
  assert.equal(productWeightKg({ weight: 750, weightUnit: 'g' }), 0.75);
  assert.equal(productWeightKg({ weight: 2, weightUnit: 'kg' }), 2);
  const estimate = buildParcelEstimate([
    { itemType: 'product', unitWeightKg: 0.75, quantity: 2 },
    { itemType: 'product', unitWeightKg: 2, quantity: 1 }
  ]);
  assert.equal(estimate.weightKg, 3.5);
  assert.equal(estimate.parcelCount, 1);
  assert.equal(estimate.source, 'product_weight_snapshot');
  assert.throws(() => normalizeProductWeight('', 'kg', { required: true }), /required before a product can be offered for delivery/);
});

test('order and delivery schemas retain authoritative weight and confirmation provenance', () => {
  assert.ok(Order.schema.path('items.unitWeightKg'));
  assert.ok(Order.schema.path('parcelEstimate.weightKg'));
  assert.ok(Delivery.schema.path('parcel.measurementSource'));
  assert.ok(Delivery.schema.path('proofOfDelivery.recipientName'));
});

test('proof contract stores recipient acknowledgment without fabricating signature evidence', () => {
  const delivery = new Delivery({
    status: 'arrived', assignmentType: 'internal',
    assignedRider: new mongoose.Types.ObjectId(), riderName: 'Rider Test'
  });
  const proof = deliveryTest.buildProofOfDelivery({ recipientName: 'Jamie Recipient' }, delivery);
  assert.equal(proof.recipientName, 'Jamie Recipient');
  assert.equal(proof.method, 'recipient_acknowledgment');
  assert.equal(proof.signature, undefined);
});

test('Rider notification deep-links and both message panels use the shared viewport portal', () => {
  const controller = source('controllers/deliveryController.js');
  const tracking = source('client/src/pages/DeliveryTracking.js');
  const workspace = source('client/src/components/delivery/RiderDeliveryWorkspace.js');
  assert.match(controller, /\/track\/\$\{delivery\.trackingToken\}\?messages=open/);
  assert.match(tracking, /get\('messages'\) === 'open'/);
  assert.match(tracking, /<ModalViewport[\s\S]*customer-delivery-chat-title/);
  assert.match(workspace, /<ModalViewport[\s\S]*rider-chat-title/);
  assert.match(workspace, /<ConfirmationDialog/);
  assert.doesNotMatch(workspace, /window\.confirm/);
});

test('order feedback is exact-order scoped and duplicate order review protection is indexed', () => {
  const controller = source('controllers/reviewController.js');
  const detail = source('client/src/pages/customer/OrderDetail.js');
  const indexes = Review.schema.indexes();
  assert.match(controller, /if \(orderId\) reviewFilter\.orderId = orderId/);
  assert.match(controller, /Review\.exists\(\{ user: userId, orderId: sourceOrder\._id \}\)/);
  assert.ok(indexes.some(([fields, options]) => fields.user === 1 && fields.orderId === 1 && options.unique));
  assert.match(detail, /String\(review\.orderId\) === String\(orderData\._id\)/);
  assert.doesNotMatch(detail, /review\.customer\?\._id === orderData\.customer/);
  assert.match(detail, /Review Submitted/);
});

test('empty payslip UI distinguishes pending external payment recording from no payroll record', () => {
  const controller = source('controllers/hrController.js');
  const employee = source('client/src/pages/staff/EmployeeHR.js');
  const management = source('client/src/pages/admin/HRManagement.js');
  assert.match(controller, /awaiting_payment_record/);
  assert.match(employee, /A payroll snapshot exists/);
  assert.match(management, /external\/manual payment/);
  assert.match(management, /will not initiate a bank transfer/);
});

test('light-mode profile and Access Portal catalog retain responsive readable controls', () => {
  const globalCss = source('client/src/styles/Global.css');
  const login = source('client/src/pages/auth/Login.js');
  const landing = source('client/src/styles/Landing.css');
  assert.match(globalCss, /customer-profile-page \[class~="text-slate-300"\]/);
  assert.match(login, /min-h-\[100dvh\]/);
  assert.match(login, /account-recovery-title/);
  assert.match(landing, /@media \(max-width: 420px\)[\s\S]*landing-catalog-price/);
});
