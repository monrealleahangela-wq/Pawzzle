const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Booking = require('../models/Booking');
const PetServiceUpdate = require('../models/PetServiceUpdate');
const adminBookingRoutes = require('../routes/adminBookings');
const petCareRoutes = require('../routes/petCare');
const { reminderWindow } = require('../services/bookingReminderService');
const { __test: petCareTest } = require('../controllers/petCareController');

const routePaths = router => router.stack.filter(layer => layer.route)
  .map(layer => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);

test('care summaries and reminder claims extend the existing booking record', () => {
  assert.ok(Booking.schema.path('careSummary.aftercareInstructions'));
  assert.ok(Booking.schema.path('careSummary.serviceNotes'));
  assert.ok(Booking.schema.path('reminders.twentyFourHourSentAt'));
  assert.ok(Booking.schema.path('reminders.twoHourSentAt'));
});

test('reminders select the nearest unsent care window without notifying after service time', () => {
  const now = new Date('2026-08-14T08:00:00.000Z');
  const bookingAt = hours => ({ bookingDate: new Date(now.getTime() + hours * 3600000), startTime: new Date(now.getTime() + hours * 3600000).toTimeString().slice(0, 5) });
  assert.equal(reminderWindow(bookingAt(20), now).key, 'twentyFourHourSentAt');
  assert.equal(reminderWindow(bookingAt(1), now).key, 'twoHourSentAt');
  assert.equal(reminderWindow(bookingAt(-1), now), null);
});

test('timeline includes confirmed booking, assigned specialist, check-in, and service milestones', () => {
  const time = new Date('2026-08-14T01:00:00.000Z');
  const events = petCareTest.progressTimeline({
    pet: { name: 'Max' }, store: { name: 'Pawzzle Branch' }, staff: { firstName: 'Ana', lastName: 'Vet' },
    paymentStatus: 'paid', paymentDetails: { transactionDate: time },
    lifecycle: { proposedAt: time, customerConfirmedAt: time, confirmedAt: time },
    serviceProgress: { arrivedAt: time, startedAt: time, readyAt: time, completedAt: time }
  });
  for (const stage of ['staff_assigned', 'booking_confirmed', 'pet_arrived', 'service_started', 'ready_for_pickup', 'completed']) {
    assert.equal(events.some(event => event.stage === stage), true, `missing ${stage}`);
  }
});

test('existing booking and pet-care modules expose check-in and aftercare actions', () => {
  assert.equal(routePaths(adminBookingRoutes).includes('POST /:id/check-in'), true);
  assert.equal(routePaths(petCareRoutes).includes('PUT /bookings/:bookingId/aftercare'), true);
});

test('service updates reuse one model for reminders and aftercare while preserving internal visibility', () => {
  const entryTypes = PetServiceUpdate.schema.path('entryType').enumValues;
  assert.equal(entryTypes.includes('reminder'), true);
  assert.equal(entryTypes.includes('aftercare'), true);
  assert.equal(PetServiceUpdate.schema.path('visibility').enumValues.includes('internal'), true);
});

test('multi-photo care updates reuse the existing Cloudinary upload path', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'petCareController.js'), 'utf8');
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'petCare.js'), 'utf8');
  assert.match(source, /servicePhotos: \{ \$each: files\.map/);
  assert.match(routes, /uploadServicePhotos/);
});
