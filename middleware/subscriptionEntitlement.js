const { isPlatformAdmin } = require('../config/permissions');
const { assertStoreEntitlement } = require('../services/storeSubscriptionService');
const { resolveOperationalStore, resolveSubscriptionContext } = require('../services/storeAccessService');

const resolveStoreId = async req => {
  const store = await resolveOperationalStore(req.user);
  return store?._id || null;
};

const requireSubscriptionEntitlement = (...entitlements) => async (req, res, next) => {
  try {
    if (isPlatformAdmin(req.user)) return next();
    const context = await resolveSubscriptionContext(req.user);
    if (!context?.operationalStore) return res.status(404).json({ message: 'Store not found.' });
    const summaryOptions = { authoritativeSubscription: context.authoritativeSubscription };
    for (const entitlement of entitlements) {
      await assertStoreEntitlement(context.operationalStore, entitlement, summaryOptions);
    }
    // Controllers continue reading and writing the operational Store. The
    // separate plan-store ID is diagnostic metadata only and must never move
    // inventory, attendance, or orders to a duplicate legacy Store row.
    req.subscriptionStoreId = context.operationalStore._id;
    req.subscriptionPlanStoreId = context.subscriptionStoreId;
    req.subscriptionTier = context.tier;
    return next();
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || 'Unable to verify the store plan.',
      code: error.code,
      details: error.details
    });
  }
};

const requireSubscriptionEntitlementWhen = (entitlement, predicate) => async (req, res, next) => {
  if (!predicate(req)) return next();
  return requireSubscriptionEntitlement(entitlement)(req, res, next);
};

module.exports = { resolveStoreId, requireSubscriptionEntitlement, requireSubscriptionEntitlementWhen };
