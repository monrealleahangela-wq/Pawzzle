const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET ||= 'test-only-jwt-secret';

const Store = require('../models/Store');
const {
  normalizeRole,
  hasPermission,
  isPlatformAdmin,
  isStoreAdmin
} = require('../config/permissions');
const { adminOrStaff, platformAdminOnly, requirePermission } = require('../middleware/auth');
const { canOperateStore, idsEqual } = require('../utils/authorizationPolicy');
const { isParticipant, canAccessConversation } = require('../utils/conversationAuthorization');
const { socketCredentials, canAccessDeliveryRoom, deriveDeliverySender } = require('../services/socketAuthorization');
const source = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

const response = () => {
  const result = { statusCode: 200, body: null };
  result.status = code => { result.statusCode = code; return result; };
  result.json = body => { result.body = body; return result; };
  return result;
};

test('platform administrator aliases normalize to one role', () => {
  assert.equal(normalizeRole({ role: 'super_admin' }), 'super_admin');
  assert.equal(normalizeRole({ role: 'platform_admin' }), 'super_admin');
  assert.equal(isPlatformAdmin('platform_admin'), true);
});

test('store owner aliases normalize to one role', () => {
  assert.equal(normalizeRole({ role: 'admin' }), 'admin');
  assert.equal(normalizeRole({ role: 'store_owner' }), 'admin');
  assert.equal(isStoreAdmin('store_owner'), true);
});

test('unknown legacy staff type receives least privilege', () => {
  assert.equal(normalizeRole({ role: 'staff', staffType: null }), 'unassigned_staff');
  assert.equal(hasPermission({ role: 'staff', staffType: 'not_a_role' }, 'inventory.view'), false);
});

test('inherited permission and direct specialized role are evaluated canonically', () => {
  assert.equal(hasPermission({ role: 'staff', staffType: 'inventory_staff' }, 'inventory.view'), true);
  assert.equal(hasPermission({ role: 'inventory_staff' }, 'inventory.adjust'), true);
});

test('explicit allow grants a missing action', () => {
  assert.equal(hasPermission({ role: 'auditor', permissions: { inventory: { view: true } } }, 'inventory.view'), true);
});

test('explicit deny overrides inherited manage permission', () => {
  assert.equal(hasPermission({ role: 'manager', permissions: { inventory: { view: false } } }, 'inventory.view'), false);
});

test('missing permission is denied', () => {
  assert.equal(hasPermission({ role: 'cashier' }, 'staff.manage'), false);
});

