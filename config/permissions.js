const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  platform_admin: ['*'],
  admin: [
    'dashboard.view', 'users.manage', 'staff.manage', 'customers.manage',
    'pets.manage', 'clinical.manage', 'services.manage', 'bookings.manage', 'sales.manage',
    'inventory.manage', 'procurement.manage', 'finance.manage',
    'logistics.manage', 'reports.view', 'dss.manage'
  ],
  store_owner: [
    'dashboard.view', 'users.manage', 'staff.manage', 'customers.manage',
    'pets.manage', 'clinical.manage', 'services.manage', 'bookings.manage', 'sales.manage',
    'inventory.manage', 'procurement.manage', 'finance.manage',
    'logistics.manage', 'reports.view', 'dss.manage'
  ],
  manager: [
    'dashboard.view', 'staff.view', 'customers.manage', 'pets.manage',
    'clinical.view', 'services.manage', 'sales.manage', 'inventory.manage',
    'procurement.manage', 'finance.view', 'logistics.manage',
    'reports.view', 'dss.view', 'bookings.manage'
  ],
  service_staff: [
    'dashboard.view', 'customers.view', 'pets.view', 'services.view',
    'bookings.view', 'bookings.confirm', 'bookings.update',
    'pet_updates.create'
  ],
  cashier: [
    'dashboard.view', 'customers.view', 'pets.view', 'products.view',
    'sales.create', 'sales.view', 'payments.create'
  ],
  inventory_staff: [
    'dashboard.view', 'products.view', 'inventory.view', 'inventory.create',
    'inventory.adjust', 'inventory.receive', 'procurement.view',
    'reports.inventory', 'dss.inventory'
  ],
  procurement_officer: [
    'dashboard.view', 'inventory.view', 'procurement.manage',
    'suppliers.manage', 'finance.view', 'dss.suppliers'
  ],
  finance_staff: [
    'dashboard.view', 'sales.view', 'procurement.view', 'finance.manage',
    'reports.finance', 'payments.manage'
  ],
  veterinarian: [
    'dashboard.view', 'customers.view', 'pets.view', 'clinical.manage',
    'services.view', 'bookings.assigned', 'inventory.vaccine',
    'pet_updates.create', 'bookings.update'
  ],
  veterinary_technician: [
    'dashboard.view', 'customers.assigned', 'pets.safety_summary',
    'services.view', 'bookings.assigned', 'bookings.update',
    'clinical.assist', 'pet_updates.create'
  ],
  veterinary_assistant: [
    'dashboard.view', 'customers.assigned', 'pets.safety_summary',
    'services.view', 'bookings.assigned', 'clinical.assist'
  ],
  veterinary_nurse: [
    'dashboard.view', 'customers.assigned', 'pets.safety_summary',
    'services.view', 'bookings.assigned', 'bookings.update',
    'clinical.nursing', 'pet_updates.create'
  ],
  veterinary_laboratory_technician: [
    'dashboard.view', 'customers.assigned', 'pets.safety_summary',
    'services.view', 'bookings.assigned', 'clinical.lab'
  ],
  groomer: [
    'dashboard.view', 'customers.assigned', 'pets.safety_summary',
    'services.view', 'bookings.assigned', 'bookings.update',
    'pet_updates.create'
  ],
  trainer: [
    'dashboard.view', 'customers.assigned', 'pets.safety_summary',
    'services.view', 'bookings.assigned', 'bookings.update',
    'pet_updates.create'
  ],
  boarding_staff: [
    'dashboard.view', 'customers.assigned', 'pets.safety_summary',
    'services.view', 'bookings.assigned', 'bookings.update',
    'pet_updates.create'
  ],
  delivery_dispatcher: [
    'dashboard.view', 'sales.view', 'logistics.manage', 'reports.delivery'
  ],
  delivery_rider: [
    'dashboard.view', 'deliveries.own', 'deliveries.update_own'
  ],
  supplier: [
    'dashboard.view', 'supplier_profile.own', 'supplier_catalog.own',
    'purchase_orders.own', 'supplier_invoices.own'
  ],
  customer: [
    'products.view', 'services.view', 'account.own', 'pets.own',
    'orders.own', 'bookings.own', 'deliveries.own', 'messages.own'
  ],
  auditor: ['dashboard.view', 'reports.view', 'audit.view']
};

const LEGACY_STAFF_ROLE_MAP = {
  veterinarian: 'veterinarian',
  veterinary_technician: 'veterinary_technician',
  veterinary_assistant: 'veterinary_assistant',
  veterinary_nurse: 'veterinary_nurse',
  veterinary_laboratory_technician: 'veterinary_laboratory_technician',
  groomer: 'groomer',
  trainer: 'trainer',
  boarding_specialist: 'boarding_staff',
  boarding_staff: 'boarding_staff',
  inventory_staff: 'inventory_staff',
  manager: 'manager',
  cashier: 'cashier',
  procurement_officer: 'procurement_officer',
  finance_staff: 'finance_staff',
  delivery_dispatcher: 'delivery_dispatcher',
  logistics_staff: 'delivery_dispatcher',
  sales_staff: 'cashier',
  order_staff: 'cashier',
  service_staff: 'service_staff',
  service_management_staff: 'manager',
  administrative_support: 'manager',
  medical_assistant: 'veterinary_assistant',
  pet_handler: 'boarding_staff',
  delivery_rider: 'delivery_rider'
};

