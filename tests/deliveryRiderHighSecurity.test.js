const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeRole,
  getEffectivePermissions,
  hasPermission,
  isOperationalStaff
} = require('../config/permissions');
const { validateAssignmentSource, validatePickupEligibility } = require('../services/deliveryAssignmentService');
const { riderDeliveryView, riderFeedbackView } = require('../utils/deliveryViews');
const { revokeDeliveryRoomForUser } = require('../services/socketAuthorization');
const { requirePermission } = require('../middleware/auth');
const User = require('../models/User');
const Delivery = require('../models/Delivery');
const RiderEarning = require('../models/RiderEarning');
const RiderPayout = require('../models/RiderPayout');
const Review = require('../models/Review');
const { getMyRiderDetails } = require('../controllers/staffController');

const root = path.join(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

test('retired dispatcher cannot regain logistics access through explicit permissions', () => {
  const users = [
    { role: 'delivery_dispatcher', permissions: { logistics: { manage: true } } },
    { role: 'staff', staffType: 'logistics_staff', store: 'store-1', permissions: { 'logistics.manage': true } }
  ];
  for (const user of users) {
    assert.equal(normalizeRole(user), 'retired_delivery_dispatcher');
    assert.deepEqual(getEffectivePermissions(user), []);
    assert.equal(hasPermission(user, 'logistics.manage'), false);
    assert.equal(isOperationalStaff(user), false);
  }
  assert.equal(hasPermission({ role: 'manager' }, 'logistics.manage'), true);

  const uiAuthorization = source('client/src/utils/authorization.js');
  const layout = source('client/src/components/Layout.js');
  assert.match(uiAuthorization, /effectiveStaffType\(user\) === 'retired_delivery_dispatcher'\) return false/);
  assert.match(layout, /effectiveStaffType\(user\) === 'retired_delivery_dispatcher'\) return false/);

  let statusCode;
  let nextCalled = false;
  requirePermission('logistics.manage')({ user: users[1] }, {
    status(code) { statusCode = code; return this; },
    json() { return this; }
  }, () => { nextCalled = true; });
  assert.equal(statusCode, 403);
  assert.equal(nextCalled, false);
});

test('staff mutation endpoints accept active roles rather than historical dispatcher enum values', () => {
  const controller = source('controllers/staffController.js');
  assert.match(controller, /DIRECT_STAFF_ROLES\.includes\(staffType\)/);
  assert.match(controller, /normalizeRole\(staff\) === 'retired_delivery_dispatcher'/);
  assert.doesNotMatch(controller, /schema\.path\('staffType'\)\.enumValues\.includes\(staffType\)/);
});

test('assignment source eligibility rejects invalid Order lifecycles and fulfillment methods', () => {
  assert.equal(validateAssignmentSource({
    orderId: 'order-1', source: { status: 'ready_for_pickup', deliveryMethod: 'delivery' }
  }), true);
  assert.equal(validateAssignmentSource({
    orderId: 'order-1', source: { status: 'rider_assigned', deliveryMethod: 'delivery' }
  }), true);
  for (const status of ['pending_payment', 'cancelled', 'completed', 'delivered']) {
    assert.throws(() => validateAssignmentSource({
      orderId: 'order-1', source: { status, deliveryMethod: 'delivery' }
    }), /not eligible/);
  }
  assert.throws(() => validateAssignmentSource({
    orderId: 'order-1', source: { status: 'ready_for_pickup', deliveryMethod: 'pickup' }
  }), /Only delivery orders/);
});

test('assignment source eligibility permits only paid active home-service Bookings', () => {
  assert.equal(validateAssignmentSource({
    bookingId: 'booking-1', source: { status: 'confirmed', paymentStatus: 'paid', isHomeService: true }
  }), true);
  assert.throws(() => validateAssignmentSource({
    bookingId: 'booking-1', source: { status: 'confirmed', paymentStatus: 'pending', isHomeService: true }
  }), /must be paid/);
  assert.throws(() => validateAssignmentSource({
    bookingId: 'booking-1', source: { status: 'confirmed', paymentStatus: 'paid', isHomeService: false }
  }), /home-service/);
  assert.throws(() => validateAssignmentSource({
    bookingId: 'booking-1', source: { status: 'cancelled', paymentStatus: 'paid', isHomeService: true }
  }), /not eligible/);
});

