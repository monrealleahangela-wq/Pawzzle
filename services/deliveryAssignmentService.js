const mongoose = require('mongoose');
const Delivery = require('../models/Delivery');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Product = require('../models/Product');
const Store = require('../models/Store');
const Voucher = require('../models/Voucher');
const StockSyncService = require('./stockSyncService');
const RevenueService = require('./revenueService');
const { finalizePetReservation, releasePetReservation } = require('./petAvailabilityService');

const ACTIVE_ASSIGNMENT_STATUSES = ['pending', 'unassigned', 'assigned', 'accepted'];
const ASSIGNABLE_ORDER_STATUSES = ['ready_for_pickup', 'rider_assigned'];
const ASSIGNABLE_BOOKING_STATUSES = ['confirmed', 'approved', 'processing'];

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

const validateAssignmentSource = ({ source, orderId, bookingId }) => {
  if (orderId) {
    if (source.deliveryMethod !== 'delivery') throw fail('Only delivery orders can be assigned to a rider.', 409);
    if (!ASSIGNABLE_ORDER_STATUSES.includes(source.status)) {
      throw fail(`Order status ${source.status} is not eligible for rider assignment.`, 409);
    }
    return true;
  }
  if (bookingId) {
    if (!source.isHomeService) throw fail('Only home-service bookings can be assigned to a rider.', 409);
    if (source.paymentStatus !== 'paid') throw fail('The booking must be paid before rider assignment.', 409);
    if (!ASSIGNABLE_BOOKING_STATUSES.includes(source.status)) {
      throw fail(`Booking status ${source.status} is not eligible for rider assignment.`, 409);
    }
    return true;
  }
  throw fail('Order ID or Booking ID is required.');
};

const isAvailableNow = (rider, now = new Date()) => {
  const profile = rider.professionalProfile || {};
  if (profile.emergencyUnavailable?.active) return false;
  if (profile.temporaryUnavailable?.active
    && (!profile.temporaryUnavailable.until || new Date(profile.temporaryUnavailable.until) >= now)) return false;
  if ((profile.leaveSchedule || []).some(leave => new Date(leave.startDate) <= now
    && new Date(leave.endDate).setHours(23, 59, 59, 999) >= now)) return false;
  const day = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const schedule = profile.availability?.[day];
  const configured = Object.values(profile.availability || {}).some(value => value?.available);
  if (!configured) return true;
  if (!schedule?.available) return false;
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (schedule.start && time < schedule.start) return false;
  if (schedule.end && time >= schedule.end) return false;
  return !(schedule.breaks || []).some(item => item.start <= time && time < item.end);
};

const normalizeParcel = (source, input = {}) => {
  const weightKg = Number(input.weightKg);
  const sourceCount = source.items?.reduce((total, item) => total + Number(item.quantity || 0), 0);
  const parcelCount = sourceCount || Number(input.parcelCount || 1);
  if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 10000) {
    throw fail('Enter the measured parcel weight in kilograms before assigning a rider.');
  }
  if (!Number.isInteger(parcelCount) || parcelCount < 1 || parcelCount > 10000) {
    throw fail('Parcel count must be a whole number greater than zero.');
  }
  return { weightKg: Math.round(weightKg * 1000) / 1000, parcelCount };
};

const riderSort = (left, right) => {
  const ratio = rider => Math.max(
    Number(rider.riderProfile?.currentLoad?.weightKg || 0) / Number(rider.riderProfile?.vehicleCapacity?.maxWeightKg || 1),
    Number(rider.riderProfile?.currentLoad?.parcelCount || 0) / Number(rider.riderProfile?.vehicleCapacity?.maxParcelCount || 1)
  );
  return ratio(left) - ratio(right)
    || Number(left.activeDeliveryCount || 0) - Number(right.activeDeliveryCount || 0)
    || new Date(left.riderProfile?.lastAssignedAt || 0) - new Date(right.riderProfile?.lastAssignedAt || 0)
    || String(left._id).localeCompare(String(right._id));
};

const releaseRiderCapacity = async (delivery, session) => {
  const reservation = delivery.capacityReservation;
  if (!reservation?.rider || reservation.releasedAt) return false;
  const weightKg = Number(reservation.weightKg || 0);
  const parcelCount = Number(reservation.parcelCount || 0);
  const rider = await User.findOneAndUpdate({
    _id: reservation.rider,
    'riderProfile.currentLoad.weightKg': { $gte: weightKg },
    'riderProfile.currentLoad.parcelCount': { $gte: parcelCount }
  }, {
    $inc: {
      'riderProfile.currentLoad.weightKg': -weightKg,
      'riderProfile.currentLoad.parcelCount': -parcelCount
    }
  }, { session, new: true });
  if (!rider) throw fail('Rider capacity state changed. Retry the operation.', 409);
  reservation.releasedAt = new Date();
  return true;
};