const PLATFORM_ADMIN_ROLES = new Set(['super_admin', 'platform_admin']);
const STORE_ADMIN_ROLES = new Set(['admin', 'store_owner']);
const SPECIALIZED_OPERATIONAL_ROLES = new Set([
  'manager', 'cashier', 'inventory_staff', 'procurement_officer',
  'finance_staff', 'service_staff', 'veterinarian', 'groomer', 'trainer', 'boarding_staff',
  'veterinary_technician', 'veterinary_assistant', 'veterinary_nurse',
  'veterinary_laboratory_technician', 'delivery_dispatcher', 'delivery_rider',
  'auditor'
]);

const isPlatformAdmin = userOrRole => PLATFORM_ADMIN_ROLES.has(
  typeof userOrRole === 'string' ? userOrRole : userOrRole?.role
);

const isStoreAdmin = userOrRole => STORE_ADMIN_ROLES.has(
  typeof userOrRole === 'string' ? userOrRole : userOrRole?.role
);

const isOperationalStaff = userOrRole => {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
  return role === 'staff' || SPECIALIZED_OPERATIONAL_ROLES.has(role);
};

const normalizeRole = (user) => {
  if (!user) return null;
  if (PLATFORM_ADMIN_ROLES.has(user.role)) return 'super_admin';
  if (STORE_ADMIN_ROLES.has(user.role)) return 'admin';
  if (user.role === 'staff') {
    // An incomplete legacy staff record must never inherit manager access.
    return LEGACY_STAFF_ROLE_MAP[user.staffType] || 'unassigned_staff';
  }
  return user.role;
};

const permissionMatches = (granted, required) => {
  if (granted === '*') return true;
  if (granted === required) return true;
  const [grantedResource, grantedAction] = granted.split('.');
  const [requiredResource] = required.split('.');
  return grantedResource === requiredResource && grantedAction === 'manage';
};

const getEffectivePermissions = (user) => {
  const role = normalizeRole(user);
  const defaults = ROLE_PERMISSIONS[role] || [];
  const scopedPolicy = user?.$locals && Object.prototype.hasOwnProperty.call(user.$locals, 'rolePolicyPermissions')
    ? user.$locals.rolePolicyPermissions
    : user?.rolePolicyPermissions;
  const source = scopedPolicy !== undefined ? scopedPolicy : user?.permissions;
  const overrides = source instanceof Map ? Object.fromEntries(source) : (source || {});

  const explicit = [];
  const denied = new Set();
  for (const [permission, allowed] of Object.entries(overrides)) {
    if (allowed === true) explicit.push(permission);
    else if (allowed === false) denied.add(permission);
    else if (allowed && typeof allowed === 'object') {
      for (const [action, enabled] of Object.entries(allowed)) {
        if (action === 'fullAccess' && enabled) explicit.push(`${permission}.manage`);
        else if (action !== 'fullAccess' && enabled === true) explicit.push(`${permission}.${action}`);
        else if (action !== 'fullAccess' && enabled === false) denied.add(`${permission}.${action}`);
      }
    }
  }

  return [...new Set([...defaults, ...explicit])].filter((p) => !denied.has(p));
};

// Explicit action settings have precedence over inherited role permissions.
// Exact action -> resource fullAccess/manage -> role defaults is the stable order.
const getExplicitPermissionState = (user, required) => {
  const scopedPolicy = user?.$locals && Object.prototype.hasOwnProperty.call(user.$locals, 'rolePolicyPermissions')
    ? user.$locals.rolePolicyPermissions
    : user?.rolePolicyPermissions;
  const source = scopedPolicy !== undefined ? scopedPolicy : user?.permissions;
  const overrides = source instanceof Map ? Object.fromEntries(source) : (source || {});
  if (Object.prototype.hasOwnProperty.call(overrides, required)
      && typeof overrides[required] === 'boolean') return overrides[required];

  const [resource, action] = required.split('.');
  const resourceOverride = overrides[resource];
  if (!resourceOverride || typeof resourceOverride !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(resourceOverride, action)
      && typeof resourceOverride[action] === 'boolean') return resourceOverride[action];
  if (Object.prototype.hasOwnProperty.call(resourceOverride, 'fullAccess')
      && typeof resourceOverride.fullAccess === 'boolean') return resourceOverride.fullAccess;
  return undefined;
};

const hasPermission = (user, required) => {
  const explicitState = getExplicitPermissionState(user, required);
  if (explicitState !== undefined) return explicitState;
  return getEffectivePermissions(user).some((granted) => permissionMatches(granted, required));
};

module.exports = {
  ROLE_PERMISSIONS,
  LEGACY_STAFF_ROLE_MAP,
  PLATFORM_ADMIN_ROLES,
  STORE_ADMIN_ROLES,
  SPECIALIZED_OPERATIONAL_ROLES,
  isPlatformAdmin,
  isStoreAdmin,
  isOperationalStaff,
  normalizeRole,
  getEffectivePermissions,
  getExplicitPermissionState,
  hasPermission
};
