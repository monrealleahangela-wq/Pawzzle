const Product = require('../models/Product');
const Pet = require('../models/Pet');
const Service = require('../models/Service');
const Store = require('../models/Store');
const StoreSubscriptionPayment = require('../models/StoreSubscriptionPayment');
const User = require('../models/User');
const {
  SUBSCRIPTION_PLANS,
  getSubscriptionPlan,
  normalizeSubscriptionTier,
  planHasEntitlement
} = require('../config/subscriptionPlans');

// Active stores that already existed when paid subscriptions were introduced
// were promised Professional access. Keep that promise at runtime so legacy
// verification metadata or an unexecuted migration cannot hide operations.
const LEGACY_PROFESSIONAL_GRANT_CUTOFF = new Date('2026-11-10T07:25:50.000Z');

const getStoreCreatedAt = store => {
  const explicit = store?.createdAt ? new Date(store.createdAt) : null;
  if (explicit && !Number.isNaN(explicit.getTime())) return explicit;
  if (typeof store?._id?.getTimestamp === 'function') return store._id.getTimestamp();
  return null;
};

const isLegacyProfessionalStore = store => {
  const createdAt = getStoreCreatedAt(store);
  return Boolean(
    store?.isActive === true
    && store?.isDeleted !== true
    && !store?.subscriptionLegacyGrantOptOutAt
    && createdAt
    && createdAt.getTime() <= LEGACY_PROFESSIONAL_GRANT_CUTOFF.getTime()
  );
};

const activeListingQueries = storeId => [
  Product.countDocuments({ store: storeId, visibility: { $nin: ['draft', 'hidden'] }, isActive: true, isDeleted: { $ne: true } }),
  Pet.countDocuments({ store: storeId, status: 'available', isAvailable: true, isDeleted: { $ne: true } }),
  Service.countDocuments({ store: storeId, isActive: true, isDeleted: { $ne: true } })
];

const idString = value => String(value?._id || value || '');
const storeSubscriptionFields = 'owner name createdAt updatedAt isActive isDeleted verificationStatus subscriptionLegacyGrantOptOutAt subscriptionTier subscriptionExpires subscriptionBillingInterval subscriptionTrialUsedAt pendingSubscription operatingLocations';

const queryWithOptionalSelect = async (query, fields) => (
  typeof query?.select === 'function' ? query.select(fields) : query
);

const newestActivePayment = payments => [...(payments || [])].sort((left, right) => {
  const timestamp = payment => new Date(
    payment?.periodStart
      || payment?.paymentDetails?.paidAt
      || payment?.updatedAt
      || payment?.createdAt
      || 0
  ).getTime() || 0;
  return timestamp(right) - timestamp(left);
})[0] || null;

const getEffectiveTier = store => {
  if (store?.pendingSubscription?.tier && store?.pendingSubscription?.effectiveAt
    && new Date(store.pendingSubscription.effectiveAt).getTime() <= Date.now()) {
    if (store.pendingSubscription.expiresAt
      && new Date(store.pendingSubscription.expiresAt).getTime() <= Date.now()) {
      return isLegacyProfessionalStore(store) ? 'professional' : 'free';
    }
    return normalizeSubscriptionTier(store.pendingSubscription.tier);
  }
  const configuredTier = normalizeSubscriptionTier(store?.subscriptionTier);
  if (configuredTier === 'free') return isLegacyProfessionalStore(store) ? 'professional' : 'free';
  if (store?.subscriptionExpires && new Date(store.subscriptionExpires).getTime() <= Date.now()) {
    return isLegacyProfessionalStore(store) ? 'professional' : 'free';
  }
  return configuredTier;
};

