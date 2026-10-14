const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET ||= 'test-only-jwt-secret';

const Booking = require('../models/Booking');
const User = require('../models/User');
const {
  evaluateStaffSchedule,
  getBookingScheduleContext,
  isWithinStaffSchedule
} = require('../utils/staffSpecialization');
const {
  checkStaffAvailability,
  getEligibleStaff,
  getStaffAssignmentReadiness
} = require('../utils/pricingEngine');
const {
  getEligibleForBooking,
  getBookingStaffReadiness,
  validateAssignedStaff
} = require('../services/bookingLifecycleService');

const bookingDate = new Date('2026-10-12T00:00:00.000Z'); // Intended date-only value: Monday.
const store = { _id: 'store-1', hrSettings: { timezone: 'Asia/Manila' } };
const service = {
  _id: 'service-1', store: 'store-1', category: 'health_wellness',
  name: 'General Checkup', description: 'Veterinary consultation',
  assignedStaff: ['vet-1'], bufferTime: 0
};
const veterinarian = {
  _id: 'vet-1', role: 'veterinarian', store: 'store-1', isVerified: true,
  isActive: true, isDeleted: false, staffStatus: 'active', permissions: {},
  professionalProfile: {
    availability: { monday: { available: true, start: '09:00', end: '17:00', breaks: [] } },
    leaveSchedule: [], rating: 0
  }
};

const withModels = async ({ staff = veterinarian, bookings = [] } = {}, run) => {
  const originals = {
    userFindById: User.findById,
    bookingFind: Booking.find,
    bookingCountDocuments: Booking.countDocuments,
    bookingAggregate: Booking.aggregate
  };
  let capturedQuery;
  User.findById = () => ({ select: async () => staff });
  Booking.find = async query => { capturedQuery = query; return bookings; };
  Booking.countDocuments = async () => bookings.filter(item => !['completed', 'finished'].includes(item.status)).length;
  Booking.aggregate = async () => [];
  try { return await run(() => capturedQuery); }
  finally {
    User.findById = originals.userFindById;
    Booking.find = originals.bookingFind;
    Booking.countDocuments = originals.bookingCountDocuments;
    Booking.aggregate = originals.bookingAggregate;
  }
};

test('date-only booking weekday remains Store-local across server-offset boundaries', () => {
  const honolulu = { hrSettings: { timezone: 'Pacific/Honolulu' } };
  const context = getBookingScheduleContext(bookingDate, '10:00', '11:00', honolulu);
  assert.equal(context.valid, true);
  assert.equal(context.dayKey, 'monday');
  assert.equal(context.startAt.toISOString(), '2026-10-12T20:00:00.000Z');
  assert.equal(isWithinStaffSchedule(veterinarian, bookingDate, '10:00', '11:00', honolulu), true);
});

test('Asia/Manila local appointment interval drives temporary unavailability', () => {
  const unavailableUntil0930 = {
    ...veterinarian,
    professionalProfile: {
      ...veterinarian.professionalProfile,
      temporaryUnavailable: { active: true, until: '2026-10-12T01:30:00.000Z' }
    }
  };
  assert.equal(evaluateStaffSchedule(unavailableUntil0930, bookingDate, '10:00', '11:00', store).eligible, true);

  const unavailableUntil1030 = {
    ...unavailableUntil0930,
    professionalProfile: {
      ...unavailableUntil0930.professionalProfile,
      temporaryUnavailable: { active: true, until: '2026-10-12T02:30:00.000Z' }
    }
  };
  assert.deepEqual(
    evaluateStaffSchedule(unavailableUntil1030, bookingDate, '10:00', '11:00', store),
    { eligible: false, reason: 'temporary_unavailable' }
  );
});

test('approved leave, breaks, emergencies, and invalid schedule data return safe reasons', () => {
  const onLeave = {
    ...veterinarian,
    professionalProfile: { ...veterinarian.professionalProfile, leaveSchedule: [{ startDate: '2026-10-12', endDate: '2026-10-12' }] }
  };
  assert.equal(evaluateStaffSchedule(onLeave, bookingDate, '10:00', '11:00', store).reason, 'approved_leave');

  const onBreak = {
    ...veterinarian,
    professionalProfile: {
      ...veterinarian.professionalProfile,
      availability: { monday: { available: true, start: '09:00', end: '17:00', breaks: [{ start: '10:30', end: '11:30' }] } }
    }
  };
  assert.equal(evaluateStaffSchedule(onBreak, bookingDate, '10:00', '11:00', store).reason, 'overlapping_break');

  const emergency = {
    ...veterinarian,
    professionalProfile: { ...veterinarian.professionalProfile, emergencyUnavailable: { active: true } }
  };
  assert.equal(evaluateStaffSchedule(emergency, bookingDate, '10:00', '11:00', store).reason, 'emergency_unavailable');
  assert.equal(evaluateStaffSchedule(veterinarian, bookingDate, '10:00', '11:00', { hrSettings: { timezone: 'Invalid/Timezone' } }).reason, 'invalid_schedule_configuration');
  assert.equal(evaluateStaffSchedule(veterinarian, bookingDate, 'bad', '11:00', store).reason, 'invalid_schedule_configuration');
});

