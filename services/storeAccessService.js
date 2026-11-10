const Store = require('../models/Store');
const { isStoreAdmin, isOperationalStaff } = require('../config/permissions');
const { SUBSCRIPTION_PLANS } = require('../config/subscriptionPlans');
const { getEffectiveTier } = require('./storeSubscriptionService');

const idString = value => String(value?._id || value || '');

const compareOwnedStores = (left, right, preferredStoreId) => {
  const score = store => [
    store?.isActive === true ? 1 : 0,
    store?.verificationStatus === 'verified' ? 1 : 0,
    SUBSCRIPTION_PLANS[getEffectiveTier(store)]?.rank || 0,
    idString(store) === idString(preferredStoreId) ? 1 : 0,
    new Date(store?.updatedAt || store?.createdAt || 0).getTime() || 0
  ];
  const leftScore = score(left);
  const rightScore = score(right);
  for (let index = 0; index < leftScore.length; index += 1) {
    if (leftScore[index] !== rightScore[index]) return rightScore[index] - leftScore[index];
  }
  return idString(left).localeCompare(idString(right));
};

const selectCanonicalOwnedStore = (stores, preferredStoreId) => [...(stores || [])]
  .sort((left, right) => compareOwnedStores(left, right, preferredStoreId))[0] || null;

const findCanonicalOwnedStore = async (userId, preferredStoreId) => {
  const stores = await Store.find({ owner: userId, isDeleted: { $ne: true } });
  return selectCanonicalOwnedStore(stores, preferredStoreId);
};

const resolveOperationalStore = async user => {
  if (!user) return null;
  if (isOperationalStaff(user) && !isStoreAdmin(user)) {
    return user.store
      ? Store.findOne({ _id: user.store._id || user.store, isDeleted: { $ne: true } })
      : null;
  }
  if (isStoreAdmin(user)) return findCanonicalOwnedStore(user._id || user.id, user.store);
  return user.store
    ? Store.findOne({ _id: user.store._id || user.store, isDeleted: { $ne: true } })
    : null;
};

module.exports = {
  selectCanonicalOwnedStore,
  findCanonicalOwnedStore,
  resolveOperationalStore
};
