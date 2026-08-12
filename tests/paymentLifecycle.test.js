const test = require('node:test');
const assert = require('node:assert/strict');
const { amountCentavos, markSessionFailed } = require('../services/paymentReconciliationService');
const RevenueService = require('../services/revenueService');
const PayMongo = require('../services/paymongoService');
const axios = require('axios');
const Pet = require('../models/Pet');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const Store = require('../models/Store');
const adminOrderRoutes = require('../routes/adminOrders');
const adminBookingRoutes = require('../routes/adminBookings');
const adoptionRoutes = require('../routes/adoption');

const routePaths = router => router.stack.filter(layer => layer.route).map(layer => layer.route.path);

test('uses the authoritative order and booking totals in centavos', () => {
  assert.equal(amountCentavos({ totalAmount: 1299.95 }, 'order'), 129995);
  assert.equal(amountCentavos({ totalPrice: 749.5 }, 'booking'), 74950);
});

test('charges an adoption deposit first and only the remaining balance afterward', () => {
  const initial = {
    paymentDetails: {
      paidAmount: 0,
      pricingBreakdown: { totalPrice: 10000, depositAmount: 2500 }
    }
  };
  const remaining = {
    paymentDetails: {
      paidAmount: 2500,
      pricingBreakdown: { totalPrice: 10000, depositAmount: 2500 }
    }
  };
  assert.equal(amountCentavos(initial, 'adoption'), 250000);
  assert.equal(amountCentavos(remaining, 'adoption'), 750000);
});

test('generates a stable idempotency key for retries of one logical checkout session', () => {
  const first = PayMongo.buildCheckoutIdempotencyKey('order', '507f1f77bcf86cd799439011', 1);
  assert.equal(first, PayMongo.buildCheckoutIdempotencyKey('order', '507f1f77bcf86cd799439011', 1));
  assert.notEqual(first, PayMongo.buildCheckoutIdempotencyKey('order', '507f1f77bcf86cd799439011', 2));
});

test('new pet listings default to PayMongo-only payment configuration', () => {
  const pet = new Pet();
  assert.equal(pet.paymentType, 'online_only');
  assert.deepEqual(pet.allowedPaymentMethods, ['paymongo']);
});

test('manual payment confirmation and mutation APIs are no longer exposed', () => {
  assert.equal(routePaths(adminOrderRoutes).some(path => path.includes('confirm-payment')), false);
  assert.equal(routePaths(adminBookingRoutes).some(path => path.includes('confirm-payment') || path.includes('payment-method')), false);
  assert.equal(routePaths(adoptionRoutes).some(path => path.includes('payment-status')), false);
});

test('PayMongo creation sends the idempotency key and cancellation expires the same session', async () => {
  const originalPost = axios.post;
  const originalKey = process.env.PAYMONGO_SECRET_KEY;
  const calls = [];
  process.env.PAYMONGO_SECRET_KEY = 'sk_test_unit';
  axios.post = async (url, data, config) => {
    calls.push({ url, data, config });
    return { data: { data: { id: 'cs_test', attributes: { checkout_url: 'https://checkout.test', status: 'active' } } } };
  };
  try {
    await PayMongo.createCheckoutSession({ line_items: [] }, 'stable-key');
    await PayMongo.expireCheckoutSession('cs_test');
    assert.equal(calls[0].config.headers['Idempotency-Key'], 'stable-key');
    assert.match(calls[1].url, /checkout_sessions\/cs_test\/expire$/);
    assert.equal(calls[1].config.headers['Idempotency-Key'], 'expire-cs_test');
  } finally {
    axios.post = originalPost;
    if (originalKey === undefined) delete process.env.PAYMONGO_SECRET_KEY;
    else process.env.PAYMONGO_SECRET_KEY = originalKey;
  }
});

test('only a paid PayMongo payment is selected for reconciliation', () => {
  const session = { attributes: { payments: [
    { id: 'pay_failed', attributes: { status: 'failed' } },
    { id: 'pay_paid', attributes: { status: 'paid' } }
  ] } };
  assert.equal(PayMongo.getPaidPayment(session).id, 'pay_paid');
  assert.equal(PayMongo.getPaidPayment({ attributes: { payments: [] } }), undefined);
});

test('concurrent revenue reconciliation increments store finance aggregates once', async () => {
  const originals = {
    orderFind: Order.findById,
    orderUpdate: Order.findOneAndUpdate,
    storeUpdate: Store.findByIdAndUpdate
  };
  let claimed = false;
  let storeIncrements = 0;
  Order.findById = async () => ({
    _id: 'order-1', totalAmount: 1120, pricingBreakdown: { vatAmount: 120 },
    store: 'store-1', isRevenueRecorded: false
  });
  Order.findOneAndUpdate = async () => {
    if (claimed) return null;
    claimed = true;
    return { _id: 'order-1', isRevenueRecorded: true };
  };
  Store.findByIdAndUpdate = async () => { storeIncrements += 1; };
  try {
    await Promise.all([
      RevenueService.recordPayment('order', 'order-1'),
      RevenueService.recordPayment('order', 'order-1')
    ]);
    assert.equal(storeIncrements, 1);
  } finally {
    Order.findById = originals.orderFind;
    Order.findOneAndUpdate = originals.orderUpdate;
    Store.findByIdAndUpdate = originals.storeUpdate;
  }
});

test('failed booking reconciliation never records paid revenue', async () => {
  const originals = { findOne: Booking.findOne, update: Booking.findByIdAndUpdate };
  let update;
  Booking.findOne = async () => ({ _id: 'booking-1', paymentStatus: 'pending' });
  Booking.findByIdAndUpdate = async (_id, payload) => { update = payload; };
  try {
    await markSessionFailed({ id: 'cs_failed', attributes: {} });
    assert.equal(update.$set.paymentStatus, 'failed');
    assert.equal(update.$set.paymentMethod, 'paymongo');
  } finally {
    Booking.findOne = originals.findOne;
    Booking.findByIdAndUpdate = originals.update;
  }
});
