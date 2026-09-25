const User = require('../models/User');

const STORE_OWNER_ROLES = ['admin', 'store_owner'];

// Public Store queries use an explicit allowlist. Excluding whole embedded
// documents such as `taxProfile` conflicts with the schema's nested
// `select: false` paths and MongoDB rejects the resulting projection as a path
// collision. An allowlist also keeps compliance and payout data private by
// construction.
const CUSTOMER_VISIBLE_STORE_FIELDS = [
  '_id',
  'owner',
  'name',
  'slug',
  'description',
  'logo',
  'coverImage',
  'businessType',
  'operationalModules',
  'staffingConfiguration.isStaffVisibleToCustomers',
  'contactInfo',
  'socialMedia',
  'businessHours',
  'specialties',
  'services',
  'ratings',
  'verificationStatus',
  'featured',
  'stats.responseRate',
  'stats.responseTime',
  'stats.activeListingsCount',
  'createdAt',
  'updatedAt'
].join(' ');

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

const withCustomerComplianceFilter = filter => ({
  ...filter,
  'businessCompliance.restrictionReasons': { $not: { $elemMatch: { active: true } } }
});

const isCustomerVisibleStoreRecord = (store, owner) => Boolean(
  store &&
  owner &&
  store.isActive === true &&
  store.isDeleted !== true &&
  store.verificationStatus === 'verified' &&
  !(store.businessCompliance?.restrictionReasons || []).some(reason => reason.active !== false) &&
  owner.isActive !== false &&
  owner.isDeleted !== true &&
  STORE_OWNER_ROLES.includes(owner.role) &&
  String(store.owner) === String(owner._id)
);

module.exports = {
  STORE_OWNER_ROLES,
  CUSTOMER_VISIBLE_STORE_FIELDS,
  getCustomerVisibleOwnerIds,
  buildCustomerVisibleStoreFilter,
  withCustomerComplianceFilter,
  isCustomerVisibleStoreRecord
};
