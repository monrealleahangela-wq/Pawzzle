const Store = require('../models/Store');
const StoreSubscriptionPayment = require('../models/StoreSubscriptionPayment');
const ActivityLog = require('../models/ActivityLog');
const PayMongo = require('../services/paymongoService');
const { SUBSCRIPTION_PLANS, normalizeSubscriptionTier, getPlanPrice } = require('../config/subscriptionPlans');
const {
  buildPlanSnapshot,
  finalizeSubscriptionPayment
} = require('../services/storeSubscriptionPaymentService');
const { getEffectiveTier } = require('../services/storeSubscriptionService');

const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
let FRONTEND_URL = process.env.FRONTEND_URL;
if (!FRONTEND_URL || FRONTEND_URL.includes('localhost')) {
  FRONTEND_URL = isProduction ? 'https://pawzzle.io' : 'http://localhost:3000';
}

const getOwnedStore = userId => Store.findOne({ owner: userId, isDeleted: { $ne: true } });

const serializePayment = payment => ({
  id: payment._id,
  targetTier: payment.targetTier,
  billingInterval: payment.billingInterval,
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
    const billingInterval = String(req.body?.billingInterval || 'monthly').trim().toLowerCase();
    if (!['starter', 'growth', 'professional'].includes(requestedTier)) {
      return res.status(400).json({ message: 'Select Starter, Growth, or Professional.' });
    }
    if (!['monthly', 'annual'].includes(billingInterval)) {
      return res.status(400).json({ message: 'Choose monthly or annual billing.' });
    }
    const store = await getOwnedStore(req.user._id);
    if (!store) return res.status(404).json({ message: 'Store not found.' });
    if (!store.isActive || store.verificationStatus !== 'verified') {
      return res.status(409).json({ message: 'Only an active, verified store can purchase a plan.' });
    }

    const plan = SUBSCRIPTION_PLANS[requestedTier];
    const authoritativePrice = getPlanPrice(requestedTier, billingInterval);
    const activeKey = `store:${store._id}`;
    await StoreSubscriptionPayment.init();
    const existing = await StoreSubscriptionPayment.findOne({ activeKey });
    if (existing) {
      if (existing.targetTier === requestedTier && existing.billingInterval === billingInterval && existing.paymentDetails?.checkoutUrl) {
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
        billingInterval,
        planSnapshot: buildPlanSnapshot(requestedTier, billingInterval),
        amount: authoritativePrice,
        amountCentavos: Math.round(authoritativePrice * 100),
        status: 'pending_payment',
        activeKey
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      const raced = await StoreSubscriptionPayment.findOne({ activeKey });
      if (raced?.targetTier === requestedTier && raced.billingInterval === billingInterval && raced.paymentDetails?.checkoutUrl) {
        return res.json({ payment: serializePayment(raced), checkoutUrl: raced.paymentDetails.checkoutUrl, reused: true });
      }
      return res.status(409).json({ message: 'Another plan checkout is already being prepared. Refresh this page to continue it.' });
    }

    const session = await PayMongo.createCheckoutSession({
      send_email_receipt: true,
      show_description: true,
      show_line_items: true,
      description: `${plan.name} Store Plan - ${billingInterval === 'annual' ? '1 year' : '30 days'}`,
      line_items: [{
        amount: purchase.amountCentavos,
        currency: 'PHP',
        name: `${plan.name} Store Plan (${billingInterval === 'annual' ? '1 year' : '30 days'})`,
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

const startGrowthTrial = async (req, res) => {
  try {
    const store = await getOwnedStore(req.user._id);
    if (!store) return res.status(404).json({ message: 'Store not found.' });
    if (!store.isActive || store.verificationStatus !== 'verified') {
      return res.status(409).json({ message: 'Only an active, verified store can start the Growth trial.' });
    }
    const now = new Date();
    if (store.subscriptionTrialUsedAt) return res.status(409).json({ message: 'This store already used its Growth trial.' });
    if (store.subscriptionExpires && new Date(store.subscriptionExpires) > now && normalizeSubscriptionTier(store.subscriptionTier) !== 'free') {
      return res.status(409).json({ message: 'The Growth trial is available only when no paid plan is active.' });
    }
    const priorPaidPlan = await StoreSubscriptionPayment.exists({ store: store._id, status: 'paid' });
    if (priorPaidPlan) return res.status(409).json({ message: 'The Growth trial is for stores that have not previously activated a paid plan.' });
    const trialEnd = new Date(now.getTime() + (14 * 24 * 60 * 60 * 1000));
    const updated = await Store.findOneAndUpdate({
      _id: store._id,
      $or: [{ subscriptionTrialUsedAt: { $exists: false } }, { subscriptionTrialUsedAt: null }]
    }, {
      $set: {
        subscriptionTier: 'growth', subscriptionExpires: trialEnd,
        subscriptionBillingInterval: 'trial', subscriptionTrialUsedAt: now
      },
      $unset: { pendingSubscription: 1 }
    }, { new: true, runValidators: true });
    if (!updated) return res.status(409).json({ message: 'The Growth trial was already claimed. Refresh to see the current plan.' });
    await ActivityLog.create({ user: req.user._id, store: store._id, action: 'Growth Trial Started', details: `Growth trial activated through ${trialEnd.toISOString()}.` }).catch(() => {});
    return res.json({ message: 'Your 14-day Growth trial is active.', endsAt: trialEnd });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'Unable to start the Growth trial.' });
  }
};

const scheduleSubscriptionDowngrade = async (req, res) => {
  try {
    const targetTier = normalizeSubscriptionTier(req.body?.tier);
    if (String(req.body?.tier || '').toLowerCase() !== 'free') {
      return res.status(400).json({ message: 'Paid plan changes require PayMongo confirmation. Only a change to Free can be scheduled without payment.' });
    }
    const store = await getOwnedStore(req.user._id);
    if (!store) return res.status(404).json({ message: 'Store not found.' });
    const currentTier = getEffectiveTier(store);
    if (targetTier === currentTier || currentTier === 'free') {
      return res.status(400).json({ message: 'This store is already on the Free plan.' });
    }
    if (store.pendingSubscription?.paid) {
      return res.status(409).json({ message: 'A paid plan is already queued for the next term. Contact support if the payment needs review.' });
    }
    const now = new Date();
    store.subscriptionLegacyGrantOptOutAt = now;
    const effectiveAt = store.subscriptionExpires && new Date(store.subscriptionExpires) > now
      ? new Date(store.subscriptionExpires) : now;
    if (effectiveAt <= now) {
      store.subscriptionTier = targetTier;
      store.subscriptionExpires = null;
      store.subscriptionBillingInterval = 'monthly';
      store.pendingSubscription = undefined;
    } else {
      store.pendingSubscription = { tier: targetTier, effectiveAt, paid: false, requestedAt: now, requestedBy: req.user._id };
    }
    await store.save();
    await ActivityLog.create({ user: req.user._id, store: store._id, action: 'Store Subscription Downgrade Scheduled', details: `${SUBSCRIPTION_PLANS[targetTier].name} takes effect ${effectiveAt.toISOString()}; no listings or records will be deleted.` }).catch(() => {});
    return res.json({
      message: effectiveAt > now ? 'Downgrade scheduled for the end of the current term.' : 'Plan changed.',
      pendingSubscription: store.pendingSubscription || null,
      effectiveAt
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'Unable to schedule the downgrade.' });
  }
};

const cancelSubscriptionDowngrade = async (req, res) => {
  try {
    const existing = await getOwnedStore(req.user._id);
    if (!existing) return res.status(404).json({ message: 'Store not found.' });
    if (existing.pendingSubscription?.paid) {
      return res.status(409).json({ message: 'A prepaid next-term plan cannot be cancelled from this page. Contact support for payment review.' });
    }
    const store = await Store.findOneAndUpdate({
      _id: existing._id,
      'pendingSubscription.paid': { $ne: true }
    }, { $unset: { pendingSubscription: 1, subscriptionLegacyGrantOptOutAt: 1 } }, { new: true });
    if (!store) return res.status(404).json({ message: 'Store not found.' });
    return res.json({ message: 'Scheduled downgrade cancelled.' });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to cancel the scheduled downgrade.' });
  }
};

module.exports = {
  createSubscriptionCheckout,
  getSubscriptionPayments,
  verifySubscriptionPayment,
  cancelSubscriptionPayment,
  startGrowthTrial,
  scheduleSubscriptionDowngrade,
  cancelSubscriptionDowngrade
};
