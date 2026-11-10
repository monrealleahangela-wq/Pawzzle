const Store = require('../models/Store');
const StoreSubscriptionPayment = require('../models/StoreSubscriptionPayment');
const PayMongo = require('../services/paymongoService');
const { SUBSCRIPTION_PLANS, normalizeSubscriptionTier } = require('../config/subscriptionPlans');
const {
  buildPlanSnapshot,
  finalizeSubscriptionPayment
} = require('../services/storeSubscriptionPaymentService');

const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
let FRONTEND_URL = process.env.FRONTEND_URL;
if (!FRONTEND_URL || FRONTEND_URL.includes('localhost')) {
  FRONTEND_URL = isProduction ? 'https://pawzzle.io' : 'http://localhost:3000';
}

const getOwnedStore = userId => Store.findOne({ owner: userId, isDeleted: { $ne: true } });

const serializePayment = payment => ({
  id: payment._id,
  targetTier: payment.targetTier,
  plan: payment.planSnapshot,
  amount: payment.amount,
  currency: payment.currency,
  status: payment.status,
  checkoutUrl: payment.status === 'pending_payment' ? payment.paymentDetails?.checkoutUrl : null,
  sessionStatus: payment.paymentDetails?.sessionStatus,
  periodStart: payment.periodStart,
  periodEnd: payment.periodEnd,
  paidAt: payment.paymentDetails?.paidAt,
  createdAt: payment.createdAt
});

