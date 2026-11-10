const Store = require('../models/Store');
const { isStoreAdmin, isOperationalStaff } = require('../config/permissions');
const { SUBSCRIPTION_PLANS } = require('../config/subscriptionPlans');
const { getEffectiveTier } = require('./storeSubscriptionService');

const idString = value => String(value?._id || value || '');

const compareOwnedStores = (left, right, preferredStoreId) => {
  const score = store => [
    // A paid subscription is the strongest owner-store identity signal. Old
    // application rows can remain active/verified after a replacement store
    // receives the paid plan, so status metadata must not make the Free row
    // authoritative for subscription-gated operations.
    SUBSCRIPTION_PLANS[getEffectiveTier(store)]?.rank || 0,
    store?.isActive === true ? 1 : 0,
    store?.verificationStatus === 'verified' ? 1 : 0,
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

// Older owner accounts can have an explicitly assigned store that predates (or
// no longer matches) the Store.owner relationship. That assignment is still a
// server-managed authorization boundary and is used throughout the admin
// application. Include it when resolving an owner account so subscription,
// dashboard, supplier, and reporting routes cannot select different stores.
const findCanonicalStoreForAdmin = async user => {
  const userId = user?._id || user?.id;
  const preferredStoreId = user?.store?._id || user?.store;
  const [ownedStores, assignedStore] = await Promise.all([
    userId ? Store.find({ owner: userId, isDeleted: { $ne: true } }) : [],
    preferredStoreId
      ? Store.findOne({ _id: preferredStoreId, isDeleted: { $ne: true } })
      : null
  ]);

  const candidates = new Map();
  for (const store of ownedStores || []) candidates.set(idString(store), store);
  if (assignedStore) candidates.set(idString(assignedStore), assignedStore);
  return selectCanonicalOwnedStore([...candidates.values()], preferredStoreId);
};

const resolveOperationalStore = async user => {
  if (!user) return null;
  if (isOperationalStaff(user) && !isStoreAdmin(user)) {
    return user.store
      ? Store.findOne({ _id: user.store._id || user.store, isDeleted: { $ne: true } })
      : null;
  }
  if (isStoreAdmin(user)) return findCanonicalStoreForAdmin(user);
  return user.store
    ? Store.findOne({ _id: user.store._id || user.store, isDeleted: { $ne: true } })
    : null;
};

module.exports = {
  selectCanonicalOwnedStore,
  findCanonicalOwnedStore,
  findCanonicalStoreForAdmin,
  resolveOperationalStore
};
