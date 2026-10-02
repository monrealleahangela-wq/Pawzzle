const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProcurementPayment = require('../models/ProcurementPayment');
const Supplier = require('../models/Supplier');
require('../models/User');
const Notification = require('../models/Notification');
const PaymentWebhookEvent = require('../models/PaymentWebhookEvent');
const PayMongo = require('../services/paymongoService');
const {
  finalizeProcurement,
  markSessionFailed,
  reconcilePaidSession
} = require('../services/paymentReconciliationService');
const { createProcurementPayment, voidProcurementPayment } = require('../controllers/financeController');
const {
  createProcurementCheckoutSession,
  cancelPayment,
  verifyPayment
} = require('../controllers/paymentController');
const { cancelOrder } = require('../controllers/purchaseOrderController');

const transactionTestUri = process.env.MONGODB_TRANSACTION_TEST_URI;
const isolatedTransactionTestUri = transactionTestUri ? (() => {
  const uri = new URL(transactionTestUri);
  const baseDatabase = uri.pathname.replace(/^\//, '') || 'pawzzle_transaction_test';
  uri.pathname = `/${baseDatabase}_payment_integrity_${process.pid}`;
  return uri.toString();
})() : null;

const responseCapture = () => {
  const result = { status: 200 };
  result.response = {
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; }
  };
  return result;
};

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const invoke = async (handler, req) => {
  const result = responseCapture();
  req.app ||= { get: () => null };
  await handler(req, result.response);
  return result;
};

