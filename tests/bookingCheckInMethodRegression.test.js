const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const Booking = require('../models/Booking');
const { BOOKING_CHECK_IN_METHODS, isBookingCheckInMethod } = require('../utils/bookingCheckInMethod');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

const bookingFixture = overrides => ({
  customer: new mongoose.Types.ObjectId(),
  addedBy: new mongoose.Types.ObjectId(),
  service: new mongoose.Types.ObjectId(),
  store: new mongoose.Types.ObjectId(),
  pet: { name: 'Milo', type: 'Dog' },
  bookingDate: new Date('2030-10-20T00:00:00.000Z'),
  bookingLocalDate: '2030-10-20',
  startTime: '10:00',
  endTime: '11:00',
  paymentMethod: 'pending',
  totalPrice: 499.75,
  ...overrides
});

test('ordinary service booking validates before physical check-in', async () => {
  const booking = new Booking(bookingFixture());
  await booking.validate();
  assert.equal(booking.checkInMethod, null);
  assert.equal(booking.totalPrice, 499.75);
});

test('grooming booking validates with service intake and no preselected check-in method', async () => {
  const voucher = new mongoose.Types.ObjectId();
  const booking = new Booking(bookingFixture({
    totalPrice: 875.5,
    voucher,
    discountAmount: 75,
    serviceIntake: {
      kind: 'grooming',
      details: { groomingPackage: 'Full Grooming', coatCondition: 'Healthy' }
    }
  }));
  await booking.validate();
  assert.equal(booking.checkInMethod, null);
  assert.equal(booking.serviceIntake.kind, 'grooming');
  assert.equal(String(booking.voucher), String(voucher));
  assert.equal(booking.discountAmount, 75);
});

test('only the supported staff verification methods validate once assigned', async () => {
  assert.deepEqual(BOOKING_CHECK_IN_METHODS, ['qr', 'backup_code']);
  assert.equal(isBookingCheckInMethod('qr'), true);
  assert.equal(isBookingCheckInMethod('backup_code'), true);
  assert.equal(isBookingCheckInMethod('customer_selected'), false);

  await new Booking(bookingFixture({ checkInMethod: 'qr' })).validate();
  await new Booking(bookingFixture({ checkInMethod: 'backup_code' })).validate();
  await assert.rejects(
    () => new Booking(bookingFixture({ checkInMethod: 'customer_selected' })).validate(),
    /Unsupported reservation check-in method/
  );
});

test('customer booking payload does not invent a physical check-in method', () => {
  const ui = read('client/src/pages/customer/Bookings.js');
  const submit = ui.slice(ui.indexOf('const handleBookingSubmit'), ui.indexOf('{/* Existing Bookings Header */}'));
  assert.doesNotMatch(submit, /checkInMethod\s*:/);
  assert.match(submit, /bookingSubmissionInFlight\.current/);
  assert.match(submit, /if \(bookingSubmissionInFlight\.current\) return/);
});

test('staff check-in paths share the authoritative method validation', () => {
  const service = read('services/reservationCheckInService.js');
  const controller = read('controllers/bookingController.js');
  assert.match(service, /isBookingCheckInMethod\(method\)/);
  assert.match(controller, /isBookingCheckInMethod\(method\)/);
  assert.match(service, /checkInMethod: method/);
});
