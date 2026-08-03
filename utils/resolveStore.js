const Store = require('../models/Store');

const PLATFORM_ROLES = new Set(['super_admin', 'platform_admin']);

/**
 * Resolves a user's store without allowing non-platform users to select an
 * unrelated store through request parameters.
 */
const resolveStore = async (req, { allowExplicitStore = true } = {}) => {
  const explicitStore = allowExplicitStore
    ? req.params?.storeId || req.query?.storeId || req.body?.storeId
    : null;

  if (req.user?.store) {
    if (explicitStore && String(explicitStore) !== String(req.user.store)) {
      return PLATFORM_ROLES.has(req.user.role) ? explicitStore : null;
    }
    return req.user.store;
  }

  if (explicitStore && PLATFORM_ROLES.has(req.user?.role)) return explicitStore;

  const ownedStore = await Store.findOne({ owner: req.user?._id }).select('_id').lean();
  if (!ownedStore) return null;
  if (explicitStore && String(explicitStore) !== String(ownedStore._id)) return null;
  return ownedStore._id;
};

module.exports = resolveStore;