test('ambiguous and nonexistent IANA local times fail closed', () => {
  const newYork = { hrSettings: { timezone: 'America/New_York' } };
  assert.equal(getBookingScheduleContext('2026-11-01', '01:30', '02:30', newYork).valid, false);
  assert.equal(getBookingScheduleContext('2026-03-08', '02:30', '03:30', newYork).valid, false);
});

test('completed and finished bookings do not block while active overlaps do', async () => {
  await withModels({ bookings: [
    { _id: 'done-1', status: 'completed', startTime: '10:00', endTime: '11:00' },
    { _id: 'done-2', status: 'finished', startTime: '10:00', endTime: '11:00' }
  ] }, async getQuery => {
    assert.equal(await checkStaffAvailability('vet-1', bookingDate, '10:00', '11:00', 0, null, store), true);
    assert.deepEqual(getQuery().status.$nin, ['cancelled', 'confirmation_expired', 'rejected', 'no_show', 'completed', 'finished']);
  });

  await withModels({ bookings: [{ _id: 'active-1', status: 'confirmed', startTime: '10:30', endTime: '11:30' }] }, async () => {
    assert.equal(await checkStaffAvailability('vet-1', bookingDate, '10:00', '11:00', 0, null, store), false);
  });
});

test('current booking remains self-excluded from conflict checks', async () => {
  await withModels({ bookings: [{ _id: 'booking-1', status: 'pending', startTime: '10:00', endTime: '11:00' }] }, async getQuery => {
    assert.equal(await checkStaffAvailability('vet-1', bookingDate, '10:00', '11:00', 0, 'booking-1', store), true);
    assert.deepEqual(getQuery()._id, { $ne: 'booking-1' });
  });
});

test('invalid requested or active booking intervals fail closed', async () => {
  await withModels({}, async () => {
    assert.equal(await checkStaffAvailability('vet-1', bookingDate, 'bad', '11:00', 0, null, store), false);
  });

  await withModels({ bookings: [{ _id: 'legacy-1', status: 'confirmed', startTime: 'bad', endTime: '11:30' }] }, async () => {
    assert.equal(await checkStaffAvailability('vet-1', bookingDate, '10:00', '11:00', 0, null, store), false);
  });
});

test('discovery, readiness, and final validation share Store-timezone eligibility', async () => {
  const booking = {
    _id: 'booking-1', bookingDate, startTime: '10:00', endTime: '11:00', staff: 'vet-1'
  };
  await withModels({}, async () => {
    const direct = await getEligibleStaff(service, bookingDate, '10:00', '11:00', 'booking-1', store);
    const discovery = await getEligibleForBooking(booking, service, store);
    const readiness = await getBookingStaffReadiness(booking, service, store);
    const finalValidation = await validateAssignedStaff(booking, service, store);
    assert.equal(direct.length, 1);
    assert.equal(discovery.length, 1);
    assert.equal(readiness.reason, 'eligible');
    assert.equal(String(finalValidation.staff._id), 'vet-1');
  });

  const temporarilyUnavailable = {
    ...veterinarian,
    professionalProfile: {
      ...veterinarian.professionalProfile,
      temporaryUnavailable: { active: true, until: '2026-10-12T02:30:00.000Z' }
    }
  };
  await withModels({ staff: temporarilyUnavailable }, async () => {
    const discovery = await getEligibleForBooking(booking, service, store);
    const readiness = await getStaffAssignmentReadiness(service, bookingDate, '10:00', '11:00', 'booking-1', store);
    assert.equal(discovery.length, 0);
    assert.equal(readiness.reason, 'outside_schedule');
    assert.equal(readiness.scheduleReason, 'temporary_unavailable');
    await assert.rejects(validateAssignedStaff(booking, service, store), /no longer qualified or available/);
  });
});
