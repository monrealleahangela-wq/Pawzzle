const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('customer acceptance routes remain connected to their API domains', () => {
  const app = source('client/src/App.js');
  const server = source('server.js');
  for (const route of ['/register', '/forgot-password', 'products', 'services', 'profile', 'checkout', 'orders', 'bookings']) {
    assert.match(app, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const domain of ['auth', 'pets', 'products', 'services', 'bookings', 'orders', 'notifications', 'logistics']) {
    assert.match(server, new RegExp(`/api/${domain}`));
  }
});

test('booking proposal, payment gate, care timeline, and review foundations remain present', () => {
  const booking = source('controllers/bookingController.js');
  const payment = source('controllers/paymentController.js');
  const care = source('routes/petCare.js');
  assert.match(booking, /proposal/i);
  assert.match(booking, /confirm/i);
  assert.match(payment, /paymongo/i);
  assert.match(payment, /booking/i);
  assert.match(care, /timeline/i);
  assert.match(care, /aftercare/i);
  assert.match(source('models/Review.js'), /booking/i);
});

test('store operational modules remain mounted and permission protected', () => {
  const server = source('server.js');
  for (const domain of ['inventory', 'purchase-orders', 'finance', 'staff', 'dss']) {
    assert.match(server, new RegExp(`/api/${domain}`));
  }
  const permissions = source('config/permissions.js');
  for (const permission of ['inventory.manage', 'procurement.manage', 'finance.manage', 'staff.manage', 'dss.manage']) {
    assert.match(permissions, new RegExp(permission.replace('.', '\\.')));
  }
});

test('specialized staff retain assigned-only workflows', () => {
  const permissions = source('config/permissions.js');
  for (const role of ['veterinarian', 'groomer', 'trainer', 'boarding_staff']) assert.match(permissions, new RegExp(role));
  assert.ok((permissions.match(/'bookings\.assigned'/g) || []).length >= 4);
  assert.match(permissions, /delivery_rider/);
  assert.match(permissions, /deliveries\.own/);
});

test('canonical role aliases remain permission-equivalent', () => {
  const { getEffectivePermissions } = require('../config/permissions');
  assert.deepEqual(getEffectivePermissions({ role: 'super_admin' }), getEffectivePermissions({ role: 'platform_admin' }));
  assert.deepEqual(getEffectivePermissions({ role: 'admin' }), getEffectivePermissions({ role: 'store_owner' }));
});

test('user-facing errors translate technical status codes into contextual messages', () => {
  const helper = source('client/src/utils/userFacingError.js');
  assert.match(helper, /You don't have permission to perform this action/);
  assert.match(helper, /could not be found/i);
  assert.match(helper, /Unable to reach the server/i);
  assert.match(source('client/src/pages/NotFound.js'), /Page unavailable/);
  assert.doesNotMatch(source('client/src/pages/NotFound.js'), /text-9xl/);
});

test('global accessibility polish preserves focus, disabled, and reduced-motion states', () => {
  const css = source('client/src/index.css');
  assert.match(css, /:focus-visible/);
  assert.match(css, /cursor: not-allowed/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /\.btn\s*\{[^}]*cursor:\s*none/s);
});

test('major staff and role dialogs support Escape dismissal', () => {
  assert.match(source('client/src/pages/admin/StaffManagement.js'), /event\.key (?:===|!==) 'Escape'/);
  assert.match(source('client/src/pages/admin/RoleManagement.js'), /event\.key (?:===|!==) 'Escape'/);
  assert.match(source('client/src/components/admin/SpecializedStaffProfileModal.js'), /event\.key (?:===|!==) 'Escape'/);
});

test('booking calendar refetches by selected month and avoids aggressive hidden polling', () => {
  const calendar = source('client/src/pages/customer/BookingCalendar.js');
  assert.match(calendar, /useCallback/);
  assert.match(calendar, /\[currentMonth\]/);
  assert.match(calendar, /document\.hidden/);
  assert.match(calendar, /30000/);
  assert.doesNotMatch(calendar, /setInterval\(fetchBookings,\s*5000\)/);
});

test('dashboard and notification polling pause while the document is hidden', () => {
  for (const file of [
    'client/src/pages/admin/Dashboard.js',
    'client/src/pages/superadmin/Dashboard.js',
    'client/src/contexts/AuthContext.js',
    'client/src/contexts/NotificationContext.js'
  ]) assert.match(source(file), /document\.hidden/);
});

test('DSS surfaces explainable recommendation elements', () => {
  const admin = source('client/src/pages/admin/DSS.js');
  for (const label of ['Why', 'Based on', 'Action', 'Confidence']) assert.match(admin, new RegExp(label, 'i'));
});

test('defense deliverable documents features, roles, panel scope, and live limitations', () => {
  const doc = source('docs/PHASE7_DEFENSE_READINESS.md');
  for (const section of ['Feature completion checklist', 'User roles matrix', 'Panel summary', 'Remaining live verification items']) {
    assert.match(doc, new RegExp(section, 'i'));
  }
  for (const role of ['Platform Admin', 'Store Owner', 'Customer', 'Supplier', 'Delivery Rider']) assert.match(doc, new RegExp(role));
});
