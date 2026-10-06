const Delivery = require('../models/Delivery');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const crypto = require('crypto');
const DeliveryFeeService = require('../services/deliveryFeeService');
const resolveStore = require('../utils/resolveStore');
const User = require('../models/User');
const RiderEarning = require('../models/RiderEarning');
const { isPlatformAdmin } = require('../config/permissions');
const { canOperateStore } = require('../utils/authorizationPolicy');
const { assignDelivery, releaseRiderCapacity } = require('../services/deliveryAssignmentService');
const { riderDeliveryView } = require('../utils/deliveryViews');
const { emitAuthorizedDeliveryEvent, revokeDeliveryRoomForUser } = require('../services/socketAuthorization');
const {
  REPORTABLE_DELIVERY_STATUSES,
  isDeliveryConcernReportable,
  validateDeliveryConcern
} = require('../utils/deliveryConcerns');
const mongoose = require('mongoose');

const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
let CLIENT_URL = process.env.CLIENT_URL;
if (!CLIENT_URL || CLIENT_URL.includes('localhost')) {
    CLIENT_URL = isProduction ? 'https://pawzzle.io' : 'http://localhost:3000';
}

const PROOF_METHODS = new Set(['photo', 'qr', 'otp', 'signature', 'notes']);
const COD_PAYMENT_STATUSES = new Set(['cash_received', 'digital_received', 'not_received']);

const activeDeliveryView = delivery => {
  const payload = delivery?.toObject ? delivery.toObject() : { ...delivery };
  payload.concernReporting = {
    allowed: isDeliveryConcernReportable(payload.status),
    reason: isDeliveryConcernReportable(payload.status) ? null : 'rider_pickup_required'
  };
  delete payload.riderToken;
  delete payload.isRiderVerified;
  delete payload.thirdPartyRider;
  delete payload.providerDelivery;
  if (payload.assignmentHistory) {
    payload.assignmentHistory = payload.assignmentHistory.filter(entry => entry.assignmentType === 'internal');
  }
  return payload;
};

const buildProofOfDelivery = (input = {}, delivery, isCod = false) => {
  const photo = String(input.photo || '').trim();
  const signature = String(input.signature || '').trim();
  const otp = String(input.otp || '').trim();
  const notes = String(input.notes || '').trim();
  if (!photo && !signature && !notes && !otp) {
    throw Object.assign(new Error('Add a photo, signature, OTP, or delivery notes as proof.'), { statusCode: 400 });
  }

  const codPaymentStatus = String(input.codPaymentStatus || '').trim();
  if (codPaymentStatus && !COD_PAYMENT_STATUSES.has(codPaymentStatus)) {
    throw Object.assign(new Error('Select a valid COD payment status.'), { statusCode: 400 });
  }
  if (isCod && !codPaymentStatus) {
    throw Object.assign(new Error('Record the COD payment status before completing delivery.'), { statusCode: 400 });
  }

  const method = otp ? 'otp' : (input.method || (photo ? 'photo' : signature ? 'signature' : 'notes'));
  if (!PROOF_METHODS.has(method)) {
    throw Object.assign(new Error('Select a valid proof-of-delivery method.'), { statusCode: 400 });
  }

  return {
    photo: photo || undefined,
    signature: signature || undefined,
    method,
    otpVerified: false,
    notes: notes || undefined,
    location: input.location,
    riderId: delivery.assignedRider || undefined,
    riderName: delivery.riderName,
    timestamp: new Date(),
    ...(codPaymentStatus ? { codPaymentStatus } : {})
  };
};

const notifyDeliveryParties = async (req, delivery, title, message) => {
  try {
    const source = delivery.order
      ? await Order.findById(delivery.order).select('customer store').populate('store', 'owner')
      : await Booking.findById(delivery.booking).select('customer store').populate('store', 'owner');
    const recipients = [source?.customer, source?.store?.owner].filter(Boolean);
    const io = req.app.get('socketio');
    for (const recipient of new Map(recipients.map(id => [id.toString(), id])).values()) {
      const notification = await Notification.create({
        recipient,
        sender: delivery.assignedRider || undefined,
        type: 'delivery_update',
        title,
        message,
        relatedId: delivery._id,
        relatedModel: 'Delivery',
        targetUrl: recipient.toString() === source?.customer?.toString()
          ? `/track/${delivery.trackingToken}`
          : `/admin/logistics/${delivery._id}`
      });
      if (io) io.to(`user_${recipient}`).emit('newNotification', notification);
    }
  } catch (error) {
    console.error('Delivery notification error:', error.message);
  }
};

const emitDeliveryDashboardUpdate = (req, delivery) => {
  const io = req.app.get('socketio');
  if (!io) return;
  const payload = { type: 'delivery', id: String(delivery._id), status: delivery.status, timestamp: new Date() };
  if (delivery.store) io.to(`store_${String(delivery.store)}`).emit('dashboardUpdate', payload);
  io.to('admin_global').emit('dashboardUpdate', payload);
};

