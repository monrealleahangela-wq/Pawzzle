const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET ||= 'test-only-jwt-secret';

const User = require('../models/User');
const Booking = require('../models/Booking');
const { getEligibleStaff, validateBookingRules } = require('../utils/pricingEngine');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('a booked groomer does not block another qualified groomer at the same time', async () => {
  const originals = {
    findById: User.findById,
    find: Booking.find,
    countDocuments: Booking.countDocuments,
    aggregate: Booking.aggregate
  };
  const staff = {
    'groomer-1': {
      _id: 'groomer-1', role: 'groomer', store: 'store-1', isActive: true,
      isVerified: true, professionalProfile: { availability: {}, rating: 4.7 }
    },
    'groomer-2': {
      _id: 'groomer-2', role: 'groomer', store: 'store-1', isActive: true,
      isVerified: true, professionalProfile: { availability: {}, rating: 4.9 }
    }
  };
  User.findById = id => ({ select: async () => staff[String(id)] });
  Booking.find = async query => String(query.staff) === 'groomer-1'
    ? [{ _id: 'existing', status: 'pending', startTime: '10:00', endTime: '11:00' }]
    : [];
  Booking.countDocuments = async query => String(query.staff) === 'groomer-1' ? 1 : 0;
  Booking.aggregate = async () => [];

  try {
    const candidates = await getEligibleStaff({
      _id: 'service-1', store: 'store-1', category: 'grooming', name: 'Full Groom',
      assignedStaff: ['groomer-1', 'groomer-2'], bufferTime: 0
    }, new Date('2026-11-23T00:00:00.000Z'), '10:00', '11:00', null, { timezone: 'Asia/Manila' });

    assert.deepEqual(candidates.map(candidate => String(candidate.staff._id)), ['groomer-2']);
  } finally {
    User.findById = originals.findById;
    Booking.find = originals.find;
    Booking.countDocuments = originals.countDocuments;
    Booking.aggregate = originals.aggregate;
  }
});

test('staff-specific booking flow does not apply the service-wide one-slot limit', async () => {
  const originalCountDocuments = Booking.countDocuments;
  let countCalls = 0;
  Booking.countDocuments = async () => { countCalls += 1; return 1; };
  try {
    const result = await validateBookingRules(
      { _id: 'service-1', bookingRules: { capacityPerSlot: 1 } },
      '2026-11-23',
      '10:00',
      null,
      { skipSlotCapacity: true }
    );
    assert.deepEqual(result, { valid: true, reason: null });
    assert.equal(countCalls, 0);
  } finally {
    Booking.countDocuments = originalCountDocuments;
  }
});

test('customer specialist selection is wired through discovery, review, and booking creation', () => {
  const routes = read('routes/bookings.js');
  const controller = read('controllers/bookingController.js');
  const userModel = read('models/User.js');
  const page = read('client/src/pages/customer/Bookings.js');
  const api = read('client/src/services/apiService.js');

  assert.match(routes, /post\('\/available-specialists'[\s\S]*getAvailableServiceStaff/);
  assert.match(api, /getAvailableSpecialists:[\s\S]*\/bookings\/available-specialists/);
  assert.match(page, /Choose your specialist/);
  assert.match(page, /staffId:\s*bookingForm\.preferredStaffId \|\| undefined/);
  assert.match(controller, /preferred_staff_unavailable/);
  assert.match(controller, /staff:\s*selectedSpecialist\.staff\._id/);
  assert.match(controller, /source:\s*staffId \? 'customer' : 'automatic'/);
  assert.match(controller, /bookingReservationLock\.expiresAt/);
  assert.match(controller, /const finalEligibility = await getEligibleStaff/);
  assert.match(userModel, /bookingReservationLock:[\s\S]*token:[\s\S]*expiresAt/);
});