test('real MongoDB protects procurement reconciliation, webhook ordering, manual input, and void consistency', {
  skip: !transactionTestUri
}, async t => {
  await mongoose.connect(isolatedTransactionTestUri, { autoIndex: false });
  await mongoose.connection.dropDatabase();
  await ProcurementPayment.init();

  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const store = new mongoose.Types.ObjectId();
  const otherStore = new mongoose.Types.ObjectId();
  const seller = new mongoose.Types.ObjectId();
  const financeUser = new mongoose.Types.ObjectId();
  const injectedActor = new mongoose.Types.ObjectId();
  const supplier = new mongoose.Types.ObjectId();
  const injectedSupplier = new mongoose.Types.ObjectId();
  const orderIds = [];

  const cleanup = async () => {
    await Promise.all([
      ProcurementPayment.deleteMany({ store }),
      PurchaseOrder.deleteMany({ store }),
      Notification.deleteMany({ relatedId: { $in: orderIds } }),
      PaymentWebhookEvent.deleteMany({}),
      Supplier.deleteMany({ _id: { $in: [supplier, injectedSupplier] } })
    ]);
  };
  t.after(async () => {
    await cleanup();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  await Supplier.collection.insertOne({
    _id: supplier,
    user: seller,
    businessName: `Payment Integrity Supplier ${nonce}`,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const createOrder = async (suffix, overrides = {}) => {
    const order = await PurchaseOrder.create({
      orderNumber: `PO-PAY-${nonce}-${suffix}`,
      seller,
      store,
      supplier,
      items: [],
      subtotal: 100,
      totalCost: 100,
      status: 'confirmed',
      paymentStatus: 'pending',
      paymentTiming: 'pay_now',
      paymentMethod: 'paymongo',
      inspectionStatus: 'not_required',
      paymentDetails: { sessionId: `cs_${nonce}_${suffix}` },
      ...overrides
    });
    orderIds.push(order._id);
    return order;
  };
  const paidPayment = (id, amount = 10000) => ({
    id,
    attributes: {
      amount,
      status: 'paid',
      paid_at: Math.floor(Date.now() / 1000),
      payment_intent_id: `pi_${id}`,
      source: { type: 'gcash' }
    }
  });

  await t.test('checkout creation cannot attach an active PayMongo session after PO cancellation', async () => {
    const order = await createOrder('checkout-cancel-race', {
      status: 'submitted',
      paymentStatus: 'unpaid',
      paymentMethod: 'bank_transfer',
      paymentDetails: undefined
    });
    const checkoutStarted = deferred();
    const allowCheckoutResponse = deferred();
    const originalCreate = PayMongo.createCheckoutSession;
    const originalExpire = PayMongo.expireCheckoutSession;
    const expiredSessions = [];
    PayMongo.createCheckoutSession = async () => {
      checkoutStarted.resolve();
      await allowCheckoutResponse.promise;
      return {
        id: `cs_${nonce}_cancel_race`,
        attributes: { checkout_url: 'https://checkout.test/race', status: 'active' }
      };
    };
    PayMongo.expireCheckoutSession = async sessionId => {
      expiredSessions.push(sessionId);
      return { id: sessionId, attributes: { status: 'expired', payments: [] } };
    };
    try {
      const checkoutPromise = invoke(createProcurementCheckoutSession, {
        params: { purchaseOrderId: order._id }, body: {}, query: {},
        user: { _id: seller, role: 'platform_admin', store }
      });
      await checkoutStarted.promise;
      const cancelled = await invoke(cancelOrder, {
        params: { id: order._id }, body: { reason: 'Cancelled during checkout creation' }, query: {},
        user: { _id: seller, role: 'platform_admin', store }
      });
      assert.equal(cancelled.status, 200);
      allowCheckoutResponse.resolve();
      const checkout = await checkoutPromise;
      assert.equal(checkout.status, 409);

      const current = await PurchaseOrder.findById(order._id);
      assert.equal(current.status, 'cancelled');
      assert.equal(current.paymentDetails?.sessionId, undefined);
      assert.deepEqual(expiredSessions, [`cs_${nonce}_cancel_race`]);
    } finally {
      PayMongo.createCheckoutSession = originalCreate;
      PayMongo.expireCheckoutSession = originalExpire;
      allowCheckoutResponse.resolve();
    }
  });

  await t.test('stale payment cancellation cannot overwrite concurrent verified reconciliation', async () => {
    const order = await createOrder('cancel-reconcile-race', {
      paymentDetails: {
        sessionId: `cs_${nonce}_cancel_reconcile`,
        sessionStatus: 'active',
        sessionVersion: 1,
        sessionHistory: [{
          sessionId: `cs_${nonce}_cancel_reconcile`,
          checkoutUrl: 'https://checkout.test/cancel-reconcile',
          status: 'active',
          createdAt: new Date()
        }]
      }
    });
    const expirationStarted = deferred();
    const allowExpiration = deferred();
    const originalGet = PayMongo.getCheckoutSession;
    const originalExpire = PayMongo.expireCheckoutSession;
    PayMongo.getCheckoutSession = async () => ({
      id: order.paymentDetails.sessionId,
      attributes: { status: 'active', payments: [] }
    });
    PayMongo.expireCheckoutSession = async sessionId => {
      expirationStarted.resolve();
      await allowExpiration.promise;
      return { id: sessionId, attributes: { status: 'expired', payments: [] } };
    };
    try {
      const cancellationPromise = invoke(cancelPayment, {
        params: { type: 'procurement', id: order._id }, body: {}, query: {},
        user: { _id: financeUser, role: 'platform_admin' }
      });
      await expirationStarted.promise;
      const payment = paidPayment(`pay_${nonce}_cancel_reconcile`);
      await finalizeProcurement(await PurchaseOrder.findById(order._id), payment);
      allowExpiration.resolve();
      const cancellation = await cancellationPromise;
      assert.equal(cancellation.status, 409);

      const current = await PurchaseOrder.findById(order._id);
      assert.equal(current.paymentStatus, 'paid');
      assert.equal(current.paidAmount, 100);
      assert.equal(current.paymentDetails.paymentId, payment.id);
      assert.equal(await ProcurementPayment.countDocuments({ purchaseOrder: order._id, status: 'recorded' }), 1);
    } finally {
      PayMongo.getCheckoutSession = originalGet;
      PayMongo.expireCheckoutSession = originalExpire;
      allowExpiration.resolve();
    }
  });

  await t.test('stale payment cancellation cannot overwrite webhook reconciliation', async () => {
    const order = await createOrder('cancel-webhook-race', {
      paymentDetails: {
        sessionId: `cs_${nonce}_cancel_webhook`,
        sessionStatus: 'active',
        sessionVersion: 1,
        sessionHistory: [{
          sessionId: `cs_${nonce}_cancel_webhook`,
          checkoutUrl: 'https://checkout.test/cancel-webhook',
          status: 'active',
          createdAt: new Date()
        }]
      }
    });
    const expirationStarted = deferred();
    const allowExpiration = deferred();
    const originalGet = PayMongo.getCheckoutSession;
    const originalExpire = PayMongo.expireCheckoutSession;
    PayMongo.getCheckoutSession = async () => ({
      id: order.paymentDetails.sessionId,
      attributes: { status: 'active', payments: [] }
    });
    PayMongo.expireCheckoutSession = async sessionId => {
      expirationStarted.resolve();
      await allowExpiration.promise;
      return { id: sessionId, attributes: { status: 'expired', payments: [] } };
    };
    try {
      const cancellationPromise = invoke(cancelPayment, {
        params: { type: 'procurement', id: order._id }, body: {}, query: {},
        user: { _id: financeUser, role: 'platform_admin' }
      });
      await expirationStarted.promise;
      const payment = paidPayment(`pay_${nonce}_cancel_webhook`);
      await reconcilePaidSession({
        id: order.paymentDetails.sessionId,
        attributes: {
          metadata: { record_type: 'procurement', record_id: String(order._id) },
          payments: [payment]
        }
      });
      allowExpiration.resolve();
      const cancellation = await cancellationPromise;
      assert.equal(cancellation.status, 409);

      const current = await PurchaseOrder.findById(order._id);
      assert.equal(current.paymentStatus, 'paid');
      assert.equal(current.paidAmount, 100);
      assert.equal(current.paymentDetails.paymentId, payment.id);
    } finally {
      PayMongo.getCheckoutSession = originalGet;
      PayMongo.expireCheckoutSession = originalExpire;
      allowExpiration.resolve();
    }
  });

  await t.test('expired-session verification cannot overwrite concurrent paid reconciliation', async () => {
    const order = await createOrder('verify-reconcile-race', {
      paymentDetails: {
        sessionId: `cs_${nonce}_verify_reconcile`,
        sessionStatus: 'active',
        sessionVersion: 1,
        sessionHistory: [{
          sessionId: `cs_${nonce}_verify_reconcile`,
          checkoutUrl: 'https://checkout.test/verify-reconcile',
          status: 'active',
          createdAt: new Date()
        }]
      }
    });
    const lookupStarted = deferred();
    const allowLookup = deferred();
    const originalGet = PayMongo.getCheckoutSession;
    PayMongo.getCheckoutSession = async sessionId => {
      lookupStarted.resolve();
      await allowLookup.promise;
      return { id: sessionId, attributes: { status: 'expired', payments: [] } };
    };
    try {
      const verificationPromise = invoke(verifyPayment, {
        params: { orderId: order._id }, body: {}, query: {},
        user: { _id: financeUser, role: 'platform_admin' }
      });
      await lookupStarted.promise;
      const payment = paidPayment(`pay_${nonce}_verify_reconcile`);
      await finalizeProcurement(await PurchaseOrder.findById(order._id), payment);
      allowLookup.resolve();
      const verification = await verificationPromise;
      assert.equal(verification.status, 200);
      assert.equal(verification.body.status, 'paid');

      const current = await PurchaseOrder.findById(order._id);
      assert.equal(current.paymentStatus, 'paid');
      assert.equal(current.paidAmount, 100);
      assert.equal(current.paymentDetails.paymentId, payment.id);
    } finally {
      PayMongo.getCheckoutSession = originalGet;
      allowLookup.resolve();
    }
  });

  await t.test('reconciliation refuses an already-cancelled purchase order without changing paid totals', async () => {
    const order = await createOrder('cancelled-reconciliation', {
      status: 'cancelled',
      paymentStatus: 'unpaid',
      paidAmount: 0
    });
    await assert.rejects(
      finalizeProcurement(order, paidPayment(`pay_${nonce}_cancelled`)),
      error => error.statusCode === 409 && /cancelled purchase order/i.test(error.message)
    );
    const current = await PurchaseOrder.findById(order._id);
    assert.equal(current.status, 'cancelled');
    assert.equal(current.paymentStatus, 'unpaid');
    assert.equal(current.paidAmount, 0);
    assert.equal(await ProcurementPayment.countDocuments({ purchaseOrder: order._id }), 0);
  });

  await t.test('verified reconciliation after payment-session cancellation becomes authoritative exactly once', async () => {
    const order = await createOrder('paid-after-session-cancel', {
      paymentDetails: {
        sessionId: `cs_${nonce}_paid_after_cancel`,
        sessionStatus: 'active',
        sessionVersion: 1,
        sessionHistory: [{
          sessionId: `cs_${nonce}_paid_after_cancel`,
          checkoutUrl: 'https://checkout.test/paid-after-cancel',
          status: 'active',
          createdAt: new Date()
        }]
      }
    });
    const originalGet = PayMongo.getCheckoutSession;
    const originalExpire = PayMongo.expireCheckoutSession;
    PayMongo.getCheckoutSession = async () => ({
      id: order.paymentDetails.sessionId,
      attributes: { status: 'active', payments: [] }
    });
    PayMongo.expireCheckoutSession = async sessionId => ({
      id: sessionId,
      attributes: { status: 'expired', payments: [] }
    });
    try {
      const cancellation = await invoke(cancelPayment, {
        params: { type: 'procurement', id: order._id }, body: {}, query: {},
        user: { _id: financeUser, role: 'platform_admin' }
      });
      assert.equal(cancellation.status, 200);
      assert.equal((await PurchaseOrder.findById(order._id)).paymentStatus, 'unpaid');

      const payment = paidPayment(`pay_${nonce}_after_session_cancel`);
      await finalizeProcurement(await PurchaseOrder.findById(order._id), payment);
      await finalizeProcurement(await PurchaseOrder.findById(order._id), payment);
      const current = await PurchaseOrder.findById(order._id);
      assert.equal(current.paymentStatus, 'paid');
      assert.equal(current.paidAmount, 100);
      assert.equal(current.paymentDetails.paymentId, payment.id);
      assert.equal(current.paymentDetails.sessionStatus, 'expired');
      assert.equal(await ProcurementPayment.countDocuments({ purchaseOrder: order._id }), 1);
    } finally {
      PayMongo.getCheckoutSession = originalGet;
      PayMongo.expireCheckoutSession = originalExpire;
    }
  });

  await t.test('different concurrent PayMongo payments produce one counted and one auditable duplicate', async () => {
    const order = await createOrder('different');
    const staleA = await PurchaseOrder.findById(order._id);
    const staleB = await PurchaseOrder.findById(order._id);
    await Promise.all([
      finalizeProcurement(staleA, paidPayment(`pay_${nonce}_A`)),
      finalizeProcurement(staleB, paidPayment(`pay_${nonce}_B`))
    ]);

    const current = await PurchaseOrder.findById(order._id);
    const payments = await ProcurementPayment.find({ purchaseOrder: order._id }).sort({ status: 1 });
    assert.equal(current.paidAmount, 100);
    assert.equal(current.paymentStatus, 'paid');
    assert.equal(payments.filter(row => row.status === 'recorded').length, 1);
    assert.equal(payments.filter(row => row.status === 'duplicate').length, 1);
    assert.equal(payments.reduce((sum, row) => sum + (row.status === 'recorded' ? row.amount : 0), 0), 100);
    assert.equal(current.paymentDetails.duplicatePaymentIds.length, 1);
  });

  await t.test('same payment reconciliation is idempotent under concurrency and retry', async () => {
    const order = await createOrder('same');
    const payment = paidPayment(`pay_${nonce}_same`);
    await Promise.all([
      finalizeProcurement(await PurchaseOrder.findById(order._id), payment),
      finalizeProcurement(await PurchaseOrder.findById(order._id), payment)
    ]);
    await finalizeProcurement(await PurchaseOrder.findById(order._id), payment);

    const current = await PurchaseOrder.findById(order._id);
    assert.equal(current.paidAmount, 100);
    assert.equal(await ProcurementPayment.countDocuments({ purchaseOrder: order._id }), 1);
  });

  await t.test('late and duplicate failure events cannot downgrade success, while failure then success remains valid', async () => {
    const paidOrder = await createOrder('late-failure');
    await finalizeProcurement(paidOrder, paidPayment(`pay_${nonce}_late`));
    const lateFailure = await markSessionFailed({
      id: paidOrder.paymentDetails.sessionId,
      attributes: { metadata: { record_type: 'procurement', record_id: String(paidOrder._id) } }
    });
    assert.equal(lateFailure, null);
    assert.equal((await PurchaseOrder.findById(paidOrder._id)).paymentStatus, 'paid');

    const failedFirst = await createOrder('failure-first');
    const failureSession = {
      id: failedFirst.paymentDetails.sessionId,
      attributes: { metadata: { record_type: 'procurement', record_id: String(failedFirst._id) } }
    };
    assert.equal((await markSessionFailed(failureSession)).record.paymentStatus, 'failed');
    assert.equal(await markSessionFailed(failureSession), null);
    await finalizeProcurement(await PurchaseOrder.findById(failedFirst._id), paidPayment(`pay_${nonce}_after_failure`));
    assert.equal(await markSessionFailed(failureSession), null);
    assert.equal((await PurchaseOrder.findById(failedFirst._id)).paymentStatus, 'paid');
  });

  await t.test('manual payment input is allowlisted and void atomically reopens a resolved completed PO', async () => {
    const order = await createOrder('manual', {
      totalCost: 55,
      subtotal: 55,
      paymentStatus: 'unpaid',
      paymentMethod: 'bank_transfer',
      paymentDetails: undefined
    });
    const createResult = responseCapture();
    await createProcurementPayment({
      body: {
        purchaseOrder: order._id,
        amount: 55,
        paymentMethod: 'bank_transfer',
        paymentDate: new Date().toISOString(),
        reference: 'BANK-VALID',
        notes: 'Authorized Finance entry',
        status: 'authorized',
        provider: 'paymongo',
        providerPaymentId: 'pay_injected',
        transactionType: 'credit',
        store: otherStore,
        supplier: injectedSupplier,
        recordedBy: injectedActor,
        voidedBy: injectedActor
      },
      params: {},
      query: {},
      user: { _id: financeUser, role: 'finance_staff', store }
    }, createResult.response);
    assert.equal(createResult.status, 201);

    const payment = await ProcurementPayment.findOne({ purchaseOrder: order._id });
    assert.equal(payment.status, 'recorded');
    assert.equal(payment.provider, 'manual');
    assert.equal(payment.transactionType, 'payment');
    assert.equal(payment.providerPaymentId, undefined);
    assert.equal(String(payment.store), String(store));
    assert.equal(String(payment.supplier), String(supplier));
    assert.equal(String(payment.recordedBy), String(financeUser));

    await PurchaseOrder.updateOne({ _id: order._id }, {
      $set: { status: 'completed', inspectionStatus: 'resolved', completedAt: new Date() }
    });
    const voidResult = responseCapture();
    await voidProcurementPayment({
      params: { id: payment._id },
      body: { reason: 'Bank transfer reversed' },
      query: {},
      user: { _id: financeUser, role: 'finance_staff', store }
    }, voidResult.response);
    assert.equal(voidResult.status, 200);

    const [voided, reopened] = await Promise.all([
      ProcurementPayment.findById(payment._id),
      PurchaseOrder.findById(order._id)
    ]);
    assert.equal(voided.status, 'void');
    assert.equal(reopened.paymentStatus, 'unpaid');
    assert.equal(reopened.paidAmount, 0);
    assert.equal(reopened.status, 'resolved');
    assert.equal(reopened.completedAt, undefined);
    assert.equal(reopened.paymentDate, undefined);
  });

  await t.test('unsupported completed PO rejects a manual void without changing either record', async () => {
    const order = await createOrder('reject-void', {
      status: 'completed',
      paymentStatus: 'paid',
      paymentMethod: 'bank_transfer',
      paidAmount: 100,
      completedAt: new Date()
    });
    const [payment] = await ProcurementPayment.create([{
      store,
      purchaseOrder: order._id,
      supplier,
      amount: 100,
      paymentMethod: 'bank_transfer',
      provider: 'manual',
      transactionType: 'payment',
      status: 'recorded',
      recordedBy: financeUser
    }]);
    const result = responseCapture();
    await voidProcurementPayment({
      params: { id: payment._id },
      body: { reason: 'Invalid reversal attempt' },
      query: {},
      user: { _id: financeUser, role: 'finance_staff', store }
    }, result.response);

    assert.equal(result.status, 409);
    assert.equal((await ProcurementPayment.findById(payment._id)).status, 'recorded');
    assert.equal((await PurchaseOrder.findById(order._id)).status, 'completed');
  });
});
