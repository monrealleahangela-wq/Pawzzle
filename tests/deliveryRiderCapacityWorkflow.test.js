const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  getRiderCapacitySummary,
  capacityCanContainReservedLoad
} = require('../utils/riderCapacity');
const {
  evaluateRiderEligibility,
  summarizeRiderEligibility
} = require('../services/deliveryAssignmentService');
const { riderDeliveryView } = require('../utils/deliveryViews');

const root = path.join(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const monday = new Date('2026-10-05T10:00:00');
const rider = (overrides = {}) => ({
  _id: 'rider-1',
  store: 'store-1',
  isActive: true,
  staffStatus: 'active',
  professionalProfile: { availability: {} },
  riderProfile: {
    accountStatus: 'active',
    vehicleType: 'motorcycle',
    vehicleCapacity: { maxWeightKg: 20, maxParcelCount: 4 },
    currentLoad: { weightKg: 8, parcelCount: 1 },
    ...(overrides.riderProfile || {})
  },
  ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'riderProfile'))
});

test('capacity summary is server-derived from maximum and reserved Rider load', () => {
  assert.deepEqual(getRiderCapacitySummary(rider().riderProfile), {
    configured: true,
    vehicleType: 'motorcycle',
    maxWeightKg: 20,
    maxParcelCount: 4,
    reservedWeightKg: 8,
    reservedParcelCount: 1,
    remainingWeightKg: 12,
    remainingParcelCount: 3
  });
});

test('Rider eligibility accepts exact remaining capacity and rejects insufficient or missing setup', () => {
  assert.equal(evaluateRiderEligibility(rider(), { weightKg: 12, parcelCount: 3 }, monday).eligible, true);
  assert.equal(evaluateRiderEligibility(rider(), { weightKg: 12.001, parcelCount: 3 }, monday).reason, 'insufficient_remaining_capacity');
  assert.equal(evaluateRiderEligibility(rider(), { weightKg: 12, parcelCount: 4 }, monday).reason, 'insufficient_remaining_capacity');
  assert.equal(evaluateRiderEligibility(rider({ riderProfile: { vehicleType: '', vehicleCapacity: {}, currentLoad: {} } }), { weightKg: 1, parcelCount: 1 }, monday).reason, 'vehicle_setup_required');
});

test('schedule and availability remain authoritative eligibility requirements', () => {
  const offDuty = rider({
    professionalProfile: { availability: { monday: { available: false }, tuesday: { available: true, start: '09:00', end: '17:00' } } }
  });
  assert.equal(evaluateRiderEligibility(offDuty, { weightKg: 1, parcelCount: 1 }, monday).reason, 'off_duty_or_unavailable');
  const emergency = rider({ professionalProfile: { availability: {}, emergencyUnavailable: { active: true } } });
  assert.equal(evaluateRiderEligibility(emergency, { weightKg: 1, parcelCount: 1 }, monday).reason, 'off_duty_or_unavailable');
});

test('safe aggregate feedback reports capacity classes without Rider identities', () => {
  const result = summarizeRiderEligibility([
    evaluateRiderEligibility(rider(), { weightKg: 13, parcelCount: 1 }, monday)
  ]);
  assert.equal(result.reason, 'insufficient_remaining_capacity');
  assert.match(result.message, /remaining capacity/i);
  assert.doesNotMatch(JSON.stringify(result), /rider-1|schedule|leave|medical/i);
});

test('vehicle changes cannot reduce capacity beneath server-controlled reservations', () => {
  assert.equal(capacityCanContainReservedLoad(rider().riderProfile), true);
  assert.equal(capacityCanContainReservedLoad({
    vehicleType: 'bicycle',
    vehicleCapacity: { maxWeightKg: 7, maxParcelCount: 4 },
    currentLoad: { weightKg: 8, parcelCount: 1 }
  }), false);
  assert.equal(capacityCanContainReservedLoad({
    vehicleType: 'bicycle',
    vehicleCapacity: { maxWeightKg: 20, maxParcelCount: 0 },
    currentLoad: { weightKg: 8, parcelCount: 1 }
  }), false);
});

