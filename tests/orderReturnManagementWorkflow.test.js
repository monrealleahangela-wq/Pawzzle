const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const axios = require('axios');

const OrderReturn = require('../models/OrderReturn');
const Delivery = require('../models/Delivery');
const Notification = require('../models/Notification');
const PayMongo = require('../services/paymongoService');
const { calculateRefundBreakdown } = require('../services/orderReturnLifecycleService');

const source = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

test('return cases store item-specific evidence, decisions, missions, refund idempotency, and audit history', () => {
  for (const field of [
    'caseId', 'orderItem', 'issueType', 'requestedResolution', 'evidence', 'decision.outcome',
    'pickup.delivery', 'pickup.verificationCode', 'inspection.outcome', 'refund.idempotencyKey',
    'refund.providerRefundId', 'refund.providerPaymentId', 'refund.providerStatus', 'refund.providerAttempt',
    'replacement.delivery', 'dispute.adminDecision', 'history'
  ]) assert.ok(OrderReturn.schema.path(field), `missing ${field}`);
  const statuses = OrderReturn.schema.path('status').options.enum;
  for (const status of ['issue_reported','return_approved_awaiting_pickup','under_inspection','refund_processing','replacement_delivered','disputed','resolved']) {
    assert.ok(statuses.includes(status), `missing status ${status}`);
  }
  const indexes = new Map(OrderReturn.schema.indexes().map(([keys, options]) => [options.name, keys]));
  assert.deepEqual(indexes.get('order_return_item_unique'), { order: 1, orderItem: 1 });
  assert.ok(indexes.has('order_return_refund_idempotency_unique'));
  assert.ok(indexes.has('order_return_provider_refund_unique'));
});

test('return pickup and replacement reuse Delivery while staying separate from the original order delivery', () => {
  const lifecycle = source('services/orderReturnLifecycleService.js');
  assert.ok(Delivery.schema.path('returnCase'));
  assert.deepEqual(Delivery.schema.path('missionType').options.enum, ['standard','return_pickup','replacement']);
  const index = Delivery.schema.indexes().find(([, options]) => options.name === 'return_case_mission_unique');
  assert.ok(index);
  assert.equal(index[1].unique, true);
  assert.deepEqual(index[1].partialFilterExpression.missionType.$in, ['return_pickup','replacement']);
  assert.doesNotMatch(lifecycle, /assignDelivery\(\{ deliveryId/);
  assert.match(lifecycle, /waiting for the Store to select an available Rider/);
  assert.match(lifecycle, /syncReturnMissionAssignment/);
});

test('refund calculation includes product amount and only returns shipping for a full single-product return', () => {
  const itemId = '507f1f77bcf86cd799439011';
  const record = { orderItem: itemId, requestedQuantity: 2, itemSnapshot: { unitPrice: 125 }, inspection: {} };
  const full = calculateRefundBreakdown(record, {
    items: [{ _id: itemId, itemType: 'product', quantity: 2 }], shippingFee: 40, totalAmount: 300
  }, 10);
  assert.deepEqual(full, { productAmount: 250, shippingAmount: 40, otherEligibleCharges: 10, amount: 300 });
  const partial = calculateRefundBreakdown({ ...record, requestedQuantity: 1 }, {
    items: [{ _id: itemId, itemType: 'product', quantity: 2 }], shippingFee: 40, totalAmount: 300
  });
  assert.deepEqual(partial, { productAmount: 125, shippingAmount: 0, otherEligibleCharges: 0, amount: 125 });
});

test('authenticated routes cover every role handoff and accept multipart evidence', () => {
  const routes = source('routes/orderReturns.js');
  for (const endpoint of [
    "'/store'", "'/admin'", "'/order/:orderId'", "'/:id/pickup/schedule'", "'/:id/pickup-code'",
    "'/:id/confirm-received'", "'/:id/inspect'", "'/:id/final-resolution'", "'/:id/replacement/prepare'",
    "'/:id/customer-confirm'", "'/:id/dispute'", "'/:id/admin-decision'", "'/:id/process-refund'", "'/:id/refund-result'"
  ]) assert.match(routes, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(routes, /uploadReturnEvidence/);
  assert.match(routes, /router\.use\(authenticate\)/);
});

test('approved refunds use PayMongo idempotently and reconcile signed provider updates', () => {
  const paymongo = source('services/paymongoService.js');
  const lifecycle = source('services/orderReturnLifecycleService.js');
  const paymentController = source('controllers/paymentController.js');
  const customerCase = source('client/src/pages/shared/ReturnCaseDetail.js');
  assert.match(paymongo, /PAYMONGO_BASE_URL}\/refunds/);
  assert.match(paymongo, /'Idempotency-Key': idempotencyKey/);
  assert.match(lifecycle, /reason: 'requested_by_customer'/);
  assert.match(lifecycle, /order_return_id: String\(claimed\._id\)/);
  assert.match(lifecycle, /providerAttempt \|\| 1/);
  assert.match(paymentController, /eventType === 'payment\.refund\.updated'/);
  assert.match(customerCase, /Process PayMongo Refund/);
});

test('PayMongo refund requests use centavos, the paid payment identity, and an idempotency header', async () => {
  const previousKey = process.env.PAYMONGO_SECRET_KEY;
  const previousPost = axios.post;
  process.env.PAYMONGO_SECRET_KEY = 'sk_test_return_workflow';
  axios.post = async (url, body, config) => {
    assert.equal(url, 'https://api.paymongo.com/v1/refunds');
    assert.equal(body.data.attributes.amount, 12500);
    assert.equal(body.data.attributes.payment_id, 'pay_test_order');
    assert.equal(config.headers['Idempotency-Key'], 'return-case-v1');
    assert.match(config.headers.Authorization, /^Basic /);
    return { data: { data: { id: 'ref_test_case', type: 'refund', attributes: { status: 'pending' } } } };
  };
  try {
    const refund = await PayMongo.createRefund({ amount: 12500, payment_id: 'pay_test_order', reason: 'requested_by_customer' }, 'return-case-v1');
    assert.equal(refund.id, 'ref_test_case');
  } finally {
    axios.post = previousPost;
    if (previousKey === undefined) delete process.env.PAYMONGO_SECRET_KEY;
    else process.env.PAYMONGO_SECRET_KEY = previousKey;
  }
});

test('return notifications and role dashboards navigate to the shared authoritative case', () => {
  assert.ok(Notification.schema.path('relatedModel').options.enum.includes('OrderReturn'));
  assert.match(source('client/src/utils/notificationNavigation.js'), /relatedModel === 'OrderReturn'/);
  assert.match(source('client/src/pages/customer/Orders.js'), /Report an Issue/);
  assert.match(source('client/src/pages/customer/Orders.js'), /View Return\/Refund Case/);
  assert.match(source('client/src/components/admin/RiderDashboard.js'), /Return pickup/);
  assert.match(source('client/src/pages/shared/ReturnsManagement.js'), /Returns & Refunds/);
});

test('migration is guarded and declares production-critical indexes', () => {
  const migration = source('scripts/migrateOrderReturnManagement.js');
  assert.match(migration, /ORDER_RETURN_MIGRATION_APPROVED/);
  assert.match(migration, /ORDER_RETURN_MIGRATION_EXPECTED_DB/);
  assert.match(migration, /return_case_mission_unique/);
  assert.match(migration, /order_return_refund_idempotency_unique/);
  assert.match(migration, /order_return_provider_refund_unique/);
});
