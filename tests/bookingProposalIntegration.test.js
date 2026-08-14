const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const fs = require('node:fs');
const path = require('node:path');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const Notification = require('../models/Notification');
const adminBookingRoutes = require('../routes/adminBookings');
const { createNotification } = require('../controllers/notificationController');
const { expireBookingProposals } = require('../controllers/bookingController');
const { __test: petCareTest } = require('../controllers/petCareController');
const {
  getStaffSpecializationRole,
  isRoleEligibleForService
} = require('../utils/staffSpecialization');

const routePaths = router => router.stack
  .filter(layer => layer.route)
  .map(layer => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);

test('booking proposals extend the existing booking record with customer-visible terms', () => {
  assert.ok(Booking.schema.path('proposal.estimatedDurationMinutes'));
  assert.ok(Booking.schema.path('proposal.specialInstructions'));
  assert.ok(Booking.schema.path('proposal.revision'));
  assert.ok(routePaths(adminBookingRoutes).includes('PUT /:id/proposal'));
});

test('specialist qualification supports direct roles, legacy roles, and boarding services', () => {
  assert.equal(getStaffSpecializationRole({ role: 'veterinarian' }), 'veterinarian');
  assert.equal(getStaffSpecializationRole({ role: 'staff', staffType: 'boarding_specialist' }), 'boarding_staff');
  assert.equal(isRoleEligibleForService('boarding_staff', { category: 'boarding_hotel' }), true);
  assert.equal(isRoleEligibleForService('boarding_staff', { category: 'health_wellness' }), false);
});

test('proposal and payment milestones are included in the existing service timeline', () => {
  const events = petCareTest.progressTimeline({
    paymentStatus: 'paid',
    lifecycle: {
      proposedAt: new Date('2026-08-14T01:00:00.000Z'),
      customerConfirmedAt: new Date('2026-08-14T02:00:00.000Z'),
      confirmedAt: new Date('2026-08-14T03:00:00.000Z')
    },
    paymentDetails: { transactionDate: new Date('2026-08-14T03:00:00.000Z') },
    serviceProgress: {}
  });
  assert.deepEqual(events.map(event => event.stage), ['proposal_received', 'staff_assigned', 'proposal_confirmed', 'payment_completed', 'booking_confirmed']);
});

test('staff compliments reuse the review model and retain one-review-per-booking protection', () => {
  const tagValues = Review.schema.path('complimentTags').caster.enumValues;
  assert.equal(tagValues.includes('gentle_with_pets'), true);
  const uniqueBookingReview = Review.schema.indexes().find(([fields]) => fields.bookingId === 1 && fields.staffId === 1);
  assert.equal(uniqueBookingReview?.[1]?.unique, true);
});

test('persisted notifications emit only to the authenticated recipient room when Socket.IO is available', async () => {
  const recipient = new mongoose.Types.ObjectId();
  const originalSave = Notification.prototype.save;
  const calls = [];
  Notification.prototype.save = async function save() { return this; };
  const io = { to: room => ({ emit: (event, payload) => calls.push({ room, event, payload }) }) };
  try {
    await createNotification({ recipient, type: 'booking_status', title: 'Proposal ready', message: 'Review it.' }, io);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].room, `user_${recipient}`);
    assert.equal(calls[0].event, 'newNotification');
  } finally {
    Notification.prototype.save = originalSave;
  }
});

test('authenticated user notification rooms do not break capability-only delivery sockets', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(serverSource, /if \(socket\.user\?\._id\) socket\.join\(`user_\$\{String\(socket\.user\._id\)\}`\)/);
});

test('proposal expiry atomically returns the booking to pending review without duplicate notifications', async () => {
  const ids = { booking: new mongoose.Types.ObjectId(), customer: new mongoose.Types.ObjectId(), owner: new mongoose.Types.ObjectId() };
  const originals = { find: Booking.find, update: Booking.findOneAndUpdate, save: Notification.prototype.save };
  let claimed = false;
  let notificationsSaved = 0;
  Booking.find = () => ({ select: async () => [{ _id: ids.booking, customer: ids.customer, addedBy: ids.owner }] });
  Booking.findOneAndUpdate = async (_filter, update) => {
    assert.equal(update.$set.status, 'pending');
    if (claimed) return null;
    claimed = true;
    return { _id: ids.booking, customer: ids.customer, addedBy: ids.owner };
  };
  Notification.prototype.save = async function save() { notificationsSaved += 1; return this; };
  try {
    assert.equal(await expireBookingProposals(), 1);
    assert.equal(await expireBookingProposals(), 0);
    assert.equal(notificationsSaved, 2);
  } finally {
    Booking.find = originals.find;
    Booking.findOneAndUpdate = originals.update;
    Notification.prototype.save = originals.save;
  }
});
