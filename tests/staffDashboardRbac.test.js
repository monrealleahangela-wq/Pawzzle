const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET ||= 'test-only-jwt-secret';

const Order = require('../models/Order');
const Booking = require('../models/Booking');
const Product = require('../models/Product');
const Pet = require('../models/Pet');
const { getStaffInsights } = require('../controllers/dssController');
const {
  ROLE_PERMISSIONS,
  hasPermission,
  normalizeRole
} = require('../config/permissions');
const { requirePermission } = require('../middleware/auth');
const { serializeEffectivePermissionMap } = require('../services/rolePermissionService');
const resolveStore = require('../utils/resolveStore');
const { projectStoreOperationsSnapshot } = require('../services/operationsDashboardService');

const root = path.resolve(__dirname, '..');
const source = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const response = () => {
  const result = { statusCode: 200, body: null };
  result.status = code => { result.statusCode = code; return result; };
  result.json = body => { result.body = body; return result; };
  return result;
};

const dashboardRoles = new Set(['admin', 'store_owner', 'manager']);
const taskRoles = [
  'cashier', 'inventory_staff', 'procurement_officer', 'finance_staff', 'service_staff',
  'veterinarian', 'veterinary_technician', 'veterinary_assistant', 'veterinary_nurse',
  'veterinary_laboratory_technician', 'groomer', 'trainer', 'boarding_staff',
  'delivery_rider', 'auditor'
];

test('generic store dashboard permission is limited to owners and managers by default', () => {
  for (const role of dashboardRoles) {
    assert.equal(hasPermission({ role }, 'dashboard.view'), true, role);
  }
  for (const role of taskRoles) {
    assert.equal(hasPermission({ role }, 'dashboard.view'), false, role);
  }
});

test('legacy staff aliases receive the same dashboard policy as canonical roles', () => {
  const aliases = {
    service_management_staff: 'manager',
    administrative_support: 'manager',
    sales_staff: 'cashier',
    order_staff: 'cashier',
    medical_assistant: 'veterinary_assistant',
    pet_handler: 'boarding_staff',
    boarding_specialist: 'boarding_staff',
    logistics_staff: 'retired_delivery_dispatcher'
  };
  for (const [legacy, canonical] of Object.entries(aliases)) {
    const user = { role: 'staff', staffType: legacy };
    assert.equal(normalizeRole(user), canonical, legacy);
    assert.equal(hasPermission(user, 'dashboard.view'), canonical === 'manager', legacy);
  }
});