test('strict Rider delivery projection exposes parcel facts and calculated capacity without reservation internals', () => {
  const payload = riderDeliveryView({
    _id: 'delivery-1',
    parcel: { weightKg: 2, parcelCount: 1, recordedBy: 'private-actor' },
    capacityReservation: { rider: 'rider-1', weightKg: 2, parcelCount: 1 },
    assignedRider: rider()
  });
  assert.deepEqual(payload.parcel, { weightKg: 2, parcelCount: 1 });
  assert.equal(payload.assignedRider.riderProfile.capacity.remainingWeightKg, 12);
  assert.equal(payload.capacityReservation, undefined);
  assert.doesNotMatch(JSON.stringify(payload), /private-actor/);
});

test('assignment keeps Store scope and atomic weight and parcel-count capacity guards', () => {
  const assignment = source('services/deliveryAssignmentService.js');
  const deliveryController = source('controllers/deliveryController.js');
  assert.match(assignment, /store: source\.store/);
  assert.match(assignment, /withTransaction/);
  assert.match(assignment, /\$expr:[\s\S]*currentLoad\.weightKg[\s\S]*currentLoad\.parcelCount/);
  assert.match(assignment, /\$inc:[\s\S]*currentLoad\.weightKg[\s\S]*currentLoad\.parcelCount/);
  assert.match(assignment, /releaseRiderCapacity\(delivery, session\)[\s\S]*capacityReservation = \{ rider: selected\._id/);
  assert.match(assignment, /cancelOrderDelivery[\s\S]*releaseRiderCapacity\(delivery, session\)/);
  assert.match(deliveryController, /status === 'returned_to_store'[\s\S]*releaseRiderCapacity\(delivery, session\)/);
  assert.match(deliveryController, /completeDelivery[\s\S]*releaseRiderCapacity\(transactional, session\)/);
  assert.match(assignment, /reservation\.releasedAt/);
});

test('staff capacity mutation is Store-scoped, allowlisted, and cannot forge reserved load', () => {
  const controller = source('controllers/staffController.js');
  const routes = source('routes/staff.js');
  assert.match(routes, /router\.put\('\/:id', authenticate, adminOrStaff, requirePermission\('staff\.manage'\), updateStaff\)/);
  assert.match(controller, /canAccessStore\(req\.user, staff\.store\)/);
  assert.match(controller, /currentLoad:\s*\{[\s\S]*existing\.currentLoad/);
  assert.doesNotMatch(controller, /currentLoad:\s*\{[\s\S]*profile\.currentLoad/);
  assert.match(controller, /capacityCanContainReservedLoad\(normalized\)/);
  assert.match(controller, /RIDER_VEHICLE_TYPES\.includes\(profile\.vehicleType\)/);
});

test('Rider and seller workspaces render authoritative capacity and safe readiness data', () => {
  const dashboard = source('client/src/components/admin/RiderDashboard.js');
  const workspace = source('client/src/components/delivery/RiderDeliveryWorkspace.js');
  const seller = source('client/src/pages/admin/LogisticsDetail.js');
  const orderDetail = source('client/src/pages/customer/OrderDetail.js');
  assert.match(dashboard, /Vehicle & Capacity/);
  assert.match(dashboard, /Vehicle setup required/);
  assert.match(workspace, /Measured weight/);
  assert.match(workspace, /Parcel count/);
  assert.match(workspace, /Remaining capacity/);
  assert.match(seller, /assignmentReadiness/);
  assert.match(seller, /Assign Automatically|Reassign Automatically/);
  assert.match(orderDetail, /assignmentReadiness/);
  assert.match(orderDetail, /Assign Rider Automatically|Reassign Rider Automatically/);
});
