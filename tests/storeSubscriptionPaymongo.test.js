const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const responseRecorder = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

const loadController = mocks => {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === '../models/Store') return mocks.Store;
    if (request === '../models/StoreSubscriptionPayment') return mocks.Payment;
    if (request === '../services/paymongoService') return mocks.PayMongo;
    if (request === '../services/storeSubscriptionPaymentService') return mocks.subscriptionService;
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[require.resolve('../controllers/subscriptionController')];
  const controller = require('../controllers/subscriptionController');
  Module._load = originalLoad;
  return controller;
};

test('subscription checkout uses the server plan price and PayMongo metadata', async () => {
  let createdPayload;
  let checkoutAttributes;
  const purchase = {
    _id: '507f1f77bcf86cd799439011',
    targetTier: 'starter',
    planSnapshot: { name: 'Starter', termDays: 30 },
    amount: 299,
    amountCentavos: 29900,
    status: 'pending_payment',
    paymentDetails: {}
  };
  const attached = {
    ...purchase,
    paymentDetails: { sessionId: 'cs_subscription', checkoutUrl: 'https://checkout.paymongo.test/subscription', sessionStatus: 'active' }
  };
  const mocks = {
    Store: { findOne: async () => ({ _id: 'store-1', subscriptionTier: 'free', isActive: true, verificationStatus: 'verified' }) },
    Payment: {
      init: async () => {},
      findOne: async () => null,
      create: async payload => { createdPayload = payload; return purchase; },
      findOneAndUpdate: async () => attached
    },
    PayMongo: {
      buildCheckoutIdempotencyKey: () => 'subscription-checkout-key',
      createCheckoutSession: async attributes => {
        checkoutAttributes = attributes;
        return { id: 'cs_subscription', attributes: { checkout_url: attached.paymentDetails.checkoutUrl, status: 'active' } };
      },
      expireCheckoutSession: async () => {}
    },
    subscriptionService: {
      buildPlanSnapshot: tier => ({ name: tier === 'starter' ? 'Starter' : tier, termDays: 30 }),
      finalizeSubscriptionPayment: async () => {}
    }
  };
  const { createSubscriptionCheckout } = loadController(mocks);
  const res = responseRecorder();
  await createSubscriptionCheckout({ user: { _id: 'owner-1' }, body: { tier: 'starter', amount: 1, price: 1 } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.amount, 299);
  assert.equal(createdPayload.amountCentavos, 29900);
  assert.equal(checkoutAttributes.line_items[0].amount, 29900);
  assert.equal(checkoutAttributes.metadata.record_type, 'subscription');
  assert.equal(checkoutAttributes.metadata.record_id, purchase._id);
  assert.equal(res.body.checkoutUrl, attached.paymentDetails.checkoutUrl);
});

test('subscription checkout rejects free, unknown, and unverified Store purchases before PayMongo', async () => {
  let checkoutCalls = 0;
  const mocks = {
    Store: { findOne: async () => ({ _id: 'store-1', isActive: true, verificationStatus: 'pending' }) },
    Payment: { init: async () => {}, findOne: async () => null },
    PayMongo: { createCheckoutSession: async () => { checkoutCalls += 1; } },
    subscriptionService: { buildPlanSnapshot: () => ({}), finalizeSubscriptionPayment: async () => {} }
  };
  const { createSubscriptionCheckout } = loadController(mocks);

  const freeResponse = responseRecorder();
  await createSubscriptionCheckout({ user: { _id: 'owner-1' }, body: { tier: 'free' } }, freeResponse);
  assert.equal(freeResponse.statusCode, 400);

  const paidResponse = responseRecorder();
  await createSubscriptionCheckout({ user: { _id: 'owner-1' }, body: { tier: 'growth' } }, paidResponse);
  assert.equal(paidResponse.statusCode, 409);
  assert.equal(checkoutCalls, 0);
});

test('paid subscription finalization is transactional, exact-amount, and idempotent', async () => {
  const originalLoad = Module._load;
  const purchase = {
    _id: 'subscription-1',
    store: 'store-1',
    requestedBy: 'owner-1',
    targetTier: 'growth',
    amountCentavos: 69900,
    planSnapshot: { name: 'Growth', termDays: 30 },
    status: 'pending_payment',
    paymentDetails: {},
    activeKey: 'store:store-1',
    async save(options) { assert.equal(options.session, 'transaction-session'); }
  };
  const store = {
    subscriptionTier: 'free',
    subscriptionExpires: null,
    async save(options) { assert.equal(options.session, 'transaction-session'); }
  };
  let storeLookups = 0;
  let activityLogs = 0;
  const query = value => ({ session: async () => value });
  const mocks = {
    mongoose: { connection: { transaction: async work => work('transaction-session') } },
    Store: { findById: () => { storeLookups += 1; return query(store); } },
    Payment: {
      findById: () => query(purchase),
      findOne: () => query(null),
      findOneAndUpdate: async () => null
    },
    ActivityLog: { create: async () => { activityLogs += 1; } }
  };
  Module._load = function load(request, parent, isMain) {
    if (request === 'mongoose') return mocks.mongoose;
    if (request === '../models/Store') return mocks.Store;
    if (request === '../models/StoreSubscriptionPayment') return mocks.Payment;
    if (request === '../models/ActivityLog') return mocks.ActivityLog;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('../services/storeSubscriptionPaymentService')];
    const { finalizeSubscriptionPayment } = require('../services/storeSubscriptionPaymentService');
    const paymongoPayment = { id: 'pay_subscription', attributes: { amount: 69900, paid_at: 1794268800 } };
    const activated = await finalizeSubscriptionPayment(purchase, paymongoPayment);
    assert.equal(activated.status, 'paid');
    assert.equal(store.subscriptionTier, 'growth');
    assert.ok(store.subscriptionExpires instanceof Date);
    assert.equal(purchase.paymentDetails.paymentId, paymongoPayment.id);
    assert.equal(activityLogs, 1);

    await finalizeSubscriptionPayment(purchase, paymongoPayment);
    assert.equal(storeLookups, 1, 'replayed payment must not extend the plan twice');
    assert.equal(activityLogs, 1, 'replayed payment must not create a second activation log');
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve('../services/storeSubscriptionPaymentService')];
  }
});

test('wrong PayMongo amount fails closed without activating the Store plan', async () => {
  const originalLoad = Module._load;
  const purchase = {
    _id: 'subscription-2', amountCentavos: 149900, status: 'pending_payment', activeKey: 'store:store-2',
    paymentDetails: {}, async save() {}
  };
  let storeLookups = 0;
  const query = value => ({ session: async () => value });
  Module._load = function load(request, parent, isMain) {
    if (request === 'mongoose') return { connection: { transaction: async work => work('transaction-session') } };
    if (request === '../models/Store') return { findById: () => { storeLookups += 1; return query({}); } };
    if (request === '../models/StoreSubscriptionPayment') return { findById: () => query(purchase), findOne: () => query(null) };
    if (request === '../models/ActivityLog') return { create: async () => {} };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('../services/storeSubscriptionPaymentService')];
    const { finalizeSubscriptionPayment } = require('../services/storeSubscriptionPaymentService');
    await assert.rejects(
      () => finalizeSubscriptionPayment(purchase, { id: 'pay_underpaid', attributes: { amount: 1 } }),
      /amount did not match/
    );
    assert.equal(purchase.status, 'failed');
    assert.equal(purchase.activeKey, undefined);
    assert.equal(storeLookups, 0);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve('../services/storeSubscriptionPaymentService')];
  }
});