const emitAuthoritativeDeliveryUpdate = async (req, delivery, source) => {
  const io = req.app.get('socketio');
  if (!io) return;
  const payload = { deliveryId: String(delivery._id), status: delivery.status, assignmentType: delivery.assignmentType, assignedRider: delivery.assignedRider, timestamp: new Date() };
  await emitAuthorizedDeliveryEvent(io, delivery._id, 'deliveryUpdate', payload);
  if (delivery.store) io.to(`store_${delivery.store}`).emit('deliveryUpdate', payload);
  if (delivery.assignedRider) io.to(`user_${delivery.assignedRider}`).emit('deliveryUpdate', payload);
  if (source?.customer) io.to(`user_${source.customer}`).emit('deliveryUpdate', payload);
  if (!source?.customer && (delivery.order || delivery.booking)) {
    const model = delivery.order ? Order : Booking;
    model.findById(delivery.order || delivery.booking).select('customer').lean()
      .then(row => row?.customer && io.to(`user_${row.customer}`).emit('deliveryUpdate', payload))
      .catch(error => console.error('Delivery realtime recipient lookup error:', error.message));
  }
};

const isDeliveryRider = user => user?.role === 'delivery_rider'
  || (user?.role === 'staff' && user?.staffType === 'delivery_rider');

const assignedRiderQuery = req => ({
  _id: req.params.deliveryId,
  assignmentType: 'internal',
  assignedRider: req.user._id
});

const assignDeliveryAutomatically = async (req, res) => {
  try {
    const { orderId, bookingId, parcel, reassign } = req.body;
    if (!orderId && !bookingId) return res.status(400).json({ message: 'Order ID or Booking ID is required.' });
    const source = orderId
      ? await Order.findById(orderId).select('store customer orderNumber')
      : await Booking.findById(bookingId).select('store customer');
    if (!source) return res.status(404).json({ message: 'Order or Booking not found.' });
    if (!isPlatformAdmin(req.user) && !(await canOperateStore(req.user, source.store, ['logistics.manage']))) {
      return res.status(403).json({ message: 'You cannot assign deliveries for this store.' });
    }
    const result = await assignDelivery({ orderId, bookingId, parcel, actorId: req.user._id, reassign: Boolean(reassign) });
    const { delivery, rider } = result;
    const io = req.app.get('socketio');
    if (result.previousRiderId && String(result.previousRiderId) !== String(rider._id)) {
      await revokeDeliveryRoomForUser(io, delivery._id, result.previousRiderId);
    }
    if (result.assignmentChanged) {
      const notifications = [];
      if (result.previousRiderId && String(result.previousRiderId) !== String(rider._id)) notifications.push(Notification.create({
        recipient: result.previousRiderId, sender: req.user._id, type: 'delivery_update', title: 'Delivery Assignment Changed',
        message: `${source.orderNumber || 'A delivery'} is no longer in your active workload.`, relatedId: delivery._id,
        relatedModel: 'Delivery', targetUrl: '/admin/dashboard'
      }).then(notification => io?.to(`user_${result.previousRiderId}`).emit('newNotification', notification)));
      notifications.push(Notification.create({
        recipient: rider._id, sender: req.user._id, type: 'delivery_update', title: 'New Delivery Assignment',
        message: `${source.orderNumber || 'A delivery'} is ready in your Rider Dashboard.`, relatedId: delivery._id,
        relatedModel: 'Delivery', targetUrl: `/rider/deliveries/${delivery._id}`
      }).then(notification => io?.to(`user_${rider._id}`).emit('newNotification', notification)));
      if (source.customer) notifications.push(Notification.create({
        recipient: source.customer, sender: req.user._id, type: 'delivery_update', title: 'Rider Assigned',
        message: 'An internal Pawzzle rider has been assigned. Live tracking is available.', relatedId: delivery._id,
        relatedModel: 'Delivery', targetUrl: `/track/${delivery.trackingToken}`
      }).then(notification => io?.to(`user_${source.customer}`).emit('newNotification', notification)));
      const outcomes = await Promise.allSettled(notifications);
      outcomes.filter(item => item.status === 'rejected').forEach(item => console.error('Delivery notification error:', item.reason?.message));
    }
    await emitAuthoritativeDeliveryUpdate(req, delivery, source);
    emitDeliveryDashboardUpdate(req, delivery);
    res.status(result.assignmentChanged ? 201 : 200).json({
      message: result.assignmentChanged ? 'Delivery Rider assigned automatically.' : 'Delivery already has an active rider assignment.',
      customerLink: `${CLIENT_URL}/track/${delivery.trackingToken}`,
      delivery: activeDeliveryView(delivery), assignedRider: rider
    });
  } catch (error) {
    console.error('Automatic rider assignment error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Unable to assign a Delivery Rider.' });
  }
};

