const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET ||= 'test-only-jwt-secret';

const User = require('../models/User');
const Booking = require('../models/Booking');
const {
  getEligibleStaff,
  getStaffAssignmentReadiness
} = require('../utils/pricingEngine');
const { __test: staffTest } = require('../controllers/staffController');

const root = path.join(__dirname, '..');
const source = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const bookingDate = new Date('2026-10-12T00:00:00.000Z');
const service = {
  _id: 'service-1',
  store: 'store-1',
  category: 'health_wellness',
  name: 'Veterinary Consultation',
  description: 'General clinical consultation',
  assignedStaff: ['vet-1'],
  bufferTime: 0
};
const legacyVeterinarian = {
  _id: 'vet-1',
  role: 'veterinarian',
  store: 'store-1',
  isVerified: true,
  professionalProfile: { availability: {}, rating: 4.8 }
};

const withEligibilityModels = async (staff, run, existingBookings = []) => {
  const originals = {
    findById: User.findById,
    find: Booking.find,
    countDocuments: Booking.countDocuments,
    aggregate: Booking.aggregate
  };
  User.findById = () => ({ select: async () => staff });
  Booking.find = async () => existingBookings;
  Booking.countDocuments = async () => existingBookings.length;
  Booking.aggregate = async () => [];
  try { return await run(); }
  finally {
    User.findById = originals.findById;
    Booking.find = originals.find;
    Booking.countDocuments = originals.countDocuments;
    Booking.aggregate = originals.aggregate;
  }
};

test('Staff Management rider fields round-trip while reserved load remains server controlled', () => {
  const existing = {
    staffId: 'STF-0012',
    currentLoad: { weightKg: 3, parcelCount: 1 },
    vehicleCapacity: { maxWeightKg: 8, maxParcelCount: 2 }
  };
  const normalized = staffTest.cleanRiderProfile({
    licenseId: 'DL-100',
    vehicleType: 'motorcycle',
    plateNumber: 'abc 123',
    vehicleCapacity: { maxWeightKg: '20', maxParcelCount: '4' }
  }, existing);
  assert.deepEqual(normalized.vehicleCapacity, { maxWeightKg: 20, maxParcelCount: 4 });
  assert.deepEqual(normalized.currentLoad, { weightKg: 3, parcelCount: 1 });
  assert.equal(normalized.plateNumber, 'ABC 123');
  assert.equal(staffTest.validateRider(normalized, '09171234567'), null);
  assert.match(staffTest.validateRider({ ...normalized, licenseId: '' }, '09171234567'), /license/i);
});

test('partial Staff Management address updates preserve saved address fields', () => {
  assert.deepEqual(staffTest.cleanStaffAddress(
    { city: 'Imus' },
    { street: '1 Paw St', barangay: 'Bayan Luma', city: 'Bacoor', province: 'Cavite', zipCode: '4102', country: 'PH' }
  ), {
    street: '1 Paw St', barangay: 'Bayan Luma', city: 'Imus', province: 'Cavite', zipCode: '4102', country: 'PH'
  });
  const controller = source('controllers/staffController.js');
  const updateSection = controller.slice(controller.indexOf('const updateStaff ='), controller.indexOf('const toggleStaffStatus ='));
  assert.doesNotMatch(updateSection, /\bstaffAddress\s*=\s*\{/);
});

test('Staff Management accepts every canonical veterinary specialization supported by assignment rules', () => {
  for (const role of ['veterinarian', 'veterinary_technician', 'veterinary_assistant', 'veterinary_nurse', 'veterinary_laboratory_technician']) {
    assert.ok(staffTest.DIRECT_STAFF_ROLES.includes(role), role);
    assert.ok(staffTest.STAFF_MANAGEMENT_ROLES.includes(role), role);
  }
});

test('Booking discovery accepts a same-Store legacy-active direct-role Veterinarian', async () => {
  await withEligibilityModels(legacyVeterinarian, async () => {
    const candidates = await getEligibleStaff(service, bookingDate, '10:00', '11:00', 'booking-1');
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].staff._id, 'vet-1');
    const readiness = await getStaffAssignmentReadiness(service, bookingDate, '10:00', '11:00', 'booking-1');
    assert.deepEqual(readiness, {
      reason: 'eligible',
      message: 'Qualified staff are available for this service and schedule.',
      eligibleCount: 1
    });
  });
});

test('Booking readiness gives a safe server-authoritative qualification reason', async () => {
  const pending = {
    ...legacyVeterinarian,
    isVerified: false,
    professionalProfile: {
      availability: {},
      verification: { status: 'pending_verification', isRequired: true },
      credentialDocuments: []
    }
  };
  await withEligibilityModels(pending, async () => {
    const readiness = await getStaffAssignmentReadiness(service, bookingDate, '10:00', '11:00', 'booking-1');
    assert.equal(readiness.reason, 'professional_verification_required');
    assert.equal(readiness.eligibleCount, 0);
    assert.match(readiness.message, /current approved professional credentials/i);
    assert.doesNotMatch(JSON.stringify(readiness), /vet-1|firstName|lastName/);
  });
});

test('Rider capacity reservation rechecks lifecycle and Store scope atomically', () => {
  const assignment = source('services/deliveryAssignmentService.js');
  assert.match(assignment, /findOneAndUpdate\(\{\s*\.\.\.buildActiveRiderAccountFilter\(\{ _id: candidate\._id, store: source\.store \}\)/);
  assert.match(assignment, /\$expr:[\s\S]*currentLoad\.weightKg[\s\S]*currentLoad\.parcelCount/);
});

test('assignment UIs distinguish request failures from genuine empty eligibility', () => {
  const adminBookings = source('client/src/pages/admin/BookingsManagement.js');
  const customerBookings = source('client/src/pages/customer/Bookings.js');
  const riderFields = source('client/src/components/delivery/DeliveryAssignmentFields.js');
  assert.match(adminBookings, /eligibleServiceStaffError/);
  assert.match(adminBookings, /staffAssignmentReadiness\.message/);
  assert.match(customerBookings, /eligibleStaffError/);
  assert.match(customerBookings, /staffAssignmentReadiness\?\.message/);
  assert.match(riderFields, /assignmentReadiness\?\.error/);
  assert.match(riderFields, /role=\{assignmentReadiness\?\.error \? 'alert' : 'status'\}/);
});