const CANCELLATION_STOCK_DEDUCTED_STATUSES = [
  'confirmed', 'preparing', 'ready_for_pickup', 'rider_assigned',
  'picked_up', 'in_transit', 'delivery_failed', 'delivered'
];
const CUSTOMER_CANCELLATION_BLOCKED_STATUSES = [
  'confirmed', 'processing', 'shipped', 'picked_up', 'in_transit', 'delivered',
  'completed', 'delivery_failed', 'refunded', 'returned'
];
const CANCELLABLE_DELIVERY_STATUSES = ['pending', 'unassigned', 'assigned', 'accepted'];

const validatePickupEligibility = (order, customerId) => {
  if (String(order.customer) !== String(customerId)) {
    throw fail('Access denied. Only the buyer can confirm receipt.', 403);
  }
  if (order.deliveryMethod === 'delivery') {
    throw fail('Home delivery completion must be confirmed through the authenticated Delivery Rider workflow.', 409);
  }
  if (order.paymentStatus !== 'paid') throw fail('Order must be paid before confirming pickup.', 400);
  if (['delivered', 'completed'].includes(order.status)) {
    throw fail('Pickup has already been confirmed.', 409);
  }
  if (order.status !== 'ready_for_pickup') {
    throw fail(`Order status ${order.status} is not eligible for pickup confirmation.`, 409);
  }
  return true;
};

const restoreOrderResources = async (order, session) => {
  const restoreStock = CANCELLATION_STOCK_DEDUCTED_STATUSES.includes(order.status);
  for (const item of order.items) {
    if (item.itemType === 'product' && restoreStock) {
      const product = await Product.findById(item.itemId).session(session);
      if (!product) continue;
      const sellerStore = await Store.findOne({ owner: product.addedBy }).select('_id').session(session);
      if (sellerStore) {
        await StockSyncService.addStockOnRestock(item.itemId, item.quantity, sellerStore._id, { session });
      } else {
        await Product.updateOne({ _id: product._id }, { $inc: { stockQuantity: item.quantity } }, { session });
      }
    } else if (item.itemType === 'pet') {
      await releasePetReservation({
        petId: item.itemId,
        source: 'order',
        referenceId: order._id,
        session
      });
    }
  }

  if (order.voucher) {
    await Voucher.updateOne(
      { _id: order.voucher, usedCount: { $gt: 0 } },
      { $inc: { usedCount: -1 } },
      { session }
    );
  }
};

const cancelOrderDelivery = async ({ orderId, actorId, session: callerSession }) => {
  let outcome;
  const execute = async session => {
    const order = await Order.findById(orderId).session(session);
    if (!order) throw fail('Order not found.', 404);
    if (order.status === 'cancelled') {
      outcome = { changed: false, orderId: order._id, deliveryId: order.delivery };
      return;
    }
    if (order.paymentStatus === 'paid') throw fail('A paid order must be refunded through PayMongo before cancellation.', 409);
    if (CUSTOMER_CANCELLATION_BLOCKED_STATUSES.includes(order.status)) {
      throw fail('Order cannot be cancelled once confirmed or processed.', 400);
    }

    const delivery = await Delivery.findOne({ order: order._id }).session(session);
    if (delivery && (!delivery.isLive || !CANCELLABLE_DELIVERY_STATUSES.includes(delivery.status))) {
      throw fail('This delivery can no longer be cancelled through the Order workflow.', 409);
    }

    const now = new Date();
    const claimed = await Order.findOneAndUpdate({
      _id: order._id,
      status: order.status,
      paymentStatus: { $ne: 'paid' }
    }, {
      $set: { status: 'cancelled', updatedAt: now },
      $push: {
        fulfillmentTimeline: {
          status: 'cancelled',
          timestamp: now,
          actor: actorId,
          description: delivery
            ? 'Order and assigned Delivery were cancelled together before rider pickup.'
            : 'Order was cancelled before fulfillment.'
        }
      }
    }, { new: true, session });
    if (!claimed) throw fail('Order state changed. Refresh and try again.', 409);

    await restoreOrderResources(order, session);

    if (delivery) {
      await releaseRiderCapacity(delivery, session);
      delivery.status = 'cancelled';
      delivery.isLive = false;
      delivery.statusHistory.push({ status: 'cancelled', timestamp: now, notes: 'Linked Order was cancelled before rider pickup.' });
      await delivery.save({ session });
    }

    outcome = {
      changed: true,
      orderId: claimed._id,
      deliveryId: delivery?._id,
      riderId: delivery?.assignedRider,
      storeId: delivery?.store
    };
  };

  let ownedSession;
  try {
    if (callerSession) await execute(callerSession);
    else {
      ownedSession = await mongoose.startSession();
      await ownedSession.withTransaction(() => execute(ownedSession));
    }
  } finally {
    if (ownedSession) await ownedSession.endSession();
  }
  if (callerSession) return outcome;
  const [order, delivery] = await Promise.all([
    Order.findById(outcome.orderId),
    outcome.deliveryId ? Delivery.findById(outcome.deliveryId) : null
  ]);
  return { ...outcome, order, delivery };
};