// A business account can have more than one Store row after an application is
// upgraded or repaired. Operational data remains scoped to the selected Store,
// but subscription access belongs to the business account. Resolve the plan
// once from all server-authorized business rows and current paid records so
// Attendance, procurement, reports, and settings cannot disagree.
const resolveAuthoritativeSubscription = async (store, options = {}) => {
  if (!store?._id) return { tier: 'free', sourceStoreId: null, payment: null };

  const ownerId = options.ownerId || store.owner?._id || store.owner;
  const candidates = new Map([[idString(store), store]]);
  for (const candidate of options.additionalStores || []) {
    if (candidate?._id) candidates.set(idString(candidate), candidate);
  }

  if (ownerId) {
    const relatedStores = await queryWithOptionalSelect(
      Store.find({ owner: ownerId, isDeleted: { $ne: true } }),
      storeSubscriptionFields
    );
    for (const candidate of relatedStores || []) candidates.set(idString(candidate), candidate);
  }

  const storeIds = [...candidates.values()].map(candidate => candidate._id).filter(Boolean);
  const paymentScopes = [];
  if (ownerId && storeIds.length) paymentScopes.push({ store: { $in: storeIds } });
  if (ownerId) paymentScopes.push({ requestedBy: ownerId });

  let payment = null;
  if (paymentScopes.length) {
    const now = new Date();
    const payments = await StoreSubscriptionPayment.find({
      status: 'paid',
      periodStart: { $lte: now },
      periodEnd: { $gt: now },
      $or: paymentScopes
    });
    payment = newestActivePayment(payments);
  }

  // A current, confirmed payment is the strongest source of truth. This also
  // makes an intentional paid downgrade authoritative instead of allowing an
  // older legacy Professional grant to override it.
  if (payment) {
    return {
      tier: normalizeSubscriptionTier(payment.targetTier),
      sourceStoreId: payment.store || store._id,
      payment
    };
  }

  const selectedStore = [...candidates.values()].sort((left, right) => {
    const leftRank = SUBSCRIPTION_PLANS[getEffectiveTier(left)]?.rank || 0;
    const rightRank = SUBSCRIPTION_PLANS[getEffectiveTier(right)]?.rank || 0;
    if (leftRank !== rightRank) return rightRank - leftRank;
    const timestamp = value => new Date(value?.updatedAt || value?.createdAt || 0).getTime() || 0;
    return timestamp(right) - timestamp(left);
  })[0] || store;

  return {
    tier: getEffectiveTier(selectedStore),
    sourceStoreId: selectedStore._id,
    payment: null
  };
};

const getStoreSubscriptionSummary = async (storeOrId, options = {}) => {
  const store = typeof storeOrId === 'object' && storeOrId?._id
    ? storeOrId
    : await Store.findById(storeOrId).select(storeSubscriptionFields);
  if (!store) throw Object.assign(new Error('Store not found.'), { statusCode: 404 });

  const [products, pets, services, staff] = await Promise.all([
    ...activeListingQueries(store._id),
    User.countDocuments({ store: store._id, role: 'staff', isActive: { $ne: false }, isDeleted: { $ne: true }, staffStatus: { $nin: ['inactive', 'suspended', 'archived'] } })
  ]);
  const authoritative = options.authoritativeSubscription || await resolveAuthoritativeSubscription(store, options);
  const effectiveTier = normalizeSubscriptionTier(authoritative.tier);
  const pendingIsEffective = Boolean(store.pendingSubscription?.tier
    && store.pendingSubscription?.effectiveAt
    && new Date(store.pendingSubscription.effectiveAt).getTime() <= Date.now());
  const plan = getSubscriptionPlan(effectiveTier);
  const activeListings = products + pets + services;
  const activeLocations = 1 + (store.operatingLocations || []).filter(location => location.isActive !== false).length;
  const pendingStartsAt = store.pendingSubscription?.effectiveAt
    ? new Date(store.pendingSubscription.effectiveAt).getTime() : null;
  const pending = store.pendingSubscription?.tier && pendingStartsAt > Date.now() ? {
    tier: normalizeSubscriptionTier(store.pendingSubscription.tier),
    effectiveAt: store.pendingSubscription.effectiveAt,
    expiresAt: store.pendingSubscription.expiresAt,
    billingInterval: store.pendingSubscription.billingInterval,
    paid: Boolean(store.pendingSubscription.paid),
    requestedAt: store.pendingSubscription.requestedAt
  } : null;

  return {
    tier: effectiveTier,
    configuredTier: normalizeSubscriptionTier(store.subscriptionTier),
    expiresAt: authoritative.payment?.periodEnd || (pendingIsEffective
      ? (store.pendingSubscription.expiresAt || null)
      : (store.subscriptionExpires || null)),
    billingInterval: authoritative.payment?.billingInterval || (pendingIsEffective
      ? (store.pendingSubscription.billingInterval || 'monthly')
      : (store.subscriptionBillingInterval || 'monthly')),
    subscriptionSource: {
      storeId: authoritative.sourceStoreId || store._id,
      type: authoritative.payment ? 'paid_subscription' : 'store_configuration'
    },
    trialAvailable: !store.subscriptionTrialUsedAt,
    pendingSubscription: pending,
    plan,
    usage: {
      activeListings,
      listingsByType: { products, pets, services },
      activeStaff: staff,
      activeLocations
    },
    allowances: {
      listings: plan.listingLimit,
      staff: plan.staffLimit,
      locations: plan.locationLimit
    },
    capabilities: {
      canAddListing: plan.listingLimit === null || activeListings < plan.listingLimit,
      canAddStaff: staff < plan.staffLimit,
      canAddLocation: activeLocations < plan.locationLimit,
      multiLocationOperationsAvailable: planHasEntitlement(effectiveTier, 'multi_location'),
      entitlements: Object.fromEntries(plan.entitlements.map(entitlement => [entitlement, true])),
      overListingLimit: plan.listingLimit !== null && activeListings > plan.listingLimit,
      overStaffLimit: staff > plan.staffLimit,
      overLocationLimit: activeLocations > plan.locationLimit
    }
  };
};