const getAssignedRiderDelivery = async (req, res) => {
  try {
    if (!isDeliveryRider(req.user)) return res.status(403).json({ message: 'Delivery Rider access only.' });
    const delivery = await Delivery.findOne(assignedRiderQuery(req))
      .populate({ path: 'order', populate: [{ path: 'customer', select: 'firstName lastName phone' }, { path: 'store', select: 'name contactInfo address' }] })
      .populate({ path: 'booking', populate: [{ path: 'customer', select: 'firstName lastName phone' }, { path: 'store', select: 'name contactInfo address' }, { path: 'service', select: 'name duration' }] })
      .populate('assignedRider', 'firstName lastName phone riderProfile');
    if (!delivery) return res.status(404).json({ message: 'Assigned delivery not found.' });
    res.json({ delivery: riderDeliveryView(delivery), role: 'rider' });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load the assigned delivery.' });
  }
};

// Internal: Create delivery record and link to order/booking
const internalCreateDelivery = async ({ orderId, bookingId, assignedRider, assignedBy }) => {
  const query = orderId ? { order: orderId } : { booking: bookingId };
  let delivery = await Delivery.findOne(query);
  const hasNewAssignment = Boolean(assignedRider);
  
  if (delivery) {
    if (!delivery.store) {
      const existingSource = orderId ? await Order.findById(orderId).select('store') : await Booking.findById(bookingId).select('store');
      if (existingSource?.store) delivery.store = existingSource.store;
    }
    const sameInternal = delivery.assignmentType === 'internal' && delivery.assignedRider?.toString() === assignedRider?.toString();
    if (hasNewAssignment && !sameInternal) {
      if (!['pending', 'unassigned', 'assigned', 'accepted'].includes(delivery.status)) {
        const error = new Error('An in-progress delivery cannot be reassigned.'); error.statusCode = 409; throw error;
      }
      const now = new Date();
      const activeHistory = delivery.assignmentHistory?.find(entry => !entry.endedAt);
      if (activeHistory) activeHistory.endedAt = now;
      delivery.assignmentType = 'internal';
      delivery.assignedRider = assignedRider;
      delivery.assignedBy = assignedBy;
      delivery.assignedAt = now;
      delivery.riderToken = crypto.randomBytes(32).toString('hex');
      delivery.riderName = undefined; delivery.riderPhone = undefined; delivery.riderVehicleInfo = undefined;
      delivery.status = 'assigned';
      delivery.assignmentHistory.push({ assignmentType: 'internal', rider: assignedRider, assignedBy, assignedAt: now });
      delivery.statusHistory.push({ status: delivery.status, timestamp: delivery.assignedAt, notes: 'Assigned to Internal Delivery Rider' });
      await delivery.save();
    }
    if (delivery.isModified()) await delivery.save();
    return delivery;
  }

  const order = orderId ? await Order.findById(orderId) : null;
  const booking = bookingId ? await Booking.findById(bookingId) : null;
  
  if (!order && !booking) return null;

  delivery = new Delivery({
    store: order?.store || booking?.store || null,
    order: orderId || null,
    booking: bookingId || null,
    riderToken: crypto.randomBytes(32).toString('hex'),
    trackingToken: crypto.randomBytes(32).toString('hex'),
    assignmentType: hasNewAssignment ? 'internal' : 'unassigned',
    assignedRider: assignedRider || null,
    assignedBy: assignedBy || null,
    assignedAt: hasNewAssignment ? new Date() : null,
    status: hasNewAssignment ? 'assigned' : 'pending',
    assignmentHistory: hasNewAssignment ? [{ assignmentType: 'internal', rider: assignedRider, assignedBy, assignedAt: new Date() }] : [],
    statusHistory: [{ status: hasNewAssignment ? 'assigned' : 'pending', timestamp: new Date(), notes: hasNewAssignment ? 'Created and assigned to Internal Delivery Rider' : 'Delivery created' }]
  });

  if (order?.deliveryFeeCalculation) {
    const fee = order.deliveryFeeCalculation;
    delivery.feeCalculation = {
      distanceKm: fee.distanceKm,
      distanceMethod: fee.distanceMethod,
      ruleId: fee.rule?.id,
      ruleName: fee.rule?.name,
      ruleVersion: fee.rule?.version,
      breakdown: fee.breakdown,
      totalFee: order.shippingFee || 0,
      calculatedAt: fee.calculatedAt
    };
  }

  await delivery.save();

  if (order) {
    order.delivery = delivery._id;
    await order.save();
  }
  
  return delivery;
};

