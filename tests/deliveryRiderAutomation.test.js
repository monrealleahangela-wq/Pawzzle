const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeParcel, isAvailableNow } = require('../services/deliveryAssignmentService');
const { normalizeRole, getEffectivePermissions, hasPermission } = require('../config/permissions');

const root = path.join(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

test('retired dispatcher identities are schema-readable but have no active permissions', () => {
  assert.equal(normalizeRole({ role: 'delivery_dispatcher' }), 'retired_delivery_dispatcher');
  assert.equal(normalizeRole({ role: 'staff', staffType: 'logistics_staff' }), 'retired_delivery_dispatcher');
  assert.deepEqual(getEffectivePermissions({ role: 'delivery_dispatcher', permissions: { logistics: { manage: true } } }), []);
  assert.equal(hasPermission({ role: 'staff', staffType: 'logistics_staff', permissions: { logistics: { manage: true } } }, 'logistics.manage'), false);
  assert.doesNotMatch(source('controllers/staffController.js'), /availableRoles:[^\n]+delivery_dispatcher/);
  assert.doesNotMatch(source('client/src/pages/admin/StaffManagement.js'), /Delivery Dispatcher/);
});

test('parcel facts are validated and order quantities remain server-derived', () => {
  assert.deepEqual(normalizeParcel({ items: [{ quantity: 2 }, { quantity: 3 }] }, { weightKg: '7.125', parcelCount: 99 }), { weightKg: 7.125, parcelCount: 5 });
  assert.deepEqual(normalizeParcel({}, { weightKg: 1.2, parcelCount: 2 }), { weightKg: 1.2, parcelCount: 2 });
  assert.throws(() => normalizeParcel({}, { weightKg: 0, parcelCount: 1 }), /measured parcel weight/);
  assert.throws(() => normalizeParcel({}, { weightKg: 2, parcelCount: 1.5 }), /whole number/);
});

test('rider availability respects account schedule, leave, breaks, and unavailable flags', () => {
  const monday = new Date('2026-09-28T10:00:00');
  const base = { professionalProfile: { availability: { monday: { available: true, start: '09:00', end: '17:00', breaks: [{ start: '12:00', end: '13:00' }] } } } };
  assert.equal(isAvailableNow(base, monday), true);
  assert.equal(isAvailableNow(base, new Date('2026-09-28T12:30:00')), false);
  assert.equal(isAvailableNow({ professionalProfile: { ...base.professionalProfile, emergencyUnavailable: { active: true } } }, monday), false);
  assert.equal(isAvailableNow({ professionalProfile: { ...base.professionalProfile, leaveSchedule: [{ startDate: '2026-09-28', endDate: '2026-09-28' }] } }, monday), false);
});

test('assignment is transactional, deterministic, capacity-guarded, and client rider IDs are unused', () => {
  const service = source('services/deliveryAssignmentService.js');
  const controller = source('controllers/deliveryController.js');
  assert.match(service, /withTransaction/);
  assert.match(service, /riderSort/);
  assert.match(service, /currentLoad\.weightKg/);
  assert.match(service, /vehicleCapacity\.maxWeightKg/);
  assert.match(service, /\$expr/);
  assert.match(service, /status: 'rider_assigned'/);
  assert.doesNotMatch(controller, /const \{[^}]*riderId[^}]*\} = req\.body/);
});

test('rider mutation requires authentication and exact assigned-rider ownership', () => {
  const routes = source('routes/delivery.js');
  const controller = source('controllers/deliveryController.js');
  assert.match(routes, /get\('\/rider\/:deliveryId', authenticate/);
  assert.match(routes, /patch\('\/rider\/:deliveryId\/location', authenticate/);
  assert.match(routes, /post\('\/rider\/:deliveryId\/complete', authenticate/);
  assert.match(controller, /assignedRider: req\.user\._id/);
  assert.match(controller, /lat < -90 \|\| lat > 90 \|\| lng < -180 \|\| lng > 180/);
  assert.match(controller, /canOperateStore\(req\.user, storeId, \['logistics\.manage'\]\)/);
  assert.doesNotMatch(routes, /verify\/:token|status\/:token|location\/:token/);
});

test('Socket.IO only broadcasts persisted delivery mutations', () => {
  const server = source('server.js');
  const controller = source('controllers/deliveryController.js');
  assert.doesNotMatch(server, /socket\.on\('updateLocation'|socket\.on\('statusUpdate'|socket\.on\('sendMessage'/);
  assert.match(controller, /findOneAndUpdate\([\s\S]*locationHistory[\s\S]*emitAuthorizedDeliveryEvent\(io, delivery\._id, 'locationUpdate'/);
  assert.match(controller, /updateDeliveryStatus[\s\S]*withTransaction/);
  assert.match(controller, /emitAuthoritativeDeliveryUpdate/);
});

test('customer, store, and rider interfaces use authoritative assignment and stable map markers', () => {
  const customer = source('client/src/pages/DeliveryTracking.js');
  const store = source('client/src/pages/admin/LogisticsDetail.js');
  const rider = source('client/src/pages/RiderDeliveryPage.js');
  const dashboard = source('client/src/components/admin/RiderDashboard.js');
  assert.match(customer, /validCoords/);
  assert.match(customer, /Pickup store|Delivery destination/);
  assert.doesNotMatch(customer, /Rider Cyrus|flaticon|verifyRider/);
  assert.match(store, /Live Delivery Map/);
  assert.match(rider, /getRiderDelivery/);
  assert.match(dashboard, /\/rider\/deliveries\/\$\{delivery\._id\}/);
  assert.doesNotMatch(dashboard, /riderToken|rider-track/);
});
