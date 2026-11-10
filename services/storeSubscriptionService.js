const Product = require('../models/Product');
const Pet = require('../models/Pet');
const Service = require('../models/Service');
const Store = require('../models/Store');
const User = require('../models/User');
const { getSubscriptionPlan, normalizeSubscriptionTier } = require('../config/subscriptionPlans');

const activeListingQueries = storeId => [
  Product.countDocuments({ store: storeId, visibility: { $nin: ['draft', 'hidden'] }, isActive: true, isDeleted: { $ne: true } }),
  Pet.countDocuments({ store: storeId, status: 'available', isAvailable: true, isDeleted: { $ne: true } }),
  Service.countDocuments({ store: storeId, isActive: true, isDeleted: { $ne: true } })
];

const getEffectiveTier = store => {
  const configuredTier = normalizeSubscriptionTier(store?.subscriptionTier);
  if (configuredTier === 'free') return 'free';
  if (store?.subscriptionExpires && new Date(store.subscriptionExpires).getTime() <= Date.now()) return 'free';
  return configuredTier;
};

const getStoreSubscriptionSummary = async storeOrId => {
  const store = typeof storeOrId === 'object' && storeOrId?._id
    ? storeOrId
    : await Store.findById(storeOrId).select('name subscriptionTier subscriptionExpires');
  if (!store) throw Object.assign(new Error('Store not found.'), { statusCode: 404 });

  const [products, pets, services, staff] = await Promise.all([
    ...activeListingQueries(store._id),
    User.countDocuments({ store: store._id, role: 'staff', isActive: { $ne: false }, isDeleted: { $ne: true }, staffStatus: { $nin: ['inactive', 'suspended', 'archived'] } })
  ]);
  const effectiveTier = getEffectiveTier(store);
  const plan = getSubscriptionPlan(effectiveTier);
  const activeListings = products + pets + services;

  return {
    tier: effectiveTier,
    configuredTier: normalizeSubscriptionTier(store.subscriptionTier),
    expiresAt: store.subscriptionExpires || null,
    plan,
    usage: {
      activeListings,
      listingsByType: { products, pets, services },
      activeStaff: staff
    },
    allowances: {
      listings: plan.listingLimit,
      staff: plan.staffLimit,
      locations: plan.locationLimit
    },
    capabilities: {
      canAddListing: plan.listingLimit === null || activeListings < plan.listingLimit,
      canAddStaff: staff < plan.staffLimit,
      multiLocationOperationsAvailable: false
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

module.exports = {
  getEffectiveTier,
  getStoreSubscriptionSummary,
  assertCanActivateListing,
  assertCanAddStaff
};