// Public: customer tracking uses the non-mutating tracking capability only.
const getDeliveryByToken = async (req, res) => {
  try {
    const { token } = req.params;
    
    const delivery = await Delivery.findOne({ trackingToken: token })
        .populate({
          path: 'order',
          select: 'orderNumber trackingNumber customer store shippingAddress paymentMethod totalAmount items notes status paymentStatus',
          populate: [
            { path: 'customer', select: 'firstName lastName phone' },
            { path: 'store', select: 'name contactInfo' }
          ]
        })
        .populate({
          path: 'booking',
          select: 'customer store service serviceAddress notes status paymentStatus totalPrice',
          populate: [
            { path: 'customer', select: 'firstName lastName phone' },
            { path: 'store', select: 'name contactInfo' },
            { path: 'service', select: 'name duration' }
          ]
        })
        .populate('assignedRider', 'firstName lastName phone riderProfile.vehicleType riderProfile.plateNumber');

    if (!delivery) {
      return res.status(404).json({ message: 'Secure tracking link invalid or expired' });
    }

    if (!delivery.trackingLinkOpenedAt) delivery.trackingLinkOpenedAt = new Date();
    if (delivery.isModified()) await delivery.save();

    const safeDelivery = activeDeliveryView(delivery);
    delete safeDelivery.assignmentHistory;
    delete safeDelivery.assignedBy;
    delete safeDelivery.capacityReservation;
    delete safeDelivery.riderToken;
    res.json({ delivery: safeDelivery, role: 'customer' });
  } catch (error) {
    console.error('Error fetching delivery:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Private: Get delivery metadata by Order ID (Regular portal access)
const getDeliveryByOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).select('customer store');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const allowed = isPlatformAdmin(req.user)
      || order.customer?.toString() === req.user._id.toString()
      || await canOperateStore(req.user, order.store, ['logistics.manage', 'deliveries.own']);
    if (!allowed) return res.status(403).json({ message: 'Access denied to this delivery.' });
    const delivery = await Delivery.findOne({ order: orderId }).select('trackingToken status isLive assignmentType assignedRider assignedAt assignmentHistory reviewStatus parcel capacityReservation').populate('assignedRider', 'firstName lastName riderProfile.staffId riderProfile.deliveryZone riderProfile.vehicleType riderProfile.plateNumber');
    if (!delivery) return res.status(404).json({ message: 'No delivery active' });
    const payload = delivery.toObject();
    payload.concernReporting = {
      allowed: isDeliveryConcernReportable(payload.status),
      reason: isDeliveryConcernReportable(payload.status) ? null : 'rider_pickup_required'
    };
    if (req.user.role === 'customer') {
      delete payload.assignmentHistory;
      delete payload.capacityReservation;
    }
    res.json({ delivery: payload });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Private: Get delivery metadata by Booking ID (Regular portal access)
const getDeliveryByBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const booking = await Booking.findById(bookingId).select('customer store');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    const allowed = isPlatformAdmin(req.user)
      || booking.customer?.toString() === req.user._id.toString()
      || await canOperateStore(req.user, booking.store, ['logistics.manage', 'deliveries.own']);
    if (!allowed) return res.status(403).json({ message: 'Access denied to this delivery.' });
    const delivery = await Delivery.findOne({ booking: bookingId }).select('trackingToken status isLive assignmentType assignedRider assignedAt assignmentHistory reviewStatus parcel capacityReservation').populate('assignedRider', 'firstName lastName riderProfile.staffId riderProfile.deliveryZone riderProfile.vehicleType riderProfile.plateNumber');
    if (!delivery) return res.status(404).json({ message: 'No delivery active' });
    const payload = delivery.toObject();
    payload.concernReporting = {
      allowed: isDeliveryConcernReportable(payload.status),
      reason: isDeliveryConcernReportable(payload.status) ? null : 'rider_pickup_required'
    };
    if (req.user.role === 'customer') {
      delete payload.assignmentHistory;
      delete payload.capacityReservation;
    }
    res.json({ delivery: payload });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Rider: Update status (Synced with Order State Machine)
const updateDeliveryStatus = async (req, res) => {
  let session;
  try {
    const { status } = req.body;
    if (!isDeliveryRider(req.user)) return res.status(403).json({ message: 'Delivery Rider access only.' });
    const transitions = {
      pending: ['picked_up'], unassigned: ['assigned'], assigned: ['picked_up'], accepted: ['picked_up'],
      picked_up: ['in_transit'], in_transit: ['arrived'], arrived: ['failed_attempt'],
      failed_attempt: ['in_transit', 'returned_to_store']
    };
    let delivery;
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      delivery = await Delivery.findOne(assignedRiderQuery(req)).session(session);
      if (!delivery) throw Object.assign(new Error('Assigned delivery not found.'), { statusCode: 404 });
      if (!delivery.isLive) throw Object.assign(new Error('Delivery is no longer active.'), { statusCode: 409 });
      if (!transitions[delivery.status]?.includes(status)) {
        throw Object.assign(new Error(`Cannot change delivery from ${delivery.status} to ${status}.`), { statusCode: 409 });
      }

      const now = new Date();
      delivery.status = status;
      if (status === 'picked_up') delivery.pickedUpAt = now;
      if (status === 'arrived') delivery.arrivedAt = now;
      if (status === 'returned_to_store') {
        delivery.isLive = false;
        await releaseRiderCapacity(delivery, session);
      }
      delivery.statusHistory.push({ status, timestamp: now });
      await delivery.save({ session });

      if (delivery.order) {
        const orderStatus = status === 'arrived' ? 'in_transit'
          : status === 'returned_to_store' ? 'returned'
            : status;
        const orderResult = await Order.updateOne({ _id: delivery.order }, {
          $set: { status: orderStatus },
          $push: {
            fulfillmentTimeline: {
              status,
              timestamp: now,
              actor: req.user._id,
              description: `Rider updated mission status to: ${status.replace(/_/g, ' ')}`
            }
          }
        }, { session });
        if (!orderResult.matchedCount) throw Object.assign(new Error('The linked order no longer exists.'), { statusCode: 409 });
      }
    });
    
    const io = req.app.get('socketio');
    if (io) {
      await emitAuthorizedDeliveryEvent(io, delivery._id, 'statusChanged', { deliveryId: delivery._id, status: delivery.status });
    }
    await emitAuthoritativeDeliveryUpdate(req, delivery);
    emitDeliveryDashboardUpdate(req, delivery);
    
    res.json({ success: true, status: delivery.status });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Server error' });
  } finally {
    if (session) await session.endSession();
  }
};

