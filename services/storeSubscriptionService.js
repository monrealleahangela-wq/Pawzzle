const Product = require('../models/Product');
const Pet = require('../models/Pet');
const Service = require('../models/Service');
const Store = require('../models/Store');
const User = require('../models/User');
const { getSubscriptionPlan, normalizeSubscriptionTier, planHasEntitlement } = require('../config/subscriptionPlans');

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

const getEffectiveTier = store => {
  if (store?.pendingSubscription?.tier && store?.pendingSubscription?.effectiveAt
    && new Date(store.pendingSubscription.effectiveAt).getTime() <= Date.now()) {
    if (store.pendingSubscription.expiresAt
      && new Date(store.pendingSubscription.expiresAt).getTime() <= Date.now()) return 'free';
    return normalizeSubscriptionTier(store.pendingSubscription.tier);
  }
  const configuredTier = normalizeSubscriptionTier(store?.subscriptionTier);
  if (configuredTier === 'free') return isLegacyProfessionalStore(store) ? 'professional' : 'free';
  if (store?.subscriptionExpires && new Date(store.subscriptionExpires).getTime() <= Date.now()) return 'free';
  return configuredTier;
};

const getStoreSubscriptionSummary = async storeOrId => {
  const store = typeof storeOrId === 'object' && storeOrId?._id
    ? storeOrId
    : await Store.findById(storeOrId).select('name createdAt isActive isDeleted verificationStatus subscriptionLegacyGrantOptOutAt subscriptionTier subscriptionExpires subscriptionBillingInterval subscriptionTrialUsedAt pendingSubscription operatingLocations');
  if (!store) throw Object.assign(new Error('Store not found.'), { statusCode: 404 });

  const [products, pets, services, staff] = await Promise.all([
    ...activeListingQueries(store._id),
    User.countDocuments({ store: store._id, role: 'staff', isActive: { $ne: false }, isDeleted: { $ne: true }, staffStatus: { $nin: ['inactive', 'suspended', 'archived'] } })
  ]);
  const effectiveTier = getEffectiveTier(store);
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
    expiresAt: pendingIsEffective
      ? (store.pendingSubscription.expiresAt || null)
      : (store.subscriptionExpires || null),
    billingInterval: pendingIsEffective
      ? (store.pendingSubscription.billingInterval || 'monthly')
      : (store.subscriptionBillingInterval || 'monthly'),
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

const assertStoreEntitlement = async (storeId, entitlement) => {
  const summary = await getStoreSubscriptionSummary(storeId);
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
  getStoreSubscriptionSummary,
  assertCanActivateListing,
  assertCanAddStaff,
  assertCanAddLocation,
  assertStoreEntitlement
};
