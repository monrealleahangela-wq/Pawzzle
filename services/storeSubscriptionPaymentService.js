const mongoose = require('mongoose');
const Store = require('../models/Store');
const StoreSubscriptionPayment = require('../models/StoreSubscriptionPayment');
const ActivityLog = require('../models/ActivityLog');
const { getSubscriptionPlan, normalizeSubscriptionTier } = require('../config/subscriptionPlans');

const paymentAmountCentavos = payment => Number(payment?.attributes?.amount || 0);

const finalizeSubscriptionPayment = async (purchase, payment) => {
  if (!payment?.id) throw Object.assign(new Error('PayMongo payment identity is required.'), { statusCode: 400 });
  let activated;
  let amountMismatch = false;
  let newlyActivated = false;
  let activationWasScheduled = false;

  await mongoose.connection.transaction(async session => {
    const current = await StoreSubscriptionPayment.findById(purchase._id).session(session);
    if (!current) throw Object.assign(new Error('Subscription payment not found.'), { statusCode: 404 });
    if (current.status === 'paid') {
      if (current.paymentDetails?.paymentId !== payment.id) {
        throw Object.assign(new Error('This subscription was already paid by another PayMongo payment.'), { statusCode: 409 });
      }
      activated = current;
      return;
    }
    if (paymentAmountCentavos(payment) !== Number(current.amountCentavos)) {
      current.status = 'failed';
      current.paymentDetails.sessionStatus = 'failed';
      current.paymentDetails.failureReason = 'PayMongo amount did not match the authoritative plan price.';
      current.activeKey = undefined;
      await current.save({ session });
      activated = current;
      amountMismatch = true;
      return;
    }

    const duplicate = await StoreSubscriptionPayment.findOne({
      'paymentDetails.paymentId': payment.id,
      _id: { $ne: current._id }
    }).session(session);
    if (duplicate) throw Object.assign(new Error('PayMongo payment is already linked to another subscription.'), { statusCode: 409 });

    const store = await Store.findById(current.store).session(session);
    if (!store) throw Object.assign(new Error('Store not found.'), { statusCode: 404 });
    const paidAt = payment.attributes?.paid_at ? new Date(payment.attributes.paid_at * 1000) : new Date();
    const configuredTier = normalizeSubscriptionTier(store.subscriptionTier);
    const pendingEffectiveAt = store.pendingSubscription?.effectiveAt
      ? new Date(store.pendingSubscription.effectiveAt) : null;
    const pendingExpiresAt = store.pendingSubscription?.expiresAt
      ? new Date(store.pendingSubscription.expiresAt) : null;
    const hasEffectivePendingTerm = Boolean(
      store.pendingSubscription?.tier
      && pendingEffectiveAt
      && pendingEffectiveAt <= paidAt
      && (!pendingExpiresAt || pendingExpiresAt > paidAt)
    );
    const activeTier = hasEffectivePendingTerm
      ? normalizeSubscriptionTier(store.pendingSubscription.tier)
      : configuredTier;
    const currentPlan = getSubscriptionPlan(activeTier);
    const targetPlan = getSubscriptionPlan(current.targetTier);
    const currentTermEndsAt = hasEffectivePendingTerm
      ? pendingExpiresAt
      : (store.subscriptionExpires ? new Date(store.subscriptionExpires) : null);
    const hasActivePaidTerm = Boolean(activeTier !== 'free' && currentTermEndsAt && currentTermEndsAt > paidAt);
    const isPaidDowngrade = hasActivePaidTerm && targetPlan.rank < currentPlan.rank;
    const sameActiveTier = activeTier === current.targetTier && hasActivePaidTerm;
    const periodStart = (sameActiveTier || isPaidDowngrade) ? currentTermEndsAt : paidAt;
    const periodEnd = new Date(periodStart.getTime() + (Number(current.planSnapshot.termDays || 30) * 24 * 60 * 60 * 1000));

    if (isPaidDowngrade) {
      store.pendingSubscription = {
        tier: current.targetTier,
        effectiveAt: periodStart,
        expiresAt: periodEnd,
        billingInterval: current.billingInterval || 'monthly',
        paid: true,
        payment: current._id,
        requestedAt: paidAt,
        requestedBy: current.requestedBy
      };
      activationWasScheduled = true;
    } else {
      store.subscriptionTier = current.targetTier;
      store.subscriptionExpires = periodEnd;
      store.subscriptionBillingInterval = current.billingInterval || 'monthly';
      store.pendingSubscription = undefined;
    }
    await store.save({ session });

    current.status = 'paid';
    current.periodStart = periodStart;
    current.periodEnd = periodEnd;
    current.paymentDetails.sessionStatus = 'paid';
    current.paymentDetails.paymentId = payment.id;
    current.paymentDetails.paymentIntentId = payment.attributes?.payment_intent_id;
    current.paymentDetails.paidAt = paidAt;
    current.paymentDetails.failureReason = undefined;
    current.activeKey = undefined;
    await current.save({ session });
    activated = current;
    newlyActivated = true;
  });

  if (amountMismatch) {
    throw Object.assign(new Error('PayMongo payment amount did not match the selected plan.'), { statusCode: 409 });
  }
  if (newlyActivated && activated?.status === 'paid') {
    await ActivityLog.create({
      user: activated.requestedBy,
      store: activated.store,
      action: 'Store Subscription Paid',
      details: activationWasScheduled
        ? `${activated.planSnapshot.name} was prepaid through PayMongo and will run from ${new Date(activated.periodStart).toISOString()} until ${new Date(activated.periodEnd).toISOString()}.`
        : `${activated.planSnapshot.name} was activated through PayMongo until ${new Date(activated.periodEnd).toISOString()}.`
    }).catch(() => {});
  }
  return activated;
};

const markSubscriptionSessionFailed = async purchase => StoreSubscriptionPayment.findOneAndUpdate({
  _id: purchase._id,
  status: { $ne: 'paid' }
}, {
  $set: {
    status: 'failed',
    'paymentDetails.sessionStatus': 'failed',
    'paymentDetails.failureReason': 'PayMongo reported a failed payment.'
  },
  $unset: { activeKey: 1 }
}, { new: true });

const buildPlanSnapshot = (tier, billingInterval = 'monthly') => {
  const plan = getSubscriptionPlan(tier);
  return {
    name: plan.name,
    monthlyPrice: plan.monthlyPrice,
    annualPrice: plan.annualPrice,
    billingInterval,
    listingLimit: plan.listingLimit,
    staffLimit: plan.staffLimit,
    termDays: billingInterval === 'annual' ? 365 : (plan.termDays || 30),
    features: [...plan.features]
  };
};

module.exports = {
  buildPlanSnapshot,
  finalizeSubscriptionPayment,
  markSubscriptionSessionFailed
};