const completeDelivery = async (req, res) => {
  try {
    if (!isDeliveryRider(req.user)) return res.status(403).json({ message: 'Delivery Rider access only.' });
    const delivery = await Delivery.findOne(assignedRiderQuery(req));
    if (!delivery) return res.status(404).json({ message: 'Assigned delivery not found.' });
    if (!delivery.isLive || delivery.status === 'delivered') return res.status(409).json({ message: 'Delivery has already been completed.' });
    if (delivery.status !== 'arrived') return res.status(400).json({ message: 'Mark the delivery as arrived before confirming completion.' });
    const { otp } = req.body;
    const order = delivery.order
      ? await Order.findById(delivery.order).select('pickupSession.code paymentMethod')
      : null;
    const isCod = ['cod', 'cash_on_delivery'].includes(order?.paymentMethod);
    let proofOfDelivery;
    try {
      proofOfDelivery = buildProofOfDelivery(req.body, delivery, isCod);
    } catch (error) {
      return res.status(error.statusCode || 400).json({ message: error.message });
    }
    let otpVerified = false;
    if (otp) {
      if (!order?.pickupSession?.code || String(order.pickupSession.code) !== String(otp).trim()) return res.status(400).json({ message: 'The delivery OTP is incorrect.' });
      otpVerified = true;
    }
    proofOfDelivery.otpVerified = otpVerified;
    delivery.proofOfDelivery = proofOfDelivery;
    delivery.status = 'delivered';
    delivery.deliveredAt = new Date();
    delivery.isLive = false;
    delivery.statusHistory.push({ status: 'delivered', timestamp: delivery.deliveredAt, notes: req.body.notes?.trim() });
    const session = await mongoose.startSession();
    let completedDelivery;
    try {
      await session.withTransaction(async () => {
        const transactional = await Delivery.findOne(assignedRiderQuery(req)).session(session);
        if (!transactional || transactional.status !== 'arrived' || !transactional.isLive) throw Object.assign(new Error('Delivery state changed. Refresh and try again.'), { statusCode: 409 });
        transactional.proofOfDelivery = delivery.proofOfDelivery;
        transactional.status = 'delivered';
        transactional.deliveredAt = delivery.deliveredAt;
        transactional.isLive = false;
        transactional.statusHistory.push({ status: 'delivered', timestamp: delivery.deliveredAt, notes: req.body.notes?.trim() });
        await releaseRiderCapacity(transactional, session);
        await transactional.save({ session });
        if (transactional.order) {
          const orderResult = await Order.updateOne({ _id: transactional.order }, {
            $set: { status: 'delivered', deliveryDate: transactional.deliveredAt },
            $push: { fulfillmentTimeline: { status: 'delivered', timestamp: transactional.deliveredAt, actor: req.user._id, description: 'Delivery completed with proof of delivery' } }
          }, { session });
          if (!orderResult.matchedCount) throw Object.assign(new Error('The linked order no longer exists.'), { statusCode: 409 });
        }
        if (transactional.assignedRider) {
          const rider = await User.findOne({
            _id: transactional.assignedRider,
            $or: [{ role: 'delivery_rider' }, { role: 'staff', staffType: 'delivery_rider' }]
          }).select('store riderProfile.earningRules').session(session);
          if (rider) {
            const rules = rider.riderProfile?.earningRules || {};
            const baseRate = Number(rules.baseRate || 0), incentive = Number(rules.incentive || 0);
            const bonus = Number(rules.bonus || 0), deduction = Number(rules.deduction || 0);
            await RiderEarning.findOneAndUpdate(
              { delivery: transactional._id },
              { $setOnInsert: { rider: rider._id, store: rider.store, delivery: transactional._id, baseRate, incentive, bonus, deduction, amount: Math.max(0, baseRate + incentive + bonus - deduction), status: 'available', earnedAt: transactional.deliveredAt } },
              { upsert: true, new: true, setDefaultsOnInsert: true, session }
            );
          }
        }
        completedDelivery = transactional;
      });
    } finally { await session.endSession(); }
    const committedDelivery = completedDelivery || delivery;
    const io = req.app.get('socketio');
    if (io) await emitAuthorizedDeliveryEvent(io, committedDelivery._id, 'statusChanged', { deliveryId: committedDelivery._id, status: 'delivered' });
    await emitAuthoritativeDeliveryUpdate(req, committedDelivery);
    emitDeliveryDashboardUpdate(req, committedDelivery);
    await notifyDeliveryParties(req, committedDelivery, 'Delivery Completed', 'The delivery was completed and proof of delivery is available.');
    res.json({ success: true, delivery: riderDeliveryView(committedDelivery) });
  } catch (error) {
    console.error('Complete delivery error:', error);
    if (error.name === 'ValidationError') {
      const firstValidationError = Object.values(error.errors || {})[0];
      return res.status(400).json({ message: firstValidationError?.message || 'The proof-of-delivery information is invalid.' });
    }
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Unable to complete delivery.' });
  }
};

