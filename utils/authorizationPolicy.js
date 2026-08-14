const Store = require('../models/Store');
const {
  isPlatformAdmin,
  isStoreAdmin,
  isOperationalStaff,
  hasPermission
} = require('../config/permissions');

const idsEqual = (left, right) => Boolean(left && right)
  && String(left?._id || left) === String(right?._id || right);

const getAuthorizedStoreIds = async user => {
  if (!user) return [];
  if (isPlatformAdmin(user)) return null;

  const ids = new Set();
  if (user.store) ids.add(String(user.store?._id || user.store));
  if (isStoreAdmin(user)) {
    const owned = await Store.find({ owner: user._id }).select('_id').lean();
    owned.forEach(store => ids.add(String(store._id)));
  }
  return [...ids];
};

const canAccessStore = async (user, storeId) => {
  if (!user || !storeId) return false;
  const authorized = await getAuthorizedStoreIds(user);
  return authorized === null || authorized.includes(String(storeId?._id || storeId));
};

const hasAnyPermission = (user, permissions) => permissions.some(permission => hasPermission(user, permission));

const canOperateStore = async (user, storeId, permissions = []) => {
  if (isPlatformAdmin(user)) return true;
  if (!isStoreAdmin(user) && !isOperationalStaff(user)) return false;
  if (permissions.length && !hasAnyPermission(user, permissions)) return false;
  return canAccessStore(user, storeId);
};

module.exports = {
  idsEqual,
  getAuthorizedStoreIds,
  canAccessStore,
  hasAnyPermission,
  canOperateStore
};
