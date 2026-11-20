const Store = require('../models/Store');
const StoreSubscriptionPayment = require('../models/StoreSubscriptionPayment');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { createNotification } = require('../controllers/notificationController');
const { deliverHtmlEmail, wrapInTemplate } = require('../utils/emailService');
const { SUBSCRIPTION_PLANS, normalizeSubscriptionTier } = require('../config/subscriptionPlans');
const { isLegacyProfessionalStore } = require('./storeSubscriptionService');
const { restoreSubscriptionAccess } = require('../utils/storeSubscriptionState');

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_DAYS = SUBSCRIPTION_PLANS.growth.trialDays;
const SUSPENSION_REASON = 'The one-month Pawzzle Growth trial or paid subscription ended without a confirmed renewal.';

const idString = value => String(value?._id || value || '');
const validDate = value => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

const trialFields = (now = new Date()) => ({
  subscriptionTier: 'growth',
  subscriptionExpires: new Date(now.getTime() + (TRIAL_DAYS * DAY_MS)),
  subscriptionBillingInterval: 'trial',
  subscriptionTrialUsedAt: now,
  subscriptionAccessStatus: 'trial'
});

const activateGrowthTrialIfEligible = async (storeOrId, now = new Date()) => {
  const store = typeof storeOrId === 'object' && storeOrId?._id
    ? storeOrId
    : await Store.findById(storeOrId);
  if (!store || store.isDeleted === true || store.isActive !== true || store.verificationStatus !== 'verified') return null;
  if (isLegacyProfessionalStore(store)) return store;
  if (store.subscriptionTrialUsedAt || store.subscriptionAccessStatus === 'suspended') return store;
  if (normalizeSubscriptionTier(store.subscriptionTier) !== 'free') return store;
  const priorPaidPlan = await StoreSubscriptionPayment.exists({ store: store._id, status: 'paid' });
  if (priorPaidPlan) return store;

  const fields = trialFields(now);
  Object.assign(store, fields);
  store.pendingSubscription = undefined;
  restoreSubscriptionAccess(store);
  await store.save();
  await ActivityLog.create({
    user: store.owner,
    store: store._id,
    action: 'Growth Trial Started',
    details: `Automatic one-month Pawzzle Growth trial activated through ${fields.subscriptionExpires.toISOString()}.`
  }).catch(() => {});
  return store;
};

const findActivePaidTerm = async (store, now) => StoreSubscriptionPayment.findOne({
  store: store._id,
  status: 'paid',
  periodStart: { $lte: now },
  periodEnd: { $gt: now }
}).sort({ periodEnd: -1 });

const applyDuePrepaidTerm = (store, now) => {
  const pending = store.pendingSubscription;
  const effectiveAt = validDate(pending?.effectiveAt);
  const expiresAt = validDate(pending?.expiresAt);
  if (!pending?.paid || !pending?.tier || !effectiveAt || effectiveAt > now || (expiresAt && expiresAt <= now)) return false;
  store.subscriptionTier = pending.tier;
  store.subscriptionExpires = expiresAt;
  store.subscriptionBillingInterval = pending.billingInterval || 'monthly';
  store.pendingSubscription = undefined;
  restoreSubscriptionAccess(store);
  return true;
};

const claimLifecycleNotice = async (storeId, field, now) => Store.findOneAndUpdate({
  _id: storeId,
  $or: [{ [field]: { $exists: false } }, { [field]: null }]
}, { $set: { [field]: now } }, { new: false });

const notifyOwner = async ({ store, title, message, dedupeKey }) => {
  await createNotification({
    recipient: store.owner,
    type: 'system',
    title,
    message,
    relatedId: store._id,
    relatedModel: 'Store',
    targetUrl: '/admin/settings?section=plan',
    dedupeKey
  });
  const owner = await User.findById(store.owner).select('email').lean();
  if (!owner?.email) return;
  const html = wrapInTemplate('Store Subscription', `
    <h2 style="font-size:20px;color:#333;margin:0 0 18px;">${title}</h2>
    <p style="font-size:14px;color:#666;line-height:1.6;">${message}</p>
    <p style="margin:26px 0;"><a href="${process.env.CLIENT_URL || 'https://pawzzle.io'}/admin/settings?section=plan" style="display:inline-block;padding:13px 24px;background:#9db16b;color:#fff;text-decoration:none;font-weight:bold;border-radius:8px;">Review plan</a></p>
  `);
  await deliverHtmlEmail({ email: owner.email, subject: title, html }).catch(() => {});
};

