const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  SPECIALIST_ROLES,
  buildSeries,
  growthRate
} = require('../services/operationsDashboardService');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('operations dashboard trend combines paid orders and bookings without pending revenue', () => {
  const now = new Date(2026, 7, 14, 12, 0, 0);
  const orders = [
    { paymentStatus: 'paid', totalAmount: 500, createdAt: new Date(2026, 7, 14, 8, 0, 0) },
    { paymentStatus: 'pending', totalAmount: 900, createdAt: new Date(2026, 7, 14, 9, 0, 0) }
  ];
  const bookings = [
    { paymentStatus: 'paid', totalPrice: 300, createdAt: new Date(2026, 7, 14, 10, 0, 0) },
    { paymentStatus: 'cancelled', totalPrice: 700, createdAt: new Date(2026, 7, 14, 11, 0, 0) }
  ];
  const series = buildSeries(orders, bookings, now);
  assert.equal(series.daily.at(-1).revenue, 800);
  assert.equal(series.monthly.at(-1).revenue, 800);
});

test('operations dashboard revenue growth handles empty and previous periods deterministically', () => {
  assert.equal(growthRate(0, 0), 0);
  assert.equal(growthRate(100, 0), 100);
  assert.equal(growthRate(120, 100), 20);
  assert.equal(growthRate(75, 100), -25);
});

test('specialist analytics include existing veterinary and pet-service roles', () => {
  for (const role of ['veterinarian', 'veterinary_technician', 'veterinary_assistant', 'groomer', 'trainer', 'boarding_staff']) {
    assert.ok(SPECIALIST_ROLES.includes(role), `${role} must be included`);
  }
});

test('store dashboard keeps financial aggregates limited to store/platform administrators', () => {
  const source = read('controllers/storeController.js');
  assert.match(source, /includeFinancials = isStoreAdmin\(req\.user\) \|\| isPlatformAdmin\(req\.user\)/);
  assert.match(source, /buildStoreOperationsSnapshot\(store, \{ includeFinancials \}\)/);
});

test('dashboard clients use the existing aggregate endpoint with authenticated live and polling refresh', () => {
  const admin = read('client/src/pages/admin/Dashboard.js');
  const superAdmin = read('client/src/pages/superadmin/Dashboard.js');
  const app = read('client/src/App.js');
  const socket = read('client/src/utils/socket.js');
  assert.match(admin, /storeService\.getDashboardStats\(\)/);
  assert.match(admin, /setInterval\(\(\) => fetchDashboard\(\{ quiet: true \}\), 60000\)/);
  assert.match(admin, /\/admin\/purchase-orders/);
  assert.match(app, /path="admin\/purchase-orders"/);
  assert.match(superAdmin, /dssService\.getSuperAdminInsights\(\)/);
  assert.match(superAdmin, /onDashboardUpdate: liveRefresh/);
  assert.match(socket, /localStorage\.getItem\('token'\)/);
});

test('dashboard update rooms remain server-authorized and tenant-scoped', () => {
  const server = read('server.js');
  const booking = read('controllers/bookingController.js');
  const delivery = read('controllers/deliveryController.js');
  assert.match(server, /await canAccessStore\(socket\.user, storeId\)/);
  assert.match(booking, /store_\$\{String\(booking\.store\?\._id \|\| booking\.store\)\}/);
  assert.match(delivery, /store_\$\{String\(delivery\.store\)\}/);
  assert.match(delivery, /emit\('dashboardUpdate', payload\)/);
});
