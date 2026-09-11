const User = require('../models/User');

const STORE_OWNER_ROLES = ['admin', 'store_owner'];

const getCustomerVisibleOwnerIds = async () => User.find({
  role: { $in: STORE_OWNER_ROLES },
  isActive: { $ne: false },
  isDeleted: { $ne: true }
}).distinct('_id');

const buildCustomerVisibleStoreFilter = (ownerIds, extra = {}) => ({
  owner: { $in: ownerIds },
  isActive: true,
  isDeleted: { $ne: true },
  verificationStatus: 'verified',
  name: { $ne: 'Admin Pet Store' },
  ...(Object.keys(extra).length ? { $and: [extra] } : {})
});

const isCustomerVisibleStoreRecord = (store, owner) => Boolean(
  store &&
  owner &&
  store.isActive === true &&
  store.isDeleted !== true &&
  store.verificationStatus === 'verified' &&
  owner.isActive !== false &&
  owner.isDeleted !== true &&
  STORE_OWNER_ROLES.includes(owner.role) &&
  String(store.owner) === String(owner._id)
);

module.exports = {
  STORE_OWNER_ROLES,
  getCustomerVisibleOwnerIds,
  buildCustomerVisibleStoreFilter,
  isCustomerVisibleStoreRecord
};