const reportFailedDelivery = async (req, res) => {
  let session;
  try {
    if (!isDeliveryRider(req.user)) return res.status(403).json({ message: 'Delivery Rider access only.' });
    const { reason, notes, photo, location } = req.body;
    const reasons = ['customer_unavailable', 'cannot_contact', 'incorrect_address', 'customer_refused', 'establishment_closed', 'address_inaccessible', 'other'];
    if (!reasons.includes(reason)) return res.status(400).json({ message: 'Select a valid delivery issue reason.' });
    if (reason === 'other' && !notes?.trim()) return res.status(400).json({ message: 'Notes are required for other issues.' });
    if (location && (![location.lat, location.lng].every(Number.isFinite)
      || location.lat < -90 || location.lat > 90 || location.lng < -180 || location.lng > 180)) {
      return res.status(400).json({ message: 'The delivery-issue location is invalid.' });
    }
    let delivery;
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      delivery = await Delivery.findOne(assignedRiderQuery(req)).session(session);
      if (!delivery) throw Object.assign(new Error('Assigned delivery not found.'), { statusCode: 404 });
      if (!delivery.isLive) throw Object.assign(new Error('Delivery is no longer active.'), { statusCode: 409 });
      if (!['in_transit', 'arrived'].includes(delivery.status)) {
        throw Object.assign(new Error('A delivery issue can only be reported while travelling or after arrival.'), { statusCode: 409 });
      }
      const now = new Date();
      delivery.deliveryAttempts.push({ reason, notes: notes?.trim(), photo, location, timestamp: now });
      delivery.status = 'failed_attempt';
      delivery.statusHistory.push({ status: 'failed_attempt', timestamp: now, notes: `${reason}${notes ? `: ${notes}` : ''}` });
      await delivery.save({ session });
      if (delivery.order) {
        const orderResult = await Order.updateOne({ _id: delivery.order }, {
          $set: { status: 'delivery_failed' },
          $push: { fulfillmentTimeline: { status: 'delivery_failed', timestamp: now, actor: req.user._id, description: `Delivery attempt failed: ${reason.replace(/_/g, ' ')}` } }
        }, { session });
        if (!orderResult.matchedCount) throw Object.assign(new Error('The linked order no longer exists.'), { statusCode: 409 });
      }
    });
    const io = req.app.get('socketio');
    if (io) await emitAuthorizedDeliveryEvent(io, delivery._id, 'statusChanged', { deliveryId: delivery._id, status: 'failed_attempt' });
    await emitAuthoritativeDeliveryUpdate(req, delivery);
    emitDeliveryDashboardUpdate(req, delivery);
    await notifyDeliveryParties(req, delivery, 'Delivery Attempt Failed', `The delivery attempt failed: ${reason.replace(/_/g, ' ')}.`);
    res.json({ success: true, delivery: riderDeliveryView(delivery) });
  } catch (error) {
    console.error('Failed delivery error:', error);
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Unable to report delivery issue.' });
  } finally {
    if (session) await session.endSession();
  }
};