test('rider delivery serializer excludes customer capabilities, OTP, and payment internals', () => {
  const payload = riderDeliveryView({
    _id: 'delivery-1',
    trackingToken: 'customer-capability-secret',
    riderToken: 'legacy-rider-secret',
    capacityReservation: { rider: 'rider-1', weightKg: 10 },
    assignmentHistory: [{ rider: 'rider-1' }],
    parcel: { weightKg: 10, parcelCount: 2, recordedBy: 'internal-actor', recordedAt: new Date() },
    status: 'assigned',
    isLive: true,
    order: {
      _id: 'order-1', orderNumber: 'ORD-1', paymentMethod: 'paymongo', totalAmount: 100,
      pickupSession: { code: '123456' },
      paymentDetails: { sessionId: 'session-secret', paymentId: 'payment-secret', checkoutUrl: 'https://secret.invalid' },
      customer: { _id: 'customer-1', firstName: 'Customer', lastName: 'One', phone: '09170000000', email: 'private@example.com' },
      shippingAddress: { street: 'Street', city: 'City' }
    }
  });
  const serialized = JSON.stringify(payload);
  for (const secret of ['customer-capability-secret', 'legacy-rider-secret', '123456', 'session-secret', 'payment-secret', 'secret.invalid', 'private@example.com']) {
    assert.doesNotMatch(serialized, new RegExp(secret.replace('.', '\\.')));
  }
  assert.equal(payload.order.orderNumber, 'ORD-1');
  assert.equal(payload.order.customer.phone, '09170000000');
  assert.equal(payload.capacityReservation, undefined);
  assert.deepEqual(payload.parcel, { weightKg: 10, parcelCount: 2 });

  const feedback = riderFeedbackView({
    _id: 'review-1', rating: 5, comment: 'Careful delivery',
    deliveryId: {
      _id: 'delivery-1', deliveredAt: new Date('2026-01-01T00:00:00Z'),
      trackingToken: 'customer-tracking-secret', riderToken: 'legacy-secret',
      order: { pickupSession: { code: '123456' }, paymentDetails: { paymentId: 'pay-secret' } }
    }
  });
  assert.equal(String(feedback.deliveryReference), 'delivery-1');
  assert.doesNotMatch(JSON.stringify(feedback), /customer-tracking-secret|legacy-secret|123456|pay-secret/);

  const staffController = source('controllers/staffController.js');
  assert.match(staffController, /populate\('delivery', '_id status deliveredAt'\)/);
  assert.match(staffController, /populate\('deliveryId', '_id deliveredAt'\)/);
  assert.doesNotMatch(staffController, /populate\('deliveryId', '[^']*trackingToken/);
  assert.match(staffController, /recentFeedback\.map\(riderFeedbackView\)/);
});

