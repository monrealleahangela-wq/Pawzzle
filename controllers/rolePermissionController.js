const Store = require('../models/Store');
const ActivityLog = require('../models/ActivityLog');
const { createNotification } = require('./notificationController');
const { isPlatformAdmin } = require('../config/permissions');
const {
  EDITABLE_ROLES,
  PERMISSION_CATALOG,
  getPolicyObject,
  sanitizeRolePermissions,
  defaultPolicyForRole,
  policyForRole,
  staffForRole
} = require('../services/rolePermissionService');

const resolveManagedStore = async req => {
  if (isPlatformAdmin(req.user)) {
    const storeId = req.query.storeId || req.body.storeId;
    return storeId ? Store.findOne({ _id: storeId, isDeleted: { $ne: true } }) : null;
  }
  return Store.findOne({ owner: req.user._id, isDeleted: { $ne: true } });
};

const mergePermissionMaps = (defaults = {}, configured = {}) => {
  const result = { ...defaults };
  Object.entries(configured).forEach(([resource, actions]) => {
    result[resource] = { ...(defaults[resource] || {}), ...(actions || {}) };
  });
  return result;
};

const getRolePermissions = async (req, res) => {
  try {
    const store = await resolveManagedStore(req);
    if (!store) return res.status(404).json({ message: isPlatformAdmin(req.user) ? 'Select a store to manage its roles.' : 'Store not found.' });
    const configured = getPolicyObject(store);
    const counts = await Promise.all(EDITABLE_ROLES.map(role => staffForRole(store._id, role).countDocuments()));
    res.json({
      store: { _id: store._id, name: store.name },
      permissionCatalog: PERMISSION_CATALOG,
      roles: EDITABLE_ROLES.map((role, index) => ({
        role,
        staffCount: counts[index],
        defaults: defaultPolicyForRole(role),
        configured: configured[role] || null,
        effective: mergePermissionMaps(defaultPolicyForRole(role), policyForRole(store, role))
      }))
    });
  } catch (error) {
    console.error('Get role permissions error:', error);
    res.status(500).json({ message: 'Unable to load role permissions.' });
  }
};

const updateRolePermissions = async (req, res) => {
  try {
    const role = req.params.role;
    if (!EDITABLE_ROLES.includes(role)) return res.status(400).json({ message: 'This role cannot receive store-staff permissions.' });
    const store = await resolveManagedStore(req);
    if (!store) return res.status(404).json({ message: isPlatformAdmin(req.user) ? 'Select a store to manage its roles.' : 'Store not found.' });
    const clean = sanitizeRolePermissions(req.body.permissions);
    const allPolicies = getPolicyObject(store);
    const previous = allPolicies[role] || {};
    if (JSON.stringify(previous) === JSON.stringify(clean)) {
      return res.json({ message: 'Role permissions are already up to date.', role, permissions: clean });
    }
    store.rolePermissions = { ...allPolicies, [role]: clean };
    store.markModified('rolePermissions');
    await store.save();

    const affected = await staffForRole(store._id, role).select('_id');
    await Promise.all(affected.map(member => createNotification({
      recipient: member._id,
      sender: req.user._id,
      type: 'user_action',
      title: 'Role Permissions Updated',
      message: `Your ${role.replaceAll('_', ' ')} access profile was updated. The new permissions apply immediately.`,
      relatedId: member._id,
      relatedModel: 'User',
      targetUrl: '/profile'
    }, req.app.get('socketio'))));
    await ActivityLog.create({
      user: req.user._id,
      action: 'Role Permissions Updated',
      details: `${role} permissions updated for store ${store.name}; ${affected.length} staff account(s) inherit the change.`,
      ipAddress: req.ip
    });
    const io = req.app.get('socketio');
    if (io) {
      // Already-connected staff must receive the same effective policy as the
      // next HTTP request; update authenticated socket identity in place.
      await Promise.all(affected.map(async member => {
        const sockets = await io.in(`user_${member._id}`).fetchSockets();
        sockets.forEach(socket => {
          if (!socket.data?.user) return;
          socket.data.user.rolePolicyPermissions = clean;
          if (socket.data.user.$locals) socket.data.user.$locals.rolePolicyPermissions = clean;
        });
      }));
      io.to(`store_${store._id}`).emit('rolePermissionsUpdated', { role, storeId: String(store._id) });
    }
    res.json({ message: 'Role permissions updated for every staff member assigned to this role.', role, permissions: clean, affectedStaff: affected.length });
  } catch (error) {
    console.error('Update role permissions error:', error);
    res.status(500).json({ message: 'Unable to update role permissions.' });
  }
};

module.exports = { getRolePermissions, updateRolePermissions };