const limitError = (code, message, summary) => Object.assign(new Error(message), {
  statusCode: 409,
  code,
  details: { tier: summary.tier, usage: summary.usage, allowances: summary.allowances }
});

const assertCanActivateListing = async storeId => {
  const summary = await getStoreSubscriptionSummary(storeId);
  if (!summary.capabilities.canAddListing) {
    throw limitError(
      'SUBSCRIPTION_LISTING_LIMIT',
      `${summary.plan.name} allows ${summary.allowances.listings} active listings. Hide an existing listing or upgrade your plan before publishing another one.`,
      summary
    );
  }
  return summary;
};

const assertCanAddStaff = async storeId => {
  const summary = await getStoreSubscriptionSummary(storeId);
  if (!summary.capabilities.canAddStaff) {
    const allowance = summary.allowances.staff === 0 ? 'owner-only access' : `${summary.allowances.staff} staff accounts`;
    throw limitError(
      'SUBSCRIPTION_STAFF_LIMIT',
      `${summary.plan.name} includes ${allowance}. Upgrade the store plan before adding another staff account.`,
      summary
    );
  }
  return summary;
};

const assertStoreEntitlement = async (storeId, entitlement, options = {}) => {
  const summary = await getStoreSubscriptionSummary(storeId, options);
  if (!planHasEntitlement(summary.tier, entitlement)) {
    const required = Object.values(require('../config/subscriptionPlans').SUBSCRIPTION_PLANS)
      .find(plan => plan.entitlements.includes(entitlement));
    throw Object.assign(new Error(`${required?.name || 'A paid plan'} is required to use this feature. Your existing data remains available.`), {
      statusCode: 403,
      code: 'SUBSCRIPTION_ENTITLEMENT_REQUIRED',
      details: { entitlement, currentTier: summary.tier, requiredTier: required?.id || null }
    });
  }
  return summary;
};

const assertCanAddLocation = async storeId => {
  const summary = await getStoreSubscriptionSummary(storeId);
  if (!summary.capabilities.canAddLocation) {
    throw limitError('SUBSCRIPTION_LOCATION_LIMIT', `${summary.plan.name} allows ${summary.allowances.locations} store location${summary.allowances.locations === 1 ? '' : 's'}.`, summary);
  }
  return summary;
};

module.exports = {
  LEGACY_PROFESSIONAL_GRANT_CUTOFF,
  isLegacyProfessionalStore,
  getEffectiveTier,
  resolveAuthoritativeSubscription,
  getStoreSubscriptionSummary,
  assertCanActivateListing,
  assertCanAddStaff,
  assertCanAddLocation,
  assertStoreEntitlement
};