// Rider: GPS Ping
const updateLocation = async (req, res) => {
  try {
    const { lat, lng, heading, speed } = req.body;
    if (!isDeliveryRider(req.user)) return res.status(403).json({ message: 'Delivery Rider access only.' });
    if (![lat, lng].every(Number.isFinite) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return res.status(400).json({ message: 'Valid GPS coordinates are required.' });
    const now = new Date();
    const delivery = await Delivery.findOneAndUpdate(
      { ...assignedRiderQuery(req), isLive: true },
      {
        $set: { riderLocation: { lat, lng, heading, speed, lastUpdated: now } },
        $push: { locationHistory: { lat, lng, timestamp: now } }
      },
      { new: true }
    );
    if (!delivery) return res.status(403).json({ message: 'Assigned delivery is inactive.' });
    
    // Trigger Socket emit for real-time location update
    const io = req.app.get('socketio');
    if (io) {
      await emitAuthorizedDeliveryEvent(io, delivery._id, 'locationUpdate', { deliveryId: delivery._id, lat, lng, heading, speed, lastUpdated: now });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Location update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Shared: Chat message
const sendDeliveryMessage = async (req, res) => {
  try {
    const { token } = req.params;
    const content = String(req.body.content || '').trim();
    if (!content || content.length > 1000) return res.status(400).json({ message: 'Enter a message up to 1000 characters.' });
    const message = { sender: 'customer', content, timestamp: new Date() };
    const delivery = await Delivery.findOneAndUpdate(
      { trackingToken: token, isLive: true },
      { $push: { chat: message } },
      { new: true }
    );
    if (!delivery) return res.status(403).json({ message: 'Chat disabled' });

    // Trigger Socket emit for real-time chat message
    const io = req.app.get('socketio');
    if (io) {
      await emitAuthorizedDeliveryEvent(io, delivery._id, 'newMessage', { deliveryId: delivery._id, ...message });
      
    }
    
    res.status(201).json({ message });
  } catch (error) {
    console.error('Message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const sendRiderDeliveryMessage = async (req, res) => {
  try {
    if (!isDeliveryRider(req.user)) return res.status(403).json({ message: 'Delivery Rider access only.' });
    const content = String(req.body.content || '').trim();
    if (!content || content.length > 1000) return res.status(400).json({ message: 'Enter a message up to 1000 characters.' });
    const sourceDelivery = await Delivery.findOne({ ...assignedRiderQuery(req), isLive: true })
      .populate({ path: 'order', populate: { path: 'store', populate: { path: 'owner' } } })
      .populate({ path: 'booking', populate: { path: 'store', populate: { path: 'owner' } } });
    if (!sourceDelivery) return res.status(404).json({ message: 'Assigned delivery not found.' });
    const message = { sender: 'rider', content, timestamp: new Date() };
    const delivery = await Delivery.findOneAndUpdate(
      { ...assignedRiderQuery(req), isLive: true },
      { $push: { chat: message } },
      { new: true }
    );
    if (!delivery) return res.status(409).json({ message: 'Delivery state changed. Refresh and try again.' });
    const io = req.app.get('socketio');
    if (io) await emitAuthorizedDeliveryEvent(io, delivery._id, 'newMessage', { deliveryId: delivery._id, ...message });
    const customerId = sourceDelivery.order?.customer || sourceDelivery.booking?.customer;
    const sellerId = sourceDelivery.order?.store?.owner?._id || sourceDelivery.booking?.store?.owner?._id;
    const notifications = [customerId, sellerId].filter(Boolean).map(recipient => Notification.create({
      recipient, sender: req.user._id, type: 'chat_message', title: 'Message from Rider',
      message: `Rider message: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`,
      relatedId: delivery.order?._id || delivery.booking?._id,
      relatedModel: delivery.order ? 'Order' : 'Booking',
      targetUrl: recipient.toString() === customerId?.toString() ? `/track/${delivery.trackingToken}` : `/admin/logistics/${delivery._id}`
    }).then(notification => io?.to(`user_${recipient}`).emit('newNotification', notification)));
    const outcomes = await Promise.allSettled(notifications);
    outcomes.filter(item => item.status === 'rejected').forEach(item => console.error('Delivery message notification error:', item.reason?.message));
    res.status(201).json({ message });
  } catch (error) {
    res.status(500).json({ message: 'Unable to send rider message.' });
  }
};

const concernMutation = concern => ({
  $push: {
    complaints: {
      ...concern,
      status: 'pending',
      createdAt: new Date()
    }
  }
});

// Authenticated customer tracking capability: submit a concern for the
// customer's own delivery only after the Rider has started delivery work.
const submitComplaint = async (req, res) => {
  try {
    const { token } = req.params;
    const validation = validateDeliveryConcern(req.body);
    if (validation.error) return res.status(400).json({ message: validation.error });
    const existing = await Delivery.findOne({ trackingToken: token }).select('status order booking');
    if (!existing) return res.status(404).json({ message: 'Delivery not found.' });
    const source = existing.order
      ? await Order.findById(existing.order).select('customer')
      : await Booking.findById(existing.booking).select('customer');
    if (!source?.customer || source.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You cannot report a concern for this delivery.' });
    }
    if (!isDeliveryConcernReportable(existing.status)) {
      return res.status(409).json({ message: 'A concern can be reported after the Rider has picked up the delivery.' });
    }
    const delivery = await Delivery.findOneAndUpdate(
      { trackingToken: token, status: { $in: REPORTABLE_DELIVERY_STATUSES } },
      concernMutation(validation.value),
      { new: true }
    );
    if (!delivery) return res.status(409).json({ message: 'Delivery status changed. Refresh before reporting a concern.' });
    res.status(201).json({ success: true, message: 'Concern submitted.' });
  } catch (error) {
    res.status(500).json({ message: 'Unable to submit the delivery concern.' });
  }
};

// Store-scoped Seller workflow. The caller's logistics permission is checked
// by the route and again against the Delivery's authoritative Store here.
const submitStoreConcern = async (req, res) => {
  try {
    const validation = validateDeliveryConcern(req.body);
    if (validation.error) return res.status(400).json({ message: validation.error });
    const existing = await Delivery.findById(req.params.deliveryId).select('status store order booking');
    if (!existing) return res.status(404).json({ message: 'Delivery not found.' });
    const source = existing.order
      ? await Order.findById(existing.order).select('store')
      : await Booking.findById(existing.booking).select('store');
    const storeId = existing.store || source?.store;
    if (!storeId || (!isPlatformAdmin(req.user) && !(await canOperateStore(req.user, storeId, ['logistics.manage'])))) {
      return res.status(403).json({ message: 'You cannot report a concern for this Store delivery.' });
    }
    if (!isDeliveryConcernReportable(existing.status)) {
      return res.status(409).json({ message: 'A concern can be reported after the Rider has picked up the delivery.' });
    }
    const delivery = await Delivery.findOneAndUpdate(
      { _id: existing._id, status: { $in: REPORTABLE_DELIVERY_STATUSES } },
      concernMutation(validation.value),
      { new: true }
    );
    if (!delivery) return res.status(409).json({ message: 'Delivery status changed. Refresh before reporting a concern.' });
    res.status(201).json({ success: true, message: 'Concern submitted.' });
  } catch (error) {
    res.status(500).json({ message: 'Unable to submit the delivery concern.' });
  }
};

// Admin/Seller: Resolve Complaint
const resolveComplaint = async (req, res) => {
  try {
    const { deliveryId, complaintId } = req.params;
    const delivery = await Delivery.findById(deliveryId).select('store order booking complaints');
    if (!delivery) return res.status(404).json({ message: 'Delivery not found' });
    const source = delivery.order
      ? await Order.findById(delivery.order).select('store')
      : await Booking.findById(delivery.booking).select('store');
    const storeId = delivery.store || source?.store;
    if (!storeId || (!isPlatformAdmin(req.user) && !(await canOperateStore(req.user, storeId, ['logistics.manage'])))) {
      return res.status(403).json({ message: 'You cannot resolve concerns for this delivery.' });
    }
    const result = await Delivery.updateOne({
      _id: deliveryId,
      complaints: { $elemMatch: { _id: complaintId, status: 'pending' } }
    }, {
      $set: {
        'complaints.$.status': 'resolved',
        'complaints.$.resolvedAt': new Date(),
        'complaints.$.resolvedBy': req.user._id
      }
    });
    if (!result.matchedCount) return res.status(409).json({ message: 'Concern not found or already resolved.' });
    res.json({ success: true, message: 'Complaint resolved' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const calculateDeliveryFee = async (req, res) => {
  try {
    const store = await resolveStore(req);
    if (!store) return res.status(400).json({ message: 'Store is required.' });
    const calculation = await DeliveryFeeService.calculate({
      store,
      origin: req.body.origin,
      destination: req.body.destination,
      surcharge: req.body.surcharge,
      discount: req.body.discount
    });
    res.json(calculation);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  assignDeliveryAutomatically,
  getAssignedRiderDelivery,
  getDeliveryByToken,
  getDeliveryByOrder,
  getDeliveryByBooking,
  updateDeliveryStatus,
  updateLocation,
  sendDeliveryMessage,
  sendRiderDeliveryMessage,
  submitComplaint,
  submitStoreConcern,
  resolveComplaint,
  calculateDeliveryFee,
  internalCreateDelivery,
  completeDelivery,
  reportFailedDelivery,
  __test: { buildProofOfDelivery, concernMutation }
};