const completePickupOrder = async ({ orderId, customerId, session: callerSession }) => {
  let outcome;
  const execute = async session => {
    const order = await Order.findById(orderId).session(session);
    if (!order) throw fail('Order not found.', 404);
    validatePickupEligibility(order, customerId);

    const now = new Date();
    const totals = RevenueService.totalsFor(order, 'order');
    const shouldRecordRevenue = order.isRevenueRecorded !== true;
    const claimed = await Order.findOneAndUpdate({
      _id: order._id,
      customer: customerId,
      deliveryMethod: 'pickup',
      paymentStatus: 'paid',
      status: 'ready_for_pickup',
      payoutStatus: { $ne: 'released' }
    }, {
      $set: {
        status: 'delivered',
        deliveryDate: now,
        payoutStatus: 'released',
        'pickupSession.verifiedAt': now,
        platformCommission: totals.platformFee,
        platformFee: totals.platformFee,
        netAmount: totals.netAmount,
        updatedAt: now,
        ...(shouldRecordRevenue ? { isRevenueRecorded: true } : {})
      },
      $push: {
        fulfillmentTimeline: {
          status: 'delivered',
          timestamp: now,
          actor: customerId,
          description: 'Customer confirmed pickup and receipt.'
        }
      }
    }, { new: true, session });
    if (!claimed) throw fail('Order state changed. Refresh and try again.', 409);

    for (const item of order.items) {
      if (item.itemType !== 'pet') continue;
      const soldPet = await finalizePetReservation({
        petId: item.itemId,
        source: 'order',
        referenceId: order._id,
        status: 'sold',
        session
      });
      if (!soldPet) throw fail(`Pet "${item.name}" is not reserved for this order.`, 409);
    }

    if (shouldRecordRevenue) {
      const store = await Store.findOneAndUpdate({ _id: order.store }, {
        $inc: {
          balance: totals.netAmount,
          'stats.totalRevenue': totals.recognizedRevenue,
          'stats.totalPlatformFees': totals.platformFee
        }
      }, { new: true, session });
      if (!store) throw fail('The seller Store no longer exists.', 409);
    }

    outcome = { changed: true, orderId: claimed._id, netPayout: totals.netAmount };
  };

  let ownedSession;
  try {
    if (callerSession) await execute(callerSession);
    else {
      ownedSession = await mongoose.startSession();
      await ownedSession.withTransaction(() => execute(ownedSession));
    }
  } finally {
    if (ownedSession) await ownedSession.endSession();
  }
  if (callerSession) return outcome;
  return { ...outcome, order: await Order.findById(outcome.orderId) };
};