test('dashboard middleware rejects task roles and honors explicit store-role overrides', () => {
  for (const role of taskRoles) {
    const res = response();
    let nextCalled = false;
    requirePermission('dashboard.view')({ user: { role } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false, role);
    assert.equal(res.statusCode, 403, role);
  }

  let allowed = false;
  requirePermission('dashboard.view')({
    user: { role: 'cashier', permissions: { dashboard: { view: true } } }
  }, response(), () => { allowed = true; });
  assert.equal(allowed, true);

  const denied = response();
  requirePermission('dashboard.view')({
    user: { role: 'manager', permissions: { dashboard: { view: false } } }
  }, denied, () => assert.fail('explicit denial must win'));
  assert.equal(denied.statusCode, 403);
});

test('dashboard response projection removes denied modules and store balance', () => {
  const snapshot = {
    generatedAt: '2026-10-04T00:00:00.000Z',
    store: { id: 'store-a', name: 'Store A', balance: 9000 },
    counts: { pets: 3, products: 4, orders: 5, bookings: 6 },
    kpis: { todaySales: 100, pendingOrders: 2, bookingsToday: 1, lowStockItems: 3 },
    weekly: { revenue: 500, bookings: 4, activeWorkload: 2 },
    sales: { trends: [{ revenue: 500 }] }, bookings: { status: [] },
    inventory: { low: 3 }, procurement: { monthlyCost: 400 }, finance: { profit: 100 },
    logistics: { active: 2 }, customers: { newCustomers: 1 }, workforce: { total: 2 },
    specialists: { active: 1 }, decisionSupport: { inventoryRecommendations: [{ id: 'p1' }], procurement: { preferredSupplier: null } },
    recentOrders: [{ id: 'o1' }]
  };
  const inventoryOnly = projectStoreOperationsSnapshot(snapshot, {
    role: 'inventory_staff',
    permissions: { dashboard: { view: true }, procurement: { view: false } }
  });
  assert.equal(inventoryOnly.store.balance, undefined);
  assert.deepEqual(inventoryOnly.inventory, { low: 3 });
  assert.equal(inventoryOnly.sales, undefined);
  assert.equal(inventoryOnly.finance, undefined);
  assert.equal(inventoryOnly.procurement, undefined);
  assert.equal(inventoryOnly.logistics, undefined);
  assert.equal(inventoryOnly.workforce, undefined);
  assert.deepEqual(inventoryOnly.decisionSupport, { inventoryRecommendations: [{ id: 'p1' }] });
});

test('effective permission serialization carries dashboard grants and denials to the client', () => {
  const manager = { role: 'manager', rolePolicyPermissions: { dashboard: { view: false } } };
  const cashier = { role: 'cashier', rolePolicyPermissions: { dashboard: { view: true } } };
  assert.equal(serializeEffectivePermissionMap(manager).dashboard.view, false);
  assert.equal(serializeEffectivePermissionMap(cashier).dashboard.view, true);
});

test('staff DSS middleware permits only the matching DSS capabilities', () => {
  const guard = requirePermission('dss.view', 'dss.manage', 'dss.inventory');
  for (const role of ['manager', 'inventory_staff']) {
    let allowed = false;
    guard({ user: { role } }, response(), () => { allowed = true; });
    assert.equal(allowed, true, role);
  }
  for (const role of ['cashier', 'procurement_officer', 'finance_staff', 'service_staff', 'delivery_rider']) {
    const res = response();
    guard({ user: { role } }, res, () => assert.fail(`${role} should not access /dss/staff`));
    assert.equal(res.statusCode, 403, role);
  }
  assert.equal(hasPermission({ role: 'procurement_officer' }, 'dss.suppliers'), true);
});

test('inventory DSS returns only inventory data and does not query unrelated datasets', async () => {
  const originals = { order: Order.find, booking: Booking.find, product: Product.find, pet: Pet.find };
  const calls = { order: 0, booking: 0, product: 0, pet: 0 };
  const query = (key, rows) => () => {
    calls[key] += 1;
    return { lean: async () => rows };
  };
  Order.find = query('order', []);
  Booking.find = query('booking', []);
  Product.find = query('product', [{ _id: 'p1', name: 'Food', stockQuantity: 2, minStockThreshold: 5, isActive: true, createdAt: new Date() }]);
  Pet.find = query('pet', []);
  try {
    const res = response();
    await getStaffInsights({ user: { _id: 'u1', role: 'inventory_staff', store: 'store-a' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.roleProfile.analyticsScope, 'inventory');
    assert.deepEqual(calls, { order: 0, booking: 0, product: 1, pet: 0 });
    assert.equal(res.body.overview.activeProducts, 1);
    assert.equal('totalOrders' in res.body.overview, false);
    assert.equal('criticalAlerts' in res.body, false);
    assert.equal('salesHistory' in res.body, false);
    assert.equal('totalRevenue' in res.body.overview, false);
  } finally {
    Order.find = originals.order;
    Booking.find = originals.booking;
    Product.find = originals.product;
    Pet.find = originals.pet;
  }
});

test('staff DSS controller independently rejects roles assigned to another analytics endpoint', async () => {
  const res = response();
  await getStaffInsights({ user: { _id: 'u1', role: 'procurement_officer', store: 'store-a' } }, res);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /analytics permission/i);
});

test('authenticated store scope rejects a manipulated foreign store id', async () => {
  assert.equal(await resolveStore({ user: { role: 'inventory_staff', store: 'store-a' }, query: { storeId: 'store-a' } }), 'store-a');
  assert.equal(await resolveStore({ user: { role: 'inventory_staff', store: 'store-a' }, query: { storeId: 'store-b' } }), null);
});

test('dashboard, analytics, landing, and navigation are wired to the RBAC decisions', () => {
  const stores = source('routes/stores.js');
  const dssRoutes = source('routes/dss.js');
  const app = source('client/src/App.js');
  const authorization = source('client/src/utils/authorization.js');
  const layout = source('client/src/components/Layout.js');
  const mobile = source('client/src/components/BottomNavBar.js');
  const login = source('client/src/pages/auth/Login.js');

  assert.match(stores, /dashboard\/stats', authenticate, adminOrStaff, requirePermission\('dashboard\.view'\)/);
  assert.match(dssRoutes, /staff', authenticate, requirePermission\('dss\.view', 'dss\.manage', 'dss\.inventory'\)/);
  assert.match(app, /path="admin\/dashboard"[\s\S]*requireDashboardAccess/);
  assert.match(authorization, /cashier'[\s\S]*\/admin\/orders/);
  assert.match(authorization, /inventory_staff'[\s\S]*\/admin\/inventory/);
  assert.match(authorization, /procurement_officer'[\s\S]*\/admin\/purchase-orders/);
  assert.match(authorization, /finance_staff'[\s\S]*\/admin\/finance/);
  assert.match(authorization, /service_staff'[\s\S]*\/admin\/bookings/);
  assert.match(layout, /hasUiPermission\(user, 'dashboard'\)/);
  assert.match(mobile, /hasUiPermission\(user, 'dashboard'\)/);
  assert.match(login, /portalHomeForUser\(user\)/);
});

test('role changes use database-hydrated authorization and replace stale client permissions', () => {
  const authMiddleware = source('middleware/auth.js');
  const authContext = source('client/src/contexts/AuthContext.js');
  const authController = source('controllers/authController.js');
  assert.match(authMiddleware, /User\.findById\(decoded\.id\)/);
  assert.match(authMiddleware, /attachStoreRolePolicy\(user\)/);
  assert.match(authContext, /const previousUser = state\.user/);
  assert.match(authContext, /previousUser\.staffType !== updatedUser\.staffType/);
  assert.match(authController, /permissions: serializeEffectivePermissionMap\(user\)/);
});

test('store analytics queries remain scoped to the authenticated store', () => {
  const dashboard = source('services/operationsDashboardService.js');
  const dss = source('controllers/dssController.js');
  assert.match(dashboard, /const active = \{ store: storeId/);
  assert.match(dashboard, /Inventory\.find\(\{ store: storeId/);
  assert.match(dss, /Order\.find\(\{ store: storeId/);
  assert.doesNotMatch(dss, /req\.query\.storeId[\s\S]*getStaffInsights/);
});

test('every canonical operational role has an explicit dashboard outcome', () => {
  const operational = [
    'manager', 'cashier', 'inventory_staff', 'procurement_officer', 'finance_staff',
    'service_staff', 'veterinarian', 'veterinary_technician', 'veterinary_assistant',
    'veterinary_nurse', 'veterinary_laboratory_technician', 'groomer', 'trainer',
    'boarding_staff', 'delivery_rider', 'auditor'
  ];
  for (const role of operational) {
    assert.ok(ROLE_PERMISSIONS[role], `missing canonical permission set for ${role}`);
    assert.equal(hasPermission({ role }, 'dashboard.view'), role === 'manager', role);
  }
});