test('Rider summary endpoint returns feedback without a customer tracking capability', async () => {
  const originals = {
    userFindOne: User.findOne,
    deliveryFind: Delivery.find,
    earningFind: RiderEarning.find,
    payoutFind: RiderPayout.find,
    reviewAggregate: Review.aggregate,
    reviewFind: Review.find
  };
  const query = value => ({
    select() { return this; },
    populate() { return this; },
    sort() { return this; },
    limit() { return this; },
    lean: async () => value
  });
  User.findOne = () => query({ _id: 'rider-1', role: 'delivery_rider', store: { _id: 'store-1', name: 'Store' } });
  Delivery.find = () => query([]);
  RiderEarning.find = () => query([]);
  RiderPayout.find = () => query([]);
  Review.aggregate = async () => [{ averageRating: 5, totalRatings: 1 }];
  Review.find = () => query([{
    _id: 'review-1', rating: 5, comment: 'Careful delivery', createdAt: new Date(),
    deliveryId: { _id: 'delivery-1', deliveredAt: new Date(), trackingToken: 'customer-capability-secret' }
  }]);
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  try {
    await getMyRiderDetails({ user: { _id: 'rider-1', role: 'delivery_rider' }, params: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.recentFeedback[0].deliveryReference, 'delivery-1');
    assert.equal(res.body.recentFeedback[0].comment, 'Careful delivery');
    assert.doesNotMatch(JSON.stringify(res.body), /customer-capability-secret|trackingToken|riderToken|pickupSession|checkoutUrl|paymentId/);
  } finally {
    User.findOne = originals.userFindOne;
    Delivery.find = originals.deliveryFind;
    RiderEarning.find = originals.earningFind;
    RiderPayout.find = originals.payoutFind;
    Review.aggregate = originals.reviewAggregate;
    Review.find = originals.reviewFind;
  }
});

test('pickup confirmation accepts only the existing paid ready-for-pickup customer lifecycle', () => {
  const valid = { customer: 'customer-1', deliveryMethod: 'pickup', paymentStatus: 'paid', status: 'ready_for_pickup' };
  assert.equal(validatePickupEligibility(valid, 'customer-1'), true);
  assert.throws(() => validatePickupEligibility({ ...valid, customer: 'customer-2' }, 'customer-1'), /Only the buyer/);
  assert.throws(() => validatePickupEligibility({ ...valid, deliveryMethod: 'delivery' }, 'customer-1'), /authenticated Delivery Rider workflow/);
  assert.throws(() => validatePickupEligibility({ ...valid, paymentStatus: 'pending' }, 'customer-1'), /must be paid/);
  for (const status of ['pending_payment', 'paid', 'awaiting_confirmation', 'confirmed', 'preparing', 'cancelled']) {
    assert.throws(() => validatePickupEligibility({ ...valid, status }, 'customer-1'), /not eligible/);
  }
  for (const status of ['delivered', 'completed']) {
    assert.throws(() => validatePickupEligibility({ ...valid, status }, 'customer-1'), /already been confirmed/);
  }
});

test('server-side reassignment revokes every previous-rider socket from the delivery room', async () => {
  const leaves = [];
  const sockets = [
    { leave: async room => leaves.push(['socket-a', room]) },
    { leave: async room => leaves.push(['socket-b', room]) }
  ];
  const io = {
    in: room => {
      assert.equal(room, 'user_rider-a');
      return { fetchSockets: async () => sockets };
    }
  };
  assert.equal(await revokeDeliveryRoomForUser(io, 'delivery-1', 'rider-a'), true);
  assert.deepEqual(leaves, [
    ['socket-a', 'delivery_delivery-1'],
    ['socket-b', 'delivery_delivery-1']
  ]);
  const controller = source('controllers/deliveryController.js');
  assert.match(controller, /revokeDeliveryRoomForUser\(io, delivery\._id, result\.previousRiderId\)/);
  assert.match(controller, /emitAuthorizedDeliveryEvent/);
});

test('legacy Order status endpoints cannot own Delivery lifecycle transitions', () => {
  const orderController = source('controllers/orderController.js');
  const deliveryService = source('services/deliveryAssignmentService.js');
  assert.match(orderController, /DELIVERY_CONTROLLED_ORDER_STATUSES/);
  assert.match(orderController, /controlled by the authenticated Delivery Rider workflow/);
  assert.match(deliveryService, /Home delivery completion must be confirmed through the authenticated Delivery Rider workflow/);
  assert.match(orderController, /cancelOrderDelivery\(\{ orderId: order\._id, actorId: req\.user\._id \}\)/);
  assert.doesNotMatch(orderController, /const stockWasDeducted/);
  assert.doesNotMatch(orderController, /Voucher\.findByIdAndUpdate\(order\.voucher/);
  assert.match(deliveryService, /cancelOrderDelivery[\s\S]*releaseRiderCapacity\(delivery, session\)/);
  assert.match(deliveryService, /cancelOrderDelivery[\s\S]*restoreOrderResources\(order, session\)/);
  assert.match(deliveryService, /delivery\.status = 'cancelled'/);
  assert.match(deliveryService, /status: 'cancelled'/);
  assert.match(deliveryService, /withTransaction/);
  assert.match(deliveryService, /completePickupOrder[\s\S]*status: 'ready_for_pickup'[\s\S]*payoutStatus: 'released'/);
});

test('booking and Order assignment controls mirror authoritative eligibility', () => {
  const bookings = source('client/src/pages/admin/BookingsManagement.js');
  const order = source('client/src/pages/customer/OrderDetail.js');
  assert.match(bookings, /selectedBooking\.paymentStatus === 'paid'/);
  assert.match(bookings, /\['confirmed', 'approved', 'processing'\]\.includes\(selectedBooking\.status\)/);
  assert.match(bookings, /reassign: Boolean\(deliveryAssignment\)/);
  assert.match(order, /\['ready_for_pickup', 'rider_assigned'\]\.includes\(order\.status\)/);
});
