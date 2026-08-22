export const PLATFORM_ADMIN_ROLES = new Set(['super_admin', 'platform_admin']);
export const STORE_ADMIN_ROLES = new Set(['admin', 'store_owner']);
export const OPERATIONAL_ROLES = new Set([
  'staff', 'manager', 'service_staff', 'cashier', 'inventory_staff', 'procurement_officer',
  'finance_staff', 'veterinarian', 'veterinary_technician', 'veterinary_assistant',
  'veterinary_nurse', 'veterinary_laboratory_technician', 'groomer', 'trainer',
  'boarding_staff', 'delivery_dispatcher', 'delivery_rider', 'auditor'
]);

export const CARE_PROFESSIONAL_ROLES = new Set([
  'veterinarian', 'veterinary_technician', 'veterinary_assistant',
  'veterinary_nurse', 'veterinary_laboratory_technician',
  'groomer', 'trainer', 'boarding_staff'
]);

const DIRECT_ROLE_RESOURCES = {
  manager: ['staff', 'customers', 'pets', 'services', 'orders', 'inventory', 'procurement', 'finance', 'logistics', 'reports', 'bookings', 'dss'],
  service_staff: ['customers', 'pets', 'services', 'bookings'],
  cashier: ['customers', 'pets', 'products', 'orders', 'payments'],
  inventory_staff: ['products', 'inventory', 'procurement', 'reports', 'pets', 'dss'],
  procurement_officer: ['inventory', 'procurement', 'suppliers', 'finance', 'dss'],
  finance_staff: ['orders', 'procurement', 'finance', 'reports', 'payments'],
  veterinarian: ['customers', 'pets', 'clinical', 'services', 'bookings', 'inventory'],
  veterinary_technician: ['customers', 'pets', 'services', 'bookings', 'clinical'],
  veterinary_assistant: ['customers', 'pets', 'services', 'bookings', 'clinical'],
  veterinary_nurse: ['customers', 'pets', 'services', 'bookings', 'clinical'],
  veterinary_laboratory_technician: ['customers', 'pets', 'services', 'bookings', 'clinical'],
  groomer: ['customers', 'pets', 'services', 'bookings'],
  trainer: ['customers', 'pets', 'services', 'bookings'],
  boarding_staff: ['customers', 'pets', 'services', 'bookings'],
  delivery_dispatcher: ['orders', 'logistics', 'reports'],
  delivery_rider: ['deliveries'],
  auditor: ['reports', 'audit']
};

const LEGACY_STAFF_ROLE_MAP = {
  order_staff: 'cashier',
  sales_staff: 'cashier',
  inventory_staff: 'inventory_staff',
  service_staff: 'service_staff',
  manager: 'manager',
  cashier: 'cashier',
  procurement_officer: 'procurement_officer',
  finance_staff: 'finance_staff',
  delivery_dispatcher: 'delivery_dispatcher',
  service_management_staff: 'manager',
  administrative_support: 'manager',
  logistics_staff: 'delivery_dispatcher',
  delivery_rider: 'delivery_rider',
  boarding_specialist: 'boarding_staff',
  boarding_staff: 'boarding_staff',
  medical_assistant: 'veterinary_assistant',
  pet_handler: 'boarding_staff',
  veterinarian: 'veterinarian',
  veterinary_technician: 'veterinary_technician',
  veterinary_assistant: 'veterinary_assistant',
  veterinary_nurse: 'veterinary_nurse',
  veterinary_laboratory_technician: 'veterinary_laboratory_technician',
  groomer: 'groomer',
  trainer: 'trainer'
};

export const effectiveStaffType = user => {
  if (user?.role !== 'staff') return user?.role;
  return LEGACY_STAFF_ROLE_MAP[user.staffType] || user.staffType || 'unassigned_staff';
};

export const isCareProfessional = user => CARE_PROFESSIONAL_ROLES.has(effectiveStaffType(user));

export const hasUiPermission = (user, resource) => {
  if (!user || !resource) return false;
  if (PLATFORM_ADMIN_ROLES.has(user.role) || STORE_ADMIN_ROLES.has(user.role)) return true;
  const override = user.permissions?.[resource];
  if (typeof override === 'boolean') return override;
  if (override && typeof override === 'object') {
    const values = Object.values(override).filter(value => typeof value === 'boolean');
    if (values.some(Boolean)) return true;
    if (values.length) return false;
  }
  const effective = effectiveStaffType(user);
  return (DIRECT_ROLE_RESOURCES[effective] || []).includes(resource);
};

export const hasUiActionPermission = (user, resource, action, inherited = false) => {
  if (!user || !resource || !action) return false;
  const flatOverride = user.permissions?.[`${resource}.${action}`];
  if (typeof flatOverride === 'boolean') return flatOverride;
  const resourceOverride = user.permissions?.[resource];
  if (typeof resourceOverride === 'boolean') return resourceOverride;
  if (resourceOverride && typeof resourceOverride === 'object') {
    if (typeof resourceOverride[action] === 'boolean') return resourceOverride[action];
    if (typeof resourceOverride.fullAccess === 'boolean') return resourceOverride.fullAccess;
  }
  return inherited;
};

export const portalHomeForRole = role => {
  if (PLATFORM_ADMIN_ROLES.has(role)) return '/superadmin/dashboard';
  if (STORE_ADMIN_ROLES.has(role) || OPERATIONAL_ROLES.has(role)) return '/admin/dashboard';
  if (role === 'supplier') return '/supplier/dashboard';
  return '/home';
};
