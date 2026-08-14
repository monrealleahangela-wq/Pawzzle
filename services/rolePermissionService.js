const Store = require('../models/Store');
const User = require('../models/User');
const { normalizeRole, ROLE_PERMISSIONS, getEffectivePermissions, isPlatformAdmin } = require('../config/permissions');

const EDITABLE_ROLES = [
  'manager', 'service_staff', 'cashier', 'inventory_staff', 'procurement_officer',
  'finance_staff', 'veterinarian', 'groomer', 'trainer', 'boarding_staff',
  'delivery_dispatcher', 'delivery_rider'
];

const PERMISSION_CATALOG = {
  bookings: ['view', 'confirm', 'update', 'cancel', 'manage'],
  sales: ['view', 'manage'],
  inventory: ['view', 'manage'],
  procurement: ['view', 'manage'],
  finance: ['view', 'manage'],
  logistics: ['view', 'manage'],
  customers: ['view', 'manage'],
  staff: ['view', 'manage'],
  reports: ['view', 'manage'],
  dss: ['view', 'manage'],
  settings: ['view', 'manage'],
  clinical: ['view', 'manage'],
  pet_updates: ['create']
};

const getPolicyObject = store => {
  const value = store?.rolePermissions;
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  return value.toObject ? value.toObject() : value;
};

const sanitizeRolePermissions = input => {
  const output = {};
  for (const [resource, actions] of Object.entries(PERMISSION_CATALOG)) {
    const source = input?.[resource];
    if (!source || typeof source !== 'object') continue;
    const clean = {};
    for (const action of actions) {
      if (typeof source[action] === 'boolean') clean[action] = source[action];
    }
    if (Object.keys(clean).length) output[resource] = clean;
  }
  return output;
};

const defaultPolicyForRole = role => {
  const nested = {};
  for (const permission of ROLE_PERMISSIONS[role] || []) {
    if (permission === '*') continue;
    const [resource, action] = permission.split('.');
    if (!PERMISSION_CATALOG[resource]?.includes(action)) continue;
    nested[resource] = { ...(nested[resource] || {}), [action]: true };
  }
  return nested;
};

const policyForRole = (store, role) => {
  const configured = getPolicyObject(store)?.[role];
  return configured && typeof configured === 'object' ? configured : {};
};

const attachStoreRolePolicy = async user => {
  if (!user || isPlatformAdmin(user) || !user.store) return user;
  const role = normalizeRole(user);
  if (!EDITABLE_ROLES.includes(role)) return user;
  const storeId = user.store?._id || user.store;
  const store = await Store.findById(storeId).select('rolePermissions');
  const policy = policyForRole(store, role);
  if (user.$locals) user.$locals.rolePolicyPermissions = policy;
  else user.rolePolicyPermissions = policy;
  return user;
};

const serializeEffectivePermissionMap = user => {
  const result = {};
  for (const permission of getEffectivePermissions(user)) {
    if (permission === '*') continue;
    const [resource, action] = permission.split('.');
    result[resource] = { ...(result[resource] || {}), [action]: true };
  }
  const source = user?.$locals?.rolePolicyPermissions ?? user?.rolePolicyPermissions;
  for (const [resource, actions] of Object.entries(source || {})) {
    result[resource] = { ...(result[resource] || {}), ...actions };
  }
  return result;
};

const staffForRole = (storeId, role) => User.find({
  store: storeId,
  isDeleted: false,
  staffStatus: { $ne: 'archived' },
  $or: [{ role }, { role: 'staff', staffType: role }]
});

module.exports = {
  EDITABLE_ROLES,
  PERMISSION_CATALOG,
  getPolicyObject,
  sanitizeRolePermissions,
  defaultPolicyForRole,
  policyForRole,
  attachStoreRolePolicy,
  serializeEffectivePermissionMap,
  staffForRole
};
