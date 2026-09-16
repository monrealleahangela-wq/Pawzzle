const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const Booking = require('../models/Booking');
const bookingRoutes = require('../routes/bookings');
const adminBookingRoutes = require('../routes/adminBookings');
const { recalculateBooking } = require('../services/bookingLifecycleService');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
const routePaths = router => router.stack
  .filter(layer => layer.route)
  .map(layer => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);

const estimateFixture = () => ({
  booking: {
    _id: new mongoose.Types.ObjectId(),
    pet: { size: 'Small' },
    bookingDate: new Date('2030-08-20T00:00:00.000Z'),
    startTime: '10:00',
    isHomeService: false,
    selectedAddOns: [],
    selectedConditions: [],
    voucher: null
  },
  service: { price: 300, pricingRules: {}, addOns: [] },
  store: { taxConfiguration: { isConfigured: false } }
});

test('initial request and store proposal pricing do not require tax verification', async () => {
  const { booking, service, store } = estimateFixture();
  const result = await recalculateBooking(booking, service, store, { includeAuthoritativeTax: false });
  assert.equal(result.breakdown.subtotal, 300);
  assert.equal(result.breakdown.finalPrice, 300);
  assert.equal(result.breakdown.calculationVersion, undefined);
  assert.equal(result.breakdown.taxStatus, undefined);
  assert.equal(result.breakdown.vatAmount, undefined);
});

test('payment-ready pricing still requires an authoritative store tax profile', async () => {
  const { booking, service, store } = estimateFixture();
  await assert.rejects(
    () => recalculateBooking(booking, service, store),
    error => error.code === 'STORE_TAX_VERIFICATION_REQUIRED' && error.statusCode === 409
  );
});

test('unversioned booking estimates do not fabricate VAT or Non-VAT fields', () => {
  const booking = new Booking({
    customer: new mongoose.Types.ObjectId(),
    addedBy: new mongoose.Types.ObjectId(),
    service: new mongoose.Types.ObjectId(),
    store: new mongoose.Types.ObjectId(),
    pet: { name: 'Milo', type: 'Dog' },
    bookingDate: new Date('2030-08-20T00:00:00.000Z'),
    startTime: '10:00',
    endTime: '11:00',
    pricingBreakdown: { basePrice: 300, subtotal: 300, discountedSubtotal: 300, finalPrice: 300 },
    paymentMethod: 'pending',
    totalPrice: 300
  });
  const estimate = booking.pricingBreakdown.toObject();
  assert.equal(estimate.calculationVersion, undefined);
  assert.equal(estimate.taxStatus, undefined);
  assert.equal(estimate.pricingMode, undefined);
  assert.equal(estimate.vatAmount, undefined);
});

test('request, proposal, confirmation, and payment remain separate routes and states', () => {
  const customer = routePaths(bookingRoutes);
  const admin = routePaths(adminBookingRoutes);
  assert.ok(customer.includes('POST /'));
  assert.ok(admin.includes('PUT /:id/proposal'));
  assert.ok(customer.includes('POST /:id/confirm'));
  assert.match(read('models/Booking.js'), /'pending', 'awaiting_customer_confirmation', 'awaiting_payment'/);
});

test('booking creation stores a pending payment method and immediately returns a pending request', () => {
  const controller = read('controllers/bookingController.js');
  const createSection = controller.slice(controller.indexOf('const createBooking ='), controller.indexOf('// Get bookings for a customer'));
  assert.match(createSection, /paymentMethod: 'pending'/);
  assert.match(createSection, /await booking\.save\(\)/);
  assert.match(createSection, /New Booking Request/);
  assert.doesNotMatch(createSection, /resolveTransactionTaxConfiguration|createBookingCheckoutSession/);
});

test('store can send a specialist-qualified proposal without finalizing tax', () => {
  const controller = read('controllers/bookingController.js');
  const proposalSection = controller.slice(controller.indexOf('const assignBookingStaff ='), controller.indexOf('const selectBookingStaff ='));
  assert.match(proposalSection, /getEligibleForBooking/);
  assert.match(proposalSection, /includeAuthoritativeTax: false/);
  assert.match(proposalSection, /status = 'awaiting_customer_confirmation'/);
});

test('customer acceptance applies tax before mutating the booking into awaiting payment', () => {
  const controller = read('controllers/bookingController.js');
  const confirmSection = controller.slice(controller.indexOf('const confirmBookingForPayment ='), controller.indexOf('const getBookingStaffProfile ='));
  assert.ok(confirmSection.indexOf('prepareForPayment(booking)') < confirmSection.indexOf("status = 'awaiting_payment'"));
  assert.match(confirmSection, /STORE_TAX_VERIFICATION_REQUIRED/);
  assert.match(confirmSection, /booking proposal is still saved/i);
});

test('PayMongo session creation is restricted to awaiting-payment bookings and authoritative preparation', () => {
  const payment = read('controllers/paymentController.js');
  const section = payment.slice(payment.indexOf('const createBookingCheckoutSession ='), payment.indexOf('const createAdoptionCheckoutSession ='));
  assert.match(section, /booking\.status !== 'awaiting_payment'/);
  assert.match(section, /await prepareForPayment\(booking\)/);
  assert.ok(section.indexOf('await prepareForPayment(booking)') < section.indexOf('ensureCheckoutSession'));
  assert.match(section, /STORE_TAX_VERIFICATION_REQUIRED/);
});

test('initial request UI contains no payment selector or frontend tax calculation', () => {
  const ui = read('client/src/pages/customer/Bookings.js');
  const requestForm = ui.slice(ui.indexOf('const handleBookingSubmit'), ui.indexOf('{/* Existing Bookings Header */}'));
  assert.match(requestForm, /Submit booking request/i);
  assert.match(requestForm, /Estimated Service Price/);
  assert.match(requestForm, /Final tax and payment details will be shown after the store reviews/);
  assert.doesNotMatch(requestForm, /calculateTransactionTax|getTaxStatusLabel|bookingForm\.paymentMethod|Payment Method/);
});

test('proposal view keeps estimates separate from authoritative payment summaries', () => {
  const ui = read('client/src/pages/customer/Bookings.js');
  assert.match(ui, /selectedHasAuthoritativePricing/);
  assert.match(ui, /Proposal Estimate/);
  assert.match(ui, /selectedIsPaymentStage && selectedHasAuthoritativePricing/);
  assert.match(ui, /Confirm and pay/);
});

test('store booking view explains when tax verification blocks only payment', () => {
  const admin = read('client/src/pages/admin/BookingsManagement.js');
  assert.match(admin, /Booking Price Estimate/);
  assert.match(admin, /You may review and send this proposal, but customer payment remains unavailable/);
});

test('product checkout retains its independent PayMongo payment UI', () => {
  const checkout = read('client/src/pages/customer/Checkout.js');
  assert.match(checkout, /PayMongo/i);
  assert.match(checkout, /PaymentBreakdown/);
});

test('booking ownership and store-scoped proposal authorization remain enforced', () => {
  const controller = read('controllers/bookingController.js');
  assert.match(controller, /String\(booking\.customer\) !== String\(req\.user\._id\)/);
  assert.match(controller, /isBookingManager\(req\.user, booking\)/);
  assert.match(read('routes/adminBookings.js'), /canUpdateBookings.*assignBookingStaff/);
});

