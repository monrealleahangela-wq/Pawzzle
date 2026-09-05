const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serviceRoutes = require('../routes/services');
const bookingRoutes = require('../routes/bookings');
const adminBookingRoutes = require('../routes/adminBookings');
const { prepareServiceIntake } = require('../utils/bookingIntake');
const { buildBookingPetSnapshot } = require('../utils/bookingPetSnapshot');
const { validateServiceSchedule } = require('../utils/serviceAvailability');
const { derivePetAge } = require('../utils/petAge');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
const routes = router => router.stack.filter(layer => layer.route).map(layer => ({
  path: layer.route.path,
  methods: Object.keys(layer.route.methods).map(method => method.toUpperCase()),
  handlers: layer.route.stack.map(item => item.handle.name)
}));

test('customer service listing and store-specific reads are public and customer-safe', () => {
  const registered = routes(serviceRoutes);
  assert.ok(registered.some(route => route.path === '/all' && route.methods.includes('GET')));
  const storeRead = registered.find(route => route.path === '/store/:storeId' && route.methods.includes('GET'));
  assert.ok(storeRead);
  assert.deepEqual(storeRead.handlers, ['getStoreServices']);

  const controller = read('controllers/serviceController.js');
  assert.match(controller, /PUBLIC_STORE_FILTER[\s\S]*isActive: true[\s\S]*verificationStatus: \{ \$in: \['verified', null\] \}/);
  assert.match(controller, /const filter = \{ store: storeId, isActive: true, isDeleted:/);
});

test('public service details reject inactive services and unavailable stores', () => {
  const controller = read('controllers/serviceController.js');
  assert.match(controller, /!isAdminRequest && \(!service\.isActive/);
  assert.match(controller, /service\.store\.verificationStatus !== 'verified'/);
  assert.match(controller, /refundPolicy isActive isDeleted verificationStatus/);
});

test('booking request uses an owned pet profile snapshot without requiring duplicate optional metrics', () => {
  const snapshot = buildBookingPetSnapshot({ name: 'tampered' }, {
    name: 'Mochi', type: 'Dog', breed: '', birthday: null, approximateAge: { value: 8, unit: 'months' },
    gender: 'Female', weight: null, size: 'Small'
  });
  assert.equal(snapshot.name, 'Mochi');
  assert.equal(snapshot.age, 8 / 12);
  assert.equal(snapshot.weight, null);

  const routeSource = read('routes/bookings.js');
  const controller = read('controllers/bookingController.js');
  assert.match(routeSource, /body\('petProfileId'\).*isMongoId/);
  assert.match(routeSource, /body\('pet\.age'\)\.optional/);
  assert.match(routeSource, /body\('pet\.weight'\)\.optional/);
  assert.match(controller, /PetProfile\.findOne\(\{ _id: petProfileId, owner: req\.user\._id \}\)/);
  assert.match(controller, /pet: bookingPet/);
});

test('service-specific intake accepts relevant fields and discards irrelevant ones', () => {
  const veterinary = prepareServiceIntake({ category: 'health_wellness' }, { details: {
    reasonForVisit: 'Checkup', symptoms: 'Low appetite', symptomDuration: 'Two days', emergency: 'no',
    groomingPackage: 'must not persist'
  } });
  assert.equal(veterinary.error, null);
  assert.equal(veterinary.value.details.reasonForVisit, 'Checkup');
  assert.equal(veterinary.value.details.groomingPackage, undefined);

  const grooming = prepareServiceIntake({ category: 'grooming' }, { details: {
    groomingPackage: 'Bath', coatCondition: 'Normal', nailTrimming: 'yes', earCleaning: 'yes', behaviorConcern: 'none'
  } });
  assert.equal(grooming.error, null);
});

test('server derives the end time and rejects closed, past-boundary, and out-of-hours schedules', () => {
  const service = { duration: 60, schedule: { enabled: false } };
  const store = { businessHours: { monday: { open: '09:00', close: '17:00', closed: false }, tuesday: { closed: true } } };
  assert.deepEqual(
    validateServiceSchedule({ service, store, bookingDate: '2026-09-07', startTime: '10:00', duration: 60 }),
    { valid: true, reason: null, endTime: '11:00' }
  );
  assert.equal(validateServiceSchedule({ service, store, bookingDate: '2026-09-07', startTime: '16:30', duration: 60 }).valid, false);
  assert.equal(validateServiceSchedule({ service, store, bookingDate: '2026-09-08', startTime: '10:00', duration: 60 }).valid, false);
});

test('proposal, qualified specialist assignment, customer confirmation, and PayMongo handoff remain connected', () => {
  const customer = routes(bookingRoutes);
  const admin = routes(adminBookingRoutes);
  assert.ok(admin.some(route => route.path === '/:id/proposal' && route.methods.includes('PUT') && route.handlers.includes('assignBookingStaff')));
  assert.ok(admin.some(route => route.path === '/:id/eligible-staff' && route.methods.includes('GET') && route.handlers.includes('getEligibleBookingStaff')));
  assert.ok(customer.some(route => route.path === '/:id/confirm' && route.methods.includes('POST') && route.handlers.includes('confirmBookingForPayment')));
  assert.match(read('controllers/bookingController.js'), /status = 'awaiting_payment'/);
  assert.match(read('controllers/paymentController.js'), /createBookingCheckoutSession/);
});

test('booking creation preserves store-derived tenant scope and does not require preselected staff', () => {
  const controller = read('controllers/bookingController.js');
  assert.match(controller, /const storeId = service\.store\?\._id \|\| service\.store/);
  assert.match(controller, /store: storeId/);
  assert.match(controller, /staff: null/);
  assert.match(read('services/bookingLifecycleService.js'), /getEligibleForBooking/);
});

test('legacy tax flags use the existing non-VAT transaction fallback instead of blocking booking requests', () => {
  const serviceController = read('controllers/serviceController.js');
  const bookingController = read('controllers/bookingController.js');
  const lifecycle = read('services/bookingLifecycleService.js');
  assert.match(serviceController, /resolveTransactionTaxConfiguration/);
  assert.match(bookingController, /resolveTransactionTaxConfiguration/);
  assert.match(lifecycle, /resolveTransactionTaxConfiguration/);
  assert.doesNotMatch(bookingController, /Store tax configuration is missing\. Booking payment/);
  assert.doesNotMatch(lifecycle, /Store tax configuration is missing\. Booking payment/);
  assert.doesNotMatch(read('client/src/pages/customer/Bookings.js'), /taxConfigReady/);
});

test('seller Add Pet is sale-only and birth date is the authoritative age source', () => {
  const form = read('client/src/components/pets/PetListingFormModal.js');
  const page = read('client/src/pages/admin/Pets.js');
  const routesSource = read('routes/adminPets.js');
  const controller = read('controllers/petController.js');

  assert.match(form, /Add Pet for Sale/);
  assert.match(form, />Birth Date</);
  assert.match(form, /Selling Price/);
  assert.doesNotMatch(form, /Adoption Fee|<option value="adoption">Adoption<\/option>/);
  assert.match(page, /listingType: editingPet\?\.listingType === 'adoption' \? 'adoption' : 'sale'/);
  assert.match(routesSource, /body\('birthday'\)\.isISO8601/);
  assert.match(routesSource, /body\('listingType'\)\.optional\(\)\.equals\('sale'\)/);
  assert.match(controller, /const derivedAge = derivePetAge\(req\.body\.birthday\)/);
  assert.match(controller, /listingType: 'sale'/);
});

test('pet birth date derivation supports newborns and prevents future dates', () => {
  assert.deepEqual(derivePetAge('2025-07-15', new Date(2026, 8, 5)), {
    valid: true, age: 1, ageUnit: 'years', years: 1, months: 1
  });
  const newborn = derivePetAge('2026-09-05', new Date(2026, 8, 5));
  assert.equal(newborn.valid, true);
  assert.equal(newborn.age, 0);
  assert.equal(derivePetAge('2026-09-06', new Date(2026, 8, 5)).valid, false);
});

test('PCCI stays optional for seller listings and Customer My Pets remains a separate model', () => {
  const adminRoutes = read('routes/adminPets.js');
  const form = read('client/src/components/pets/PetListingFormModal.js');
  assert.match(adminRoutes, /body\('pcciRegistration\.status'\)\.optional/);
  assert.match(form, /PCCI Registration Document/);
  assert.match(form, /petForm\.species === 'dog'/);
  assert.doesNotMatch(read('models/PetProfile.js'), /required: true[^\n]*pcci|pcci[^\n]*required: true/i);
});
