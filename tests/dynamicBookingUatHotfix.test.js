const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { prepareServiceIntake, resolveServiceIntakeKind, calculateBoardingNights } = require('../utils/bookingIntake');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('service categories resolve to the expected booking intake', () => {
  assert.equal(resolveServiceIntakeKind({ category: 'health_wellness' }), 'veterinary');
  assert.equal(resolveServiceIntakeKind({ category: 'grooming' }), 'grooming');
  assert.equal(resolveServiceIntakeKind({ category: 'training' }), 'training');
  assert.equal(resolveServiceIntakeKind({ category: 'boarding_hotel' }), 'boarding');
  assert.equal(resolveServiceIntakeKind({ name: 'Pet Adoption Consultation' }), 'adoption_consultation');
  assert.equal(resolveServiceIntakeKind({ category: 'other' }), 'general');
});

test('boarding duration and date validation use the submitted stay dates', () => {
  assert.equal(calculateBoardingNights('2026-08-20', '2026-08-23'), 3);

  const invalid = prepareServiceIntake(
    { category: 'boarding_hotel' },
    { kind: 'boarding', details: {
      checkInDate: '2026-08-23', checkOutDate: '2026-08-20', feedingSchedule: 'Twice daily',
      foodProvided: 'yes', takesMedication: 'no', specialCareInstructions: 'None', emergencyContact: 'Owner 09170000000'
    } }
  );
  assert.match(invalid.error, /after check-in/i);
});

test('service intake only stores allowed service-specific fields', () => {
  const result = prepareServiceIntake(
    { category: 'grooming' },
    {
      kind: 'grooming',
      details: {
        groomingPackage: 'Full grooming',
        coatCondition: 'Healthy',
        nailTrimming: 'yes',
        earCleaning: 'yes',
        behaviorConcern: 'no',
        symptoms: 'must not be stored',
        internalAdminNote: 'must not be stored'
      }
    }
  );

  assert.equal(result.error, null);
  assert.equal(result.value.kind, 'grooming');
  assert.equal(result.value.details.groomingPackage, 'Full grooming');
  assert.equal(result.value.details.symptoms, undefined);
  assert.equal(result.value.details.internalAdminNote, undefined);
});

test('booking UI keeps the existing proposal submission and adds dynamic steps', () => {
  const bookings = read('client/src/pages/customer/Bookings.js');
  const form = read('client/src/components/booking/ServiceSpecificBookingFields.js');

  assert.match(bookings, /label: 'Service'[\s\S]*label: 'Pet'[\s\S]*label: 'Details'[\s\S]*label: 'Date & time'[\s\S]*label: 'Review'/);
  assert.match(bookings, /bookingService\.createBooking\(bookingData\)/);
  assert.match(bookings, /serviceIntake:\s*buildServiceIntake/);
  assert.match(bookings, /<ServiceSpecificBookingFields/);
  assert.match(bookings, /<ServiceIntakeSummary/);

  assert.match(form, /Veterinary visit/);
  assert.match(form, /Grooming package/);
  assert.match(form, /Training goal/);
  assert.match(form, /Check-out date/);
  assert.match(form, /Adoption consultation/);
  assert.match(form, /dark:text-slate-100/);
});

test('booking persistence is optional and backward compatible', () => {
  const model = read('models/Booking.js');
  const controller = read('controllers/bookingController.js');

  assert.match(model, /serviceIntake:\s*\{/);
  assert.match(model, /type:\s*Map/);
  assert.match(controller, /prepareServiceIntake\(service, serviceIntake\)/);
  assert.match(controller, /serviceIntake:\s*preparedIntake\.value/);
});

test('customer and store booking details show submitted intake', () => {
  assert.match(read('client/src/pages/customer/Bookings.js'), /Information you shared/);
  assert.match(read('client/src/pages/admin/BookingsManagement.js'), /Customer service details/);
});
