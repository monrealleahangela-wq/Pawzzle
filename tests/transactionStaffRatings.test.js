const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET ||= 'test-only-jwt-secret';

const Booking = require('../models/Booking');
const Delivery = require('../models/Delivery');
const Order = require('../models/Order');
const Review = require('../models/Review');
const User = require('../models/User');
const { __testing } = require('../controllers/reviewController');

const source = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('specialized-staff eligibility is derived from the owned paid completed booking', async () => {
  const originalFindOne = Booking.findOne;
  const originalExists = Review.exists;
  const customerId = 'customer-1';
  const staffId = 'staff-1';
  let booking = {
    _id: 'booking-1', customer: customerId, store: 'store-1', service: 'service-1',
    status: 'completed', paymentStatus: 'paid', serviceProvider: staffId,
    reviewStatus: { isRated: false }
  };
  let existingReview = null;
  Booking.findOne = async query => {
    assert.equal(query.customer, customerId);
    return booking;
  };
  Review.exists = async query => {
    assert.deepEqual(query, { targetType: 'Booking', bookingId: 'booking-1' });
    return existingReview;
  };

  try {
    const eligible = await __testing.resolveBookingStaffReview(customerId, 'booking-1');
    assert.equal(eligible.isEligible, true);
    assert.equal(eligible.staffId, staffId);

    booking = { ...booking, status: 'confirmed' };
    assert.equal((await __testing.resolveBookingStaffReview(customerId, 'booking-1')).reason, 'booking_not_completed');

    booking = { ...booking, status: 'completed', paymentStatus: 'pending' };
    assert.equal((await __testing.resolveBookingStaffReview(customerId, 'booking-1')).reason, 'booking_not_paid');

    booking = { ...booking, paymentStatus: 'paid', serviceProvider: null, staff: null };
    assert.equal((await __testing.resolveBookingStaffReview(customerId, 'booking-1')).reason, 'staff_not_recorded');

    booking = { ...booking, serviceProvider: staffId };
    existingReview = { _id: 'review-1' };
    assert.equal((await __testing.resolveBookingStaffReview(customerId, 'booking-1')).reason, 'already_reviewed');
  } finally {
    Booking.findOne = originalFindOne;
    Review.exists = originalExists;
  }
});

test('rider eligibility is derived from an owned completed delivery and its actual internal rider', async () => {
  const originalFindById = Delivery.findById;
  const originalOrderFindOne = Order.findOne;
  const originalExists = Review.exists;
  const customerId = 'customer-2';
  const riderId = 'rider-1';
  let delivery = {
    _id: 'delivery-1', order: 'order-1', store: 'store-1', status: 'delivered',
    assignmentType: 'internal', assignedRider: riderId, reviewStatus: { isRated: false }
  };
  let order = { _id: 'order-1', customer: customerId, store: 'store-1', status: 'delivered' };
  let existingReview = null;
  Delivery.findById = async () => delivery;
  Order.findOne = async query => {
    assert.equal(query.customer, customerId);
    assert.equal(query.store, 'store-1');
    return order;
  };
  Review.exists = async query => {
    assert.deepEqual(query, { targetType: 'Delivery', deliveryId: 'delivery-1' });
    return existingReview;
  };

  try {
    const eligible = await __testing.resolveDeliveryRiderReview(customerId, 'delivery-1', 'order-1');
    assert.equal(eligible.isEligible, true);
    assert.equal(eligible.staffId, riderId);

    delivery = { ...delivery, status: 'in_transit' };
    assert.equal((await __testing.resolveDeliveryRiderReview(customerId, 'delivery-1')).reason, 'delivery_not_completed');

    delivery = { ...delivery, status: 'delivered', assignmentType: 'third_party', assignedRider: null };
    assert.equal((await __testing.resolveDeliveryRiderReview(customerId, 'delivery-1')).reason, 'internal_rider_not_recorded');

    delivery = { ...delivery, assignmentType: 'internal', assignedRider: riderId };
    order = null;
    assert.equal((await __testing.resolveDeliveryRiderReview(customerId, 'delivery-1')).reason, 'order_not_owned');

    order = { _id: 'order-1', customer: customerId, store: 'store-1', status: 'delivered' };
    existingReview = { _id: 'review-2' };
    assert.equal((await __testing.resolveDeliveryRiderReview(customerId, 'delivery-1')).reason, 'already_reviewed');
  } finally {
    Delivery.findById = originalFindById;
    Order.findOne = originalOrderFindOne;
    Review.exists = originalExists;
  }
});

