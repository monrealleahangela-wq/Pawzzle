const test = require('node:test');
const assert = require('node:assert/strict');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const User = require('../models/User');
const bookingRoutes = require('../routes/bookings');
const adminBookingRoutes = require('../routes/adminBookings');
const { getConfirmationExpiry } = require('../services/bookingLifecycleService');
const { finalizeBooking } = require('../services/paymentReconciliationService');
const RevenueService = require('../services/revenueService');

const routePaths = router => router.stack.filter(layer => layer.route).map(layer => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);

test('booking schema supports the integrated request-to-payment lifecycle without removing legacy states', () => {
  const states = Booking.schema.path('status').enumValues;
  for (const state of ['pending', 'awaiting_customer_confirmation', 'awaiting_payment', 'confirmed', 'processing', 'finished', 'completed', 'confirmation_expired']) {
    assert.equal(states.includes(state), true, `missing ${state}`);
  }
  assert.equal(states.includes('approved'), true);
});

test('customer and admin APIs expose assignment, preview, confirmation, and cancellation on the existing booking module', () => {
  const customer = routePaths(bookingRoutes);
  const admin = routePaths(adminBookingRoutes);
  assert.equal(customer.includes('GET /:id/eligible-staff'), true);
  assert.equal(customer.includes('PUT /:id/select-staff'), true);
  assert.equal(customer.includes('POST /:id/confirm'), true);
  assert.equal(customer.includes('PUT /:id/cancel'), true);
  assert.equal(admin.includes('PUT /:id/assign-staff'), true);
});

test('confirmation expiry uses a store-configured duration and a safe legacy default', () => {
  const before = Date.now();
  const configured = getConfirmationExpiry({ bookingSettings: { confirmationWindowMinutes: 120 } });
  const fallback = getConfirmationExpiry({});
  assert.ok(configured.getTime() >= before + 119 * 60000);
  assert.ok(configured.getTime() <= before + 121 * 60000);
  assert.ok(fallback.getTime() >= before + 1439 * 60000);
});

test('staff reviews are one-per-booking and new staff profiles do not start with a fake five-star rating', () => {
  const reviewIndex = Review.schema.indexes().find(([fields]) => fields.bookingId === 1 && fields.staffId === 1);
  assert.equal(reviewIndex?.[1]?.unique, true);
  const user = new User({ firstName: 'Test', lastName: 'Staff', email: 'staff-test@example.com', role: 'staff' });
  assert.equal(user.professionalProfile.rating, 0);
  assert.equal(user.professionalProfile.reviewCount, 0);
});

test('verified PayMongo booking payment promotes the existing booking to confirmed exactly once', async () => {
  const originals = {
    update: Booking.findOneAndUpdate,
    find: Booking.findById,
    revenue: RevenueService.recordPayment
  };
  let updatePayload;
  Booking.findOneAndUpdate = async (_filter, payload) => { updatePayload = payload; return { _id: 'booking-1' }; };
  Booking.findById = async () => ({ _id: 'booking-1', status: 'confirmed', paymentStatus: 'paid' });
  RevenueService.recordPayment = async () => ({ isRevenueRecorded: true });
  try {
    const payment = { id: 'pay_same', attributes: { amount: 50000, status: 'paid' } };
    await finalizeBooking({
      _id: 'booking-1', totalPrice: 500, status: 'awaiting_payment', customer: 'customer-1', addedBy: 'admin-1',
      paymentDetails: { paymentId: 'pay_same' }
    }, payment);
    assert.equal(updatePayload.$set.status, 'confirmed');
    assert.equal(updatePayload.$set.paymentStatus, 'paid');
  } finally {
    Booking.findOneAndUpdate = originals.update;
    Booking.findById = originals.find;
    RevenueService.recordPayment = originals.revenue;
  }
});
