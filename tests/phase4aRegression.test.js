const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET ||= 'test-only-jwt-secret';

const { hasPermission, isPlatformAdmin, isStoreAdmin } = require('../config/permissions');
const { __test: petCareTest } = require('../controllers/petCareController');
const source = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('store and platform role aliases retain identical canonical permissions', () => {
  assert.equal(isStoreAdmin('admin'), true);
  assert.equal(isStoreAdmin('store_owner'), true);
  assert.equal(hasPermission({ role: 'admin' }, 'services.manage'), true);
  assert.equal(hasPermission({ role: 'store_owner' }, 'services.manage'), true);
  assert.equal(isPlatformAdmin('super_admin'), true);
  assert.equal(isPlatformAdmin('platform_admin'), true);
  assert.equal(hasPermission({ role: 'super_admin' }, 'payouts.manage'), true);
  assert.equal(hasPermission({ role: 'platform_admin' }, 'payouts.manage'), true);
});

test('assigned direct service specialists can use only their same-store booking workflow', () => {
  const booking = {
    customer: 'customer-1',
    store: { _id: 'store-a', owner: 'owner-1' },
    staff: 'specialist-1',
    serviceProvider: null
  };
  for (const role of ['veterinarian', 'groomer', 'trainer', 'boarding_staff']) {
    const allowed = petCareTest.getBookingAccess({ _id: 'specialist-1', role, store: 'store-a' }, booking);
    assert.equal(allowed.canView, true, role);
    assert.equal(allowed.canPostStaffUpdate, true, role);
    assert.equal(allowed.canMessage, true, role);

    const unassigned = petCareTest.getBookingAccess({ _id: 'other-staff', role, store: 'store-a' }, booking);
    assert.equal(unassigned.canView, false, `${role} unassigned`);

    const crossStore = petCareTest.getBookingAccess({ _id: 'specialist-1', role, store: 'store-b' }, booking);
    assert.equal(crossStore.canView, false, `${role} cross-store`);
  }
});

test('direct operational staff dashboard resolves the assigned store without ownership fallback', () => {
  const controller = source('controllers/storeController.js');
  assert.match(controller, /if \(isOperationalStaff\(req\.user\) && req\.user\.store\)/);
  assert.equal((controller.match(/if \(isOperationalStaff\(req\.user\) && req\.user\.store\)/g) || []).length, 2);
});

test('OAuth redirects through the canonical role destination helper', () => {
  const oauth = source('client/src/pages/auth/OAuthCallback.js');
  assert.match(oauth, /portalHomeForRole\(user\.role\)/);
  assert.doesNotMatch(oauth, /user\.role === 'super_admin'/);
  assert.doesNotMatch(oauth, /user\.role === 'admin'/);
});

test('mobile navigation recognizes both aliases, suppliers, and direct operational roles', () => {
  const navigation = source('client/src/components/BottomNavBar.js');
  assert.match(navigation, /STORE_ADMIN_ROLES\.has\(role\)/);
  assert.match(navigation, /PLATFORM_ADMIN_ROLES\.has\(role\)/);
  assert.match(navigation, /role === 'supplier'/);
  assert.match(navigation, /OPERATIONAL_ROLES\.has\(role\)/);
  assert.match(navigation, /hasUiPermission\(user, resource\)/);
});

test('dashboard real-time hook reuses the authenticated socket client', () => {
  const hook = source('client/src/hooks/useRealTimeUpdates.js');
  const socketClient = source('client/src/utils/socket.js');
  const server = source('server.js');
  assert.match(hook, /import socket from '\.\.\/utils\/socket'/);
  assert.match(hook, /socket\.connect\(\)/);
  assert.doesNotMatch(hook, /from 'socket\.io-client'/);
  assert.match(socketClient, /localStorage\.getItem\('token'\)/);
  assert.match(server, /io\.use\(authenticateSocket\)/);
});

test('frontend route matching separates store administration from operational staff', () => {
  const protectedRoute = source('client/src/components/ProtectedRoute.js');
  const app = source('client/src/App.js');
  assert.match(protectedRoute, /allowedRoles\.includes\('admin'\) && userRole === 'store_owner'/);
  assert.match(protectedRoute, /allowedRoles\.includes\('staff'\) && OPERATIONAL_ROLES\.has\(userRole\)/);
  assert.doesNotMatch(protectedRoute, /allowedRoles\.includes\('admin'\) && ADMIN_PORTAL_ROLES/);
  assert.match(app, /admin\/purchase-orders[^\n]+requiredPermission="procurement"/);
  assert.match(app, /admin\/supplies[^\n]+requiredPermission="inventory"/);
  assert.match(app, /admin\/finance[^\n]+requiredPermission="finance"/);
});

test('store-owner CRUD pages and booking controls use canonical role helpers', () => {
  for (const file of [
    'client/src/pages/admin/Pets.js',
    'client/src/pages/admin/ProductInventory.js',
    'client/src/pages/admin/ServiceManagement.js'
  ]) {
    const page = source(file);
    assert.match(page, /STORE_ADMIN_ROLES\.has\(user\?\.role\)/, file);
    assert.match(page, /PLATFORM_ADMIN_ROLES\.has\(user\?\.role\)/, file);
  }
  const bookings = source('client/src/pages/admin/BookingsManagement.js');
  assert.match(bookings, /const isStoreAdmin = STORE_ADMIN_ROLES\.has\(user\?\.role\)/);
  assert.match(bookings, /hasUiActionPermission\(user, 'bookings', 'update', isStoreAdmin/);
  const authorization = source('client/src/utils/authorization.js');
  assert.match(authorization, /typeof resourceOverride\[action\] === 'boolean'/);
  assert.match(authorization, /typeof resourceOverride\.fullAccess === 'boolean'/);
});

test('direct specialized staff use the staff DSS endpoint', () => {
  const dss = source('client/src/pages/admin/DSS.js');
  assert.match(dss, /OPERATIONAL_ROLES\.has\(user\?\.role\)/);
  assert.match(dss, /dssService\.getStaffInsights\(\)/);
});
