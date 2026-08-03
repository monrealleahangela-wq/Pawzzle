const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  platform_admin: ['*'],
  admin: [
    'dashboard.view', 'users.manage', 'staff.manage', 'customers.manage',
    'pets.manage', 'clinical.manage', 'services.manage', 'sales.manage',
    'inventory.manage', 'procurement.manage', 'finance.view',
    'logistics.manage', 'reports.view', 'dss.manage'
  ],
  store_owner: [
    'dashboard.view', 'users.manage', 'staff.manage', 'customers.manage',
    'pets.manage', 'clinical.manage', 'services.manage', 'sales.manage',
    'inventory.manage', 'procurement.manage', 'finance.manage',
    'logistics.manage', 'reports.view', 'dss.manage'
  ],
  manager: [
    'dashboard.view', 'staff.view', 'customers.manage', 'pets.manage',
    'clinical.view', 'services.manage', 'sales.manage', 'inventory.manage',
    'procurement.manage', 'finance.view', 'logistics.manage',
    'reports.view', 'dss.view'
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
    'pet_updates.create'
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
  groomer: 'groomer',
  trainer: 'trainer',
  boarding_specialist: 'boarding_staff',
  inventory_staff: 'inventory_staff',
  logistics_staff: 'delivery_dispatcher',
  sales_staff: 'cashier',
  order_staff: 'cashier',
  service_staff: 'groomer',
  service_management_staff: 'manager',
  administrative_support: 'manager',
  medical_assistant: 'veterinarian',
  pet_handler: 'boarding_staff'
};

const normalizeRole = (user) => {
  if (!user) return null;
  if (user.role === 'staff') {
    return LEGACY_STAFF_ROLE_MAP[user.staffType] || 'manager';
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
  const overrides = user?.permissions instanceof Map
    ? Object.fromEntries(user.permissions)
    : (user?.permissions || {});

  const explicit = Object.entries(overrides)
    .filter(([, allowed]) => allowed === true)
    .map(([permission]) => permission);
  const denied = new Set(
    Object.entries(overrides)
      .filter(([, allowed]) => allowed === false)
      .map(([permission]) => permission)
  );

  return [...new Set([...defaults, ...explicit])].filter((p) => !denied.has(p));
};

const hasPermission = (user, required) =>
  getEffectivePermissions(user).some((granted) => permissionMatches(granted, required));

module.exports = {
  ROLE_PERMISSIONS,
  LEGACY_STAFF_ROLE_MAP,
  normalizeRole,
  getEffectivePermissions,
  hasPermission
};
