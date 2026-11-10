const Store = require('../models/Store');
const { isPlatformAdmin } = require('../config/permissions');
const { assertStoreEntitlement } = require('../services/storeSubscriptionService');

const resolveStoreId = async req => {
  if (req.user?.store) return req.user.store;
  const store = await Store.findOne({ owner: req.user?._id, isDeleted: { $ne: true } }).select('_id');
  return store?._id || null;
};

const requireSubscriptionEntitlement = (...entitlements) => async (req, res, next) => {
  try {
    if (isPlatformAdmin(req.user)) return next();
    const storeId = await resolveStoreId(req);
    if (!storeId) return res.status(404).json({ message: 'Store not found.' });
    for (const entitlement of entitlements) await assertStoreEntitlement(storeId, entitlement);
    req.subscriptionStoreId = storeId;
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