const assignDelivery = async ({ orderId, bookingId, parcel: parcelInput, actorId, reassign = false }) => {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const source = orderId
        ? await Order.findById(orderId).session(session)
        : await Booking.findById(bookingId).session(session);
      if (!source) throw fail('Order or Booking not found.', 404);
      const query = orderId ? { order: source._id } : { booking: source._id };
      let delivery = await Delivery.findOne(query).session(session);
      validateAssignmentSource({ source, orderId, bookingId });
      if (delivery?.assignmentType === 'internal' && delivery.assignedRider && !reassign) {
        if (bookingId && String(source.delivery || '') !== String(delivery._id)) {
          const linked = await Booking.updateOne({
            _id: source._id,
            status: source.status,
            paymentStatus: 'paid',
            isHomeService: true
          }, { $set: { delivery: delivery._id } }, { session });
          if (!linked.matchedCount) throw fail('Booking state changed. Refresh and try again.', 409);
        }
        result = { deliveryId: delivery._id, riderId: delivery.assignedRider, assignmentChanged: false, sourceId: source._id };
        return;
      }
      if (delivery && !ACTIVE_ASSIGNMENT_STATUSES.includes(delivery.status)) {
        throw fail('An in-progress delivery cannot be reassigned.', 409);
      }
      const parcel = normalizeParcel(source, parcelInput);
      const previousRider = delivery?.assignedRider || null;
      if (delivery && previousRider) await releaseRiderCapacity(delivery, session);

      const riders = await User.find({
        store: source.store,
        $or: [{ role: 'delivery_rider' }, { role: 'staff', staffType: 'delivery_rider' }],
        isActive: true,
        isDeleted: false,
        staffStatus: 'active',
        'riderProfile.accountStatus': 'active',
        'riderProfile.vehicleCapacity.maxWeightKg': { $gte: parcel.weightKg },
        'riderProfile.vehicleCapacity.maxParcelCount': { $gte: parcel.parcelCount },
        ...(reassign && previousRider ? { _id: { $ne: previousRider } } : {})
      }).session(session).lean();
      const available = riders.filter(rider => isAvailableNow(rider)).sort(riderSort);
      let selected;
      for (const candidate of available) {
        selected = await User.findOneAndUpdate({
          _id: candidate._id,
          $expr: {
            $and: [
              { $lte: [{ $add: [{ $ifNull: ['$riderProfile.currentLoad.weightKg', 0] }, parcel.weightKg] }, '$riderProfile.vehicleCapacity.maxWeightKg'] },
              { $lte: [{ $add: [{ $ifNull: ['$riderProfile.currentLoad.parcelCount', 0] }, parcel.parcelCount] }, '$riderProfile.vehicleCapacity.maxParcelCount'] }
            ]
          }
        }, {
          $inc: {
            'riderProfile.currentLoad.weightKg': parcel.weightKg,
            'riderProfile.currentLoad.parcelCount': parcel.parcelCount
          },
          $set: { 'riderProfile.lastAssignedAt': new Date() }
        }, { session, new: true });
        if (selected) break;
      }
      if (!selected) throw fail('No available Delivery Rider has enough remaining vehicle capacity for this parcel.', 409);

      const now = new Date();
      if (!delivery) {
        [delivery] = await Delivery.create([{
          store: source.store,
          order: orderId || null,
          booking: bookingId || null,
          status: 'assigned',
          assignmentType: 'internal',
          assignedRider: selected._id,
          assignedBy: actorId,
          assignedAt: now,
          parcel: { ...parcel, recordedAt: now, recordedBy: actorId },
          capacityReservation: { rider: selected._id, ...parcel, reservedAt: now },
          assignmentHistory: [{ assignmentType: 'internal', rider: selected._id, assignedBy: actorId, assignedAt: now }],
          statusHistory: [{ status: 'assigned', timestamp: now, notes: 'System assigned an available internal rider by vehicle capacity.' }]
        }], { session });
      } else {
        const activeHistory = delivery.assignmentHistory?.find(entry => !entry.endedAt);
        if (activeHistory) activeHistory.endedAt = now;
        delivery.status = 'assigned';
        delivery.assignmentType = 'internal';
        delivery.assignedRider = selected._id;
        delivery.assignedBy = actorId;
        delivery.assignedAt = now;
        delivery.parcel = { ...parcel, recordedAt: now, recordedBy: actorId };
        delivery.capacityReservation = { rider: selected._id, ...parcel, reservedAt: now };
        delivery.assignmentHistory.push({ assignmentType: 'internal', rider: selected._id, assignedBy: actorId, assignedAt: now });
        delivery.statusHistory.push({ status: 'assigned', timestamp: now, notes: 'System assigned an available internal rider by vehicle capacity.' });
        await delivery.save({ session });
      }
      if (orderId) {
        const linked = await Order.updateOne({ _id: source._id, status: source.status, deliveryMethod: 'delivery' }, {
          $set: { delivery: delivery._id, status: 'rider_assigned' },
          $push: { fulfillmentTimeline: { status: 'rider_assigned', timestamp: now, actor: actorId, description: 'An internal Delivery Rider was assigned automatically.' } }
        }, { session });
        if (!linked.matchedCount) throw fail('Order state changed. Refresh and try again.', 409);
      } else {
        const linked = await Booking.updateOne({
          _id: source._id,
          status: source.status,
          paymentStatus: 'paid',
          isHomeService: true
        }, { $set: { delivery: delivery._id } }, { session });
        if (!linked.matchedCount) throw fail('Booking state changed. Refresh and try again.', 409);
      }
      result = { deliveryId: delivery._id, riderId: selected._id, previousRiderId: previousRider, assignmentChanged: true, sourceId: source._id };
    });
  } finally {
    await session.endSession();
  }
  const [delivery, rider] = await Promise.all([
    Delivery.findById(result.deliveryId),
    User.findById(result.riderId).select('_id firstName lastName phone riderProfile')
  ]);
  return { ...result, delivery, rider };
};

module.exports = {
  assignDelivery,
  cancelOrderDelivery,
  completePickupOrder,
  releaseRiderCapacity,
  isAvailableNow,
  normalizeParcel,
  validateAssignmentSource,
  validatePickupEligibility,
  ASSIGNABLE_ORDER_STATUSES,
  ASSIGNABLE_BOOKING_STATUSES
};