const createSubscriptionCheckout = async (req, res) => {
  let purchase;
  try {
    const requestedTier = String(req.body?.tier || '').trim().toLowerCase();
    if (!['starter', 'growth', 'professional'].includes(requestedTier)) {
      return res.status(400).json({ message: 'Select Starter, Growth, or Professional.' });
    }
    const store = await getOwnedStore(req.user._id);
    if (!store) return res.status(404).json({ message: 'Store not found.' });
    if (!store.isActive || store.verificationStatus !== 'verified') {
      return res.status(409).json({ message: 'Only an active, verified store can purchase a plan.' });
    }

    const plan = SUBSCRIPTION_PLANS[requestedTier];
    const activeKey = `store:${store._id}`;
    await StoreSubscriptionPayment.init();
    const existing = await StoreSubscriptionPayment.findOne({ activeKey });
    if (existing) {
      if (existing.targetTier === requestedTier && existing.paymentDetails?.checkoutUrl) {
        return res.json({ payment: serializePayment(existing), checkoutUrl: existing.paymentDetails.checkoutUrl, reused: true });
      }
      return res.status(409).json({
        message: `Finish or cancel the pending ${existing.planSnapshot.name} checkout before selecting another plan.`,
        payment: serializePayment(existing)
      });
    }

    try {
      purchase = await StoreSubscriptionPayment.create({
        store: store._id,
        requestedBy: req.user._id,
        previousTier: normalizeSubscriptionTier(store.subscriptionTier),
        targetTier: requestedTier,
        planSnapshot: buildPlanSnapshot(requestedTier),
        amount: plan.monthlyPrice,
        amountCentavos: Math.round(plan.monthlyPrice * 100),
        status: 'pending_payment',
        activeKey
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      const raced = await StoreSubscriptionPayment.findOne({ activeKey });
      if (raced?.targetTier === requestedTier && raced.paymentDetails?.checkoutUrl) {
        return res.json({ payment: serializePayment(raced), checkoutUrl: raced.paymentDetails.checkoutUrl, reused: true });
      }
      return res.status(409).json({ message: 'Another plan checkout is already being prepared. Refresh this page to continue it.' });
    }

    const session = await PayMongo.createCheckoutSession({
      send_email_receipt: true,
      show_description: true,
      show_line_items: true,
      description: `${plan.name} Store Plan - 30 days`,
      line_items: [{
        amount: purchase.amountCentavos,
        currency: 'PHP',
        name: `${plan.name} Store Plan (30 days)`,
        quantity: 1
      }],
      payment_method_types: ['card', 'gcash', 'paymaya', 'dob', 'dob_ubp'],
      success_url: `${FRONTEND_URL}/admin/settings?section=plan&subscription=success&id=${purchase._id}`,
      cancel_url: `${FRONTEND_URL}/admin/settings?section=plan&subscription=cancelled&id=${purchase._id}`,
      reference_number: `SUB-${String(purchase._id).slice(-12).toUpperCase()}`,
      metadata: { record_type: 'subscription', record_id: String(purchase._id) }
    }, PayMongo.buildCheckoutIdempotencyKey('subscription', purchase._id, 1));

    const attached = await StoreSubscriptionPayment.findOneAndUpdate({
      _id: purchase._id,
      status: 'pending_payment',
      'paymentDetails.sessionId': { $exists: false }
    }, {
      $set: {
        'paymentDetails.sessionId': session.id,
        'paymentDetails.checkoutUrl': session.attributes.checkout_url,
        'paymentDetails.sessionStatus': session.attributes.status || 'active',
        'paymentDetails.sessionCreatedAt': session.attributes?.created_at
          ? new Date(session.attributes.created_at * 1000)
          : new Date()
      }
    }, { new: true });
    if (!attached) {
      if (session.attributes?.status === 'active') await PayMongo.expireCheckoutSession(session.id).catch(() => {});
      throw Object.assign(new Error('The subscription checkout changed while PayMongo was opening. Please try again.'), { statusCode: 409 });
    }
    return res.status(201).json({ payment: serializePayment(attached), checkoutUrl: session.attributes.checkout_url });
  } catch (error) {
    if (purchase && !purchase.paymentDetails?.sessionId) {
      await StoreSubscriptionPayment.findOneAndUpdate({ _id: purchase._id, status: 'pending_payment' }, {
        $set: { status: 'failed', 'paymentDetails.failureReason': error.message },
        $unset: { activeKey: 1 }
      }).catch(() => {});
    }
    console.error('Subscription checkout error:', error.response?.data || error.message);
    return res.status(error.statusCode || 502).json({ message: error.message || 'Unable to open PayMongo subscription checkout.' });
  }
};

const getSubscriptionPayments = async (req, res) => {
  try {
    const store = await getOwnedStore(req.user._id);
    if (!store) return res.status(404).json({ message: 'Store not found.' });
    const payments = await StoreSubscriptionPayment.find({ store: store._id }).sort({ createdAt: -1 }).limit(20);
    return res.json({ payments: payments.map(serializePayment) });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load subscription payments.' });
  }
};

const verifySubscriptionPayment = async (req, res) => {
  try {
    const store = await getOwnedStore(req.user._id);
    if (!store) return res.status(404).json({ message: 'Store not found.' });
    const purchase = await StoreSubscriptionPayment.findOne({ _id: req.params.id, store: store._id });
    if (!purchase) return res.status(404).json({ message: 'Subscription payment not found.' });
    if (purchase.status === 'paid') return res.json({ status: 'paid', payment: serializePayment(purchase) });
    if (!purchase.paymentDetails?.sessionId) return res.status(409).json({ message: 'This payment has no PayMongo checkout session.' });

    const session = await PayMongo.getCheckoutSession(purchase.paymentDetails.sessionId);
    const payment = PayMongo.getPaidPayment(session);
    if (payment) {
      const activated = await finalizeSubscriptionPayment(purchase, payment);
      return res.json({ status: 'paid', payment: serializePayment(activated) });
    }
    if (session.attributes?.status === 'expired') {
      const expired = await StoreSubscriptionPayment.findOneAndUpdate({ _id: purchase._id, status: 'pending_payment' }, {
        $set: { status: 'expired', 'paymentDetails.sessionStatus': 'expired' },
        $unset: { activeKey: 1 }
      }, { new: true });
      return res.json({ status: expired?.status || purchase.status, payment: serializePayment(expired || purchase) });
    }
    return res.json({ status: purchase.status, sessionStatus: session.attributes?.status, payment: serializePayment(purchase) });
  } catch (error) {
    console.error('Subscription verification error:', error.response?.data || error.message);
    return res.status(error.statusCode || 502).json({ message: error.message || 'Unable to verify the PayMongo payment.' });
  }
};

const cancelSubscriptionPayment = async (req, res) => {
  try {
    const store = await getOwnedStore(req.user._id);
    if (!store) return res.status(404).json({ message: 'Store not found.' });
    const purchase = await StoreSubscriptionPayment.findOne({ _id: req.params.id, store: store._id });
    if (!purchase) return res.status(404).json({ message: 'Subscription payment not found.' });
    if (purchase.status === 'paid') return res.status(409).json({ message: 'A confirmed subscription payment cannot be cancelled.' });
    if (!purchase.paymentDetails?.sessionId) {
      const cancelled = await StoreSubscriptionPayment.findOneAndUpdate({ _id: purchase._id, status: { $ne: 'paid' } }, {
        $set: { status: 'cancelled' }, $unset: { activeKey: 1 }
      }, { new: true });
      return res.json({ status: cancelled.status, payment: serializePayment(cancelled) });
    }

    let session = await PayMongo.getCheckoutSession(purchase.paymentDetails.sessionId);
    let payment = PayMongo.getPaidPayment(session);
    if (payment) {
      await finalizeSubscriptionPayment(purchase, payment);
      return res.status(409).json({ message: 'PayMongo already confirmed this payment; the plan was activated.' });
    }
    if (session.attributes?.status === 'active') session = await PayMongo.expireCheckoutSession(session.id);
    payment = PayMongo.getPaidPayment(session);
    if (payment) {
      await finalizeSubscriptionPayment(purchase, payment);
      return res.status(409).json({ message: 'PayMongo confirmed this payment while cancellation was in progress; the plan was activated.' });
    }
    const cancelled = await StoreSubscriptionPayment.findOneAndUpdate({
      _id: purchase._id,
      status: { $ne: 'paid' },
      'paymentDetails.paymentId': { $exists: false }
    }, {
      $set: { status: 'cancelled', 'paymentDetails.sessionStatus': 'expired' },
      $unset: { activeKey: 1 }
    }, { new: true });
    if (!cancelled) return res.status(409).json({ message: 'The payment status changed while cancellation was in progress. Refresh to see the current plan.' });
    return res.json({ status: cancelled.status, payment: serializePayment(cancelled) });
  } catch (error) {
    console.error('Subscription cancellation error:', error.response?.data || error.message);
    return res.status(error.statusCode || 502).json({ message: error.message || 'Unable to cancel the PayMongo checkout.' });
  }
};

module.exports = {
  createSubscriptionCheckout,
  getSubscriptionPayments,
  verifySubscriptionPayment,
  cancelSubscriptionPayment
};