test('transaction rating indexes and profiles start without fabricated ratings', () => {
  const bookingIndex = Review.schema.indexes().find(([fields]) => fields.bookingId === 1 && fields.staffId === 1);
  const deliveryIndex = Review.schema.indexes().find(([fields]) => fields.deliveryId === 1 && fields.staffId === 1);
  assert.equal(bookingIndex?.[1]?.unique, true);
  assert.equal(deliveryIndex?.[1]?.unique, true);

  const staff = new User({ firstName: 'New', lastName: 'Professional', email: 'new-professional@example.com', role: 'staff' });
  assert.equal(staff.professionalProfile.rating, 0);
  assert.equal(staff.professionalProfile.reviewCount, 0);
  assert.match(source('client/src/pages/customer/StoreDetail.js'), /No ratings yet/);
  assert.match(source('client/src/components/admin/RiderDashboard.js'), /No ratings yet/);
  assert.doesNotMatch(source('client/src/pages/customer/Home.js'), /reputation \|\| '5\.0'/);
  assert.doesNotMatch(source('client/src/pages/customer/StoreDetail.js'), /rating \|\| '5\.0'/);
});

test('real booking ratings refresh the specialized profile average and count', async () => {
  const originalAggregate = Review.aggregate;
  const originalUpdate = User.findByIdAndUpdate;
  let aggregateRows = [{ average: 4.5, count: 2 }];
  let update;
  Review.aggregate = async pipeline => {
    assert.deepEqual(pipeline[0].$match, {
      targetType: 'Booking', staffId: 'staff-2', isApproved: true, isDeleted: { $ne: true }
    });
    return aggregateRows;
  };
  User.findByIdAndUpdate = async (staffId, payload) => { update = { staffId, payload }; };

  try {
    await __testing.refreshStaffRating('staff-2');
    assert.equal(update.staffId, 'staff-2');
    assert.equal(update.payload['professionalProfile.rating'], 4.5);
    assert.equal(update.payload['professionalProfile.reviewCount'], 2);

    aggregateRows = [];
    await __testing.refreshStaffRating('staff-2');
    assert.equal(update.payload['professionalProfile.rating'], 0);
    assert.equal(update.payload['professionalProfile.reviewCount'], 0);
  } finally {
    Review.aggregate = originalAggregate;
    User.findByIdAndUpdate = originalUpdate;
  }
});

test('customer rating actions use the existing order and booking surfaces', () => {
  const orderList = source('client/src/pages/customer/Orders.js');
  const orderDetail = source('client/src/pages/customer/OrderDetail.js');
  const bookings = source('client/src/pages/customer/Bookings.js');
  const modal = source('client/src/components/ReviewModal.js');

  assert.match(orderList, /targetType="Delivery"/);
  assert.match(orderDetail, /checkReviewEligibility\('Delivery'/);
  assert.match(orderDetail, /Rate Rider/);
  assert.match(bookings, /targetType="Booking"/);
  assert.match(bookings, /paymentStatus === 'paid'/);
  assert.match(bookings, /Rate Staff/);
  assert.match(modal, /const \[rating, setRating\] = useState\(0\)/);
  assert.match(modal, /disabled=\{submitting \|\| !rating\}/);
});

test('server derives reviewer and assigned target instead of trusting frontend identities', () => {
  const controller = source('controllers/reviewController.js');
  assert.match(controller, /const userId = req\.user\._id/);
  assert.match(controller, /staffId = eligibility\.staffId/);
  assert.match(controller, /resolveBookingStaffReview\(userId, bookingId\)/);
  assert.match(controller, /resolveDeliveryRiderReview\(userId, targetId, orderId\)/);
  assert.match(controller, /delivery\.assignmentType !== 'internal'/);
});