test('supplier retains supplier permissions but not store administration', () => {
  assert.equal(hasPermission({ role: 'supplier' }, 'supplier_catalog.own'), true);
  assert.equal(hasPermission({ role: 'supplier' }, 'inventory.manage'), false);
  const res = response();
  let nextCalled = false;
  adminOrStaff({ user: { role: 'supplier', _id: 'supplier-1' } }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('platform operation denies store owner and allows both platform aliases', () => {
  for (const role of ['admin', 'store_owner']) {
    const res = response();
    let called = false;
    platformAdminOnly({ user: { role } }, res, () => { called = true; });
    assert.equal(called, false);
    assert.equal(res.statusCode, 403);
  }
  for (const role of ['super_admin', 'platform_admin']) {
    let called = false;
    platformAdminOnly({ user: { role } }, response(), () => { called = true; });
    assert.equal(called, true);
  }
});

test('permission middleware honors explicit denial', () => {
  const res = response();
  let called = false;
  requirePermission('inventory.view')({ user: { role: 'manager', permissions: { inventory: { view: false } } } }, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

test('specialized staff may mutate same-store resources and not cross-store resources', async () => {
  const user = { _id: 'staff-1', role: 'inventory_staff', store: 'store-a' };
  assert.equal(await canOperateStore(user, 'store-a', ['inventory.adjust']), true);
  assert.equal(await canOperateStore(user, 'store-b', ['inventory.adjust']), false);
});

test('unauthorized staff permission is denied even in the same store', async () => {
  const user = { _id: 'staff-1', role: 'cashier', store: 'store-a' };
  assert.equal(await canOperateStore(user, 'store-a', ['inventory.adjust']), false);
});

test('store owner access includes owned stores and excludes other stores', async () => {
  const original = Store.find;
  Store.find = () => ({ select: () => ({ lean: async () => [{ _id: 'store-a' }] }) });
  try {
    const user = { _id: 'owner-1', role: 'store_owner' };
    assert.equal(await canOperateStore(user, 'store-a', ['inventory.adjust']), true);
    assert.equal(await canOperateStore(user, 'store-b', ['inventory.adjust']), false);
  } finally {
    Store.find = original;
  }
});

test('platform administrator bypasses tenant scope', async () => {
  assert.equal(await canOperateStore({ role: 'platform_admin' }, 'store-b', ['inventory.adjust']), true);
});

test('customer ownership comparison allows own resource and denies another customer', () => {
  assert.equal(idsEqual('customer-a', 'customer-a'), true);
  assert.equal(idsEqual('customer-a', 'customer-b'), false);
});

test('conversation participants are recognized and arbitrary users are denied', async () => {
  const conversation = { participants: [{ user: 'customer-a' }], type: 'general', isDeleted: false };
  assert.equal(isParticipant({ _id: 'customer-a' }, conversation), true);
  assert.equal(await canAccessConversation({ _id: 'customer-a', role: 'customer' }, conversation), true);
  assert.equal(await canAccessConversation({ _id: 'customer-b', role: 'customer' }, conversation), false);
});

test('unauthenticated socket has no accepted credentials', () => {
  assert.deepEqual(socketCredentials({ handshake: { auth: {}, headers: {} } }), { token: undefined, deliveryToken: undefined });
});

test('delivery capability authorizes only its own room', async () => {
  const socket = { deliveryCapability: { deliveryId: 'delivery-a', kind: 'customer' } };
  assert.equal(await canAccessDeliveryRoom(socket, 'delivery-a'), true);
  assert.equal(await canAccessDeliveryRoom(socket, 'delivery-b'), false);
});

test('socket without identity cannot join a delivery room', async () => {
  assert.equal(await canAccessDeliveryRoom({}, 'delivery-a'), false);
});

test('socket sender identity is derived server-side and ignores spoofed payload identity', () => {
  const socket = { deliveryCapability: { kind: 'customer' } };
  const spoofedPayload = { sender: 'rider' };
  assert.equal(deriveDeliverySender(socket), 'customer');
  assert.notEqual(deriveDeliverySender(socket), spoofedPayload.sender);
});

test('platform payout processing uses the platform-only middleware', () => {
  const routes = source('routes/payout.js');
  assert.match(routes, /admin\/all', authenticate, platformAdminOnly/);
  assert.match(routes, /admin\/:id\/process', authenticate, platformAdminOnly/);
});

test('tenant-scoped searches compose search with store scope instead of replacing it', () => {
  for (const file of ['controllers/adminPetController.js', 'controllers/adminProductController.js', 'controllers/adminServiceController.js']) {
    assert.match(source(file), /\$and: \[\{ \.\.\.filter \}, searchFilter\]|\$and: \[tenantFilter, searchFilter\]/, file);
  }
  const booking = source('controllers/bookingController.js');
  assert.match(booking, /const filter = \{ \$and: \[authorizedScope\] \}/);
  assert.match(booking, /filter\.\$and\.push\(searchScope\)/);
});

test('customer directory and arbitrary user lookup are no longer broad authenticated routes', () => {
  const routes = source('routes/users.js');
  assert.match(routes, /router\.get\('\/', authenticate, platformAdminOnly, getAllUsers\)/);
  assert.match(routes, /String\(req\.user\._id\) === String\(req\.params\.id\)/);
});

test('Cloudinary deletion verifies upload ownership before destroy', () => {
  const upload = source('controllers/uploadController.js');
  assert.match(upload, /cloudinary\.api\.resource\(filename, \{ context: true \}\)/);
  assert.match(upload, /You can only delete assets uploaded by your account/);
});

test('retail admin routes require action permissions in addition to a broad role', () => {
  assert.match(source('routes/adminOrders.js'), /requirePermission\('sales\.manage', 'orders\.update'\)/);
  assert.match(source('routes/adminBookings.js'), /requirePermission\('bookings\.update', 'bookings\.manage'\)/);
  assert.match(source('routes/adminVouchers.js'), /requirePermission\('sales\.view', 'sales\.manage'\)/);
  assert.match(source('routes/adminVouchers.js'), /requirePermission\('sales\.manage'\)/);
  assert.match(source('controllers/adminVoucherController.js'), /const editableFields = \[/);
  assert.doesNotMatch(source('controllers/adminVoucherController.js'), /Object\.assign\(voucher, req\.body\)/);
});

test('report creation validates a body-supplied store against the actor tenant', () => {
  const controller = source('controllers/adminReportController.js');
  assert.match(controller, /canAccessStore\(req\.user, reportStoreId\)/);
  assert.match(controller, /store: reportStoreId/);
});