const sendTrialReminder = async (store, days, now) => {
  const field = `subscriptionLifecycle.trialReminder${days}SentAt`;
  const claimed = await claimLifecycleNotice(store._id, field, now);
  if (!claimed) return;
  const title = `Your Pawzzle Growth trial ends in ${days} day${days === 1 ? '' : 's'}`;
  const message = `Choose a paid plan before ${new Date(store.subscriptionExpires).toLocaleDateString('en-PH')} to keep seller access and your listings visible. If no payment is confirmed, the store will be placed on vacation and seller access will be temporarily suspended.`;
  await notifyOwner({ store, title, message, dedupeKey: `subscription-trial-${days}:${idString(store._id)}` });
};

const suspendStore = async (store, now, sendNotifications = true) => {
  if (store.subscriptionAccessStatus !== 'suspended') {
    store.subscriptionAccessStatus = 'suspended';
    store.subscriptionSuspendedAt = now;
    store.subscriptionSuspensionReason = SUSPENSION_REASON;
    store.vacationMode = {
      isActive: true,
      source: 'subscription',
      reason: SUSPENSION_REASON,
      startedAt: now,
      endedAt: undefined
    };
    await store.save();
  }
  if (!sendNotifications) return store;
  const claimed = await claimLifecycleNotice(store._id, 'subscriptionLifecycle.suspensionNoticeSentAt', now);
  if (claimed) {
    await notifyOwner({
      store,
      title: 'Seller access temporarily suspended',
      message: 'No subscription payment was confirmed before your access period ended. Your store is now on vacation, seller access is limited to the Plan page, and active listings are hidden from customers until a paid plan is confirmed.',
      dedupeKey: `subscription-suspended:${idString(store._id)}:${now.toISOString().slice(0, 10)}`
    });
  }
  return store;
};

const reconcileStoreSubscriptionLifecycle = async (storeOrId, options = {}) => {
  const now = options.now || new Date();
  let store = typeof storeOrId === 'object' && storeOrId?._id
    ? storeOrId
    : await Store.findById(storeOrId);
  if (!store || store.isDeleted === true || store.isActive !== true || store.verificationStatus !== 'verified') return store;
  if (isLegacyProfessionalStore(store)) return store;

  if (!store.subscriptionTrialUsedAt && normalizeSubscriptionTier(store.subscriptionTier) === 'free') {
    store = await activateGrowthTrialIfEligible(store, now) || store;
  }
  if (applyDuePrepaidTerm(store, now)) {
    await store.save();
    return store;
  }
  if (normalizeSubscriptionTier(store.subscriptionTier) === 'free') {
    return suspendStore(store, now, options.sendNotifications !== false);
  }

  const expiresAt = validDate(store.subscriptionExpires);
  if (!expiresAt) return store;
  if (expiresAt > now) {
    if (store.subscriptionAccessStatus === 'suspended') {
      restoreSubscriptionAccess(store);
      await store.save();
    }
    if (store.subscriptionBillingInterval === 'trial' && options.sendNotifications !== false) {
      const remaining = expiresAt.getTime() - now.getTime();
      if (remaining <= DAY_MS) await sendTrialReminder(store, 1, now);
      else if (remaining <= 7 * DAY_MS) await sendTrialReminder(store, 7, now);
    }
    return store;
  }

  const paidTerm = await findActivePaidTerm(store, now);
  if (paidTerm) {
    store.subscriptionTier = paidTerm.targetTier;
    store.subscriptionExpires = paidTerm.periodEnd;
    store.subscriptionBillingInterval = paidTerm.billingInterval || 'monthly';
    restoreSubscriptionAccess(store);
    await store.save();
    return store;
  }
  return suspendStore(store, now, options.sendNotifications !== false);
};

const processStoreSubscriptionLifecycles = async (now = new Date()) => {
  const stores = await Store.find({
    isActive: true,
    isDeleted: { $ne: true },
    verificationStatus: 'verified'
  });
  const result = { checked: stores.length, suspended: 0, trials: 0, errors: [] };
  for (const store of stores) {
    try {
      const before = store.subscriptionAccessStatus;
      const beforeTrial = store.subscriptionTrialUsedAt;
      const updated = await reconcileStoreSubscriptionLifecycle(store, { now });
      if (before !== 'suspended' && updated?.subscriptionAccessStatus === 'suspended') result.suspended += 1;
      if (!beforeTrial && updated?.subscriptionTrialUsedAt) result.trials += 1;
    } catch (error) {
      result.errors.push({ storeId: idString(store), message: error.message });
    }
  }
  return result;
};

module.exports = {
  DAY_MS,
  TRIAL_DAYS,
  SUSPENSION_REASON,
  trialFields,
  restoreSubscriptionAccess,
  activateGrowthTrialIfEligible,
  reconcileStoreSubscriptionLifecycle,
  processStoreSubscriptionLifecycles
};
