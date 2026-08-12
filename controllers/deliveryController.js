const Delivery = require('../models/Delivery');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const crypto = require('crypto');
const DeliveryFeeService = require('../services/deliveryFeeService');
const resolveStore = require('../utils/resolveStore');
const User = require('../models/User');
const RiderEarning = require('../models/RiderEarning');
const Store = require('../models/Store');

const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
let CLIENT_URL = process.env.CLIENT_URL;
if (!CLIENT_URL || CLIENT_URL.includes('localhost')) {
    CLIENT_URL = isProduction ? 'https://pawzzle.io' : 'http://localhost:3000';
}

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

// Internal: Create delivery record and link to order/booking
const internalCreateDelivery = async ({ orderId, bookingId, assignmentType, assignedRider, thirdPartyRider, assignedBy }) => {
  const query = orderId ? { order: orderId } : { booking: bookingId };
  let delivery = await Delivery.findOne(query);
  const hasNewAssignment = assignmentType === 'internal' ? Boolean(assignedRider) : assignmentType === 'third_party';
  
  if (delivery) {
    if (!delivery.store) {
      const existingSource = orderId ? await Order.findById(orderId).select('store') : await Booking.findById(bookingId).select('store');
      if (existingSource?.store) delivery.store = existingSource.store;
    }
    const sameInternal = assignmentType === 'internal' && delivery.assignmentType === 'internal' && delivery.assignedRider?.toString() === assignedRider?.toString();
    const sameThirdParty = assignmentType === 'third_party' && delivery.assignmentType === 'third_party' &&
      delivery.thirdPartyRider?.name === thirdPartyRider?.name && delivery.thirdPartyRider?.mobile === thirdPartyRider?.mobile;
    if (hasNewAssignment && !sameInternal && !sameThirdParty) {
      if (!['pending', 'unassigned', 'assigned', 'accepted'].includes(delivery.status)) {
        const error = new Error('An in-progress delivery cannot be reassigned.'); error.statusCode = 409; throw error;
      }
      const now = new Date();
      const activeHistory = delivery.assignmentHistory?.find(entry => !entry.endedAt);
      if (activeHistory) activeHistory.endedAt = now;
      delivery.assignmentType = assignmentType;
      delivery.assignedRider = assignmentType === 'internal' ? assignedRider : null;
      delivery.thirdPartyRider = assignmentType === 'third_party' ? thirdPartyRider : undefined;
      delivery.assignedBy = assignedBy;
      delivery.assignedAt = now;
      delivery.riderToken = crypto.randomBytes(32).toString('hex');
      delivery.isRiderVerified = false;
      delivery.riderName = undefined; delivery.riderPhone = undefined; delivery.riderVehicleInfo = undefined;
      if (['pending', 'unassigned', 'accepted'].includes(delivery.status)) delivery.status = 'assigned';
      delivery.assignmentHistory.push({ assignmentType, rider: assignmentType === 'internal' ? assignedRider : undefined, thirdPartyRider: assignmentType === 'third_party' ? thirdPartyRider : undefined, assignedBy, assignedAt: now });
      delivery.statusHistory.push({ status: 'assigned', timestamp: delivery.assignedAt, notes: `Assigned to ${assignmentType === 'internal' ? 'Internal Delivery Rider' : 'Third-Party Rider'}` });
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
    assignmentType: hasNewAssignment ? assignmentType : 'unassigned',
    assignedRider: assignedRider || null,
    thirdPartyRider: assignmentType === 'third_party' ? thirdPartyRider : undefined,
    assignedBy: assignedBy || null,
    assignedAt: hasNewAssignment ? new Date() : null,
    status: hasNewAssignment ? 'assigned' : 'pending',
    assignmentHistory: hasNewAssignment ? [{ assignmentType, rider: assignmentType === 'internal' ? assignedRider : undefined, thirdPartyRider: assignmentType === 'third_party' ? thirdPartyRider : undefined, assignedBy, assignedAt: new Date() }] : [],
    statusHistory: [{ status: hasNewAssignment ? 'assigned' : 'pending', timestamp: new Date(), notes: hasNewAssignment ? `Created and assigned to ${assignmentType === 'internal' ? 'Internal Delivery Rider' : 'Third-Party Rider'}` : 'Delivery created' }]
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

// Generate unique delivery links (Rider & Customer)
const generateDeliveryLinks = async (req, res) => {
  try {
    const { orderId, bookingId, riderId, assignmentType: requestedType, thirdPartyRider } = req.body;
    
    if (!orderId && !bookingId) {
      return res.status(400).json({ message: 'Order ID or Booking ID is required' });
    }
    
    const assignmentType = requestedType || (riderId ? 'internal' : undefined);
    if (assignmentType && !['internal', 'third_party'].includes(assignmentType)) return res.status(400).json({ message: 'Invalid delivery assignment type.' });
    const source = orderId
      ? await Order.findById(orderId).select('store customer orderNumber')
      : await Booking.findById(bookingId).select('store customer');
    if (!source) return res.status(404).json({ message: 'Order or Booking not found' });
    if (!['super_admin', 'platform_admin'].includes(req.user.role)) {
      const assignedStore = req.user.store?.toString() === source.store?.toString();
      const ownsStore = await Store.exists({ _id: source.store, owner: req.user._id });
      if (!assignedStore && !ownsStore) return res.status(403).json({ message: 'You cannot assign deliveries for this store.' });
    }
    let rider;
    let normalizedThirdParty;
    if (assignmentType === 'internal') {
      if (!riderId) return res.status(400).json({ message: 'Select an active Internal Delivery Rider.' });
      rider = await User.findOne({
        _id: riderId, role: 'staff', staffType: 'delivery_rider', store: source.store,
        isActive: true, isDeleted: false, 'riderProfile.accountStatus': 'active'
      }).select('_id firstName lastName riderProfile');
      if (!rider) return res.status(400).json({ message: 'Select an active Delivery Rider assigned to this store.' });
    } else if (assignmentType === 'third_party') {
      const mobile = String(thirdPartyRider?.mobile || '').replace(/[\s-]/g, '');
      if (!thirdPartyRider?.name?.trim() || !thirdPartyRider?.company?.trim() || !/^(?:\+?63|0)9\d{9}$/.test(mobile)) {
        return res.status(400).json({ message: 'Third-party rider name, courier company, and a valid Philippine mobile number are required.' });
      }
      normalizedThirdParty = {
        name: thirdPartyRider.name.trim(), mobile, company: thirdPartyRider.company.trim(),
        vehicleType: thirdPartyRider.vehicleType?.trim(), plateNumber: thirdPartyRider.plateNumber?.trim().toUpperCase(),
        referenceNumber: thirdPartyRider.referenceNumber?.trim(), notes: thirdPartyRider.notes?.trim()
      };
    }
    const previousDelivery = await Delivery.findOne(orderId ? { order: orderId } : { booking: bookingId }).select('assignedRider assignmentType assignmentHistory');
    const previousRiderId = previousDelivery?.assignedRider;
    const previousAssignmentCount = previousDelivery?.assignmentHistory?.length || 0;
    const delivery = await internalCreateDelivery({ orderId, bookingId, assignmentType, assignedRider: rider?._id, thirdPartyRider: normalizedThirdParty, assignedBy: req.user._id });
    
    if (!delivery) {
      return res.status(404).json({ message: 'Order or Booking not found' });
    }

    const assignmentChanged = !previousDelivery || (delivery.assignmentHistory?.length || 0) > previousAssignmentCount;
    const wasReassigned = assignmentChanged && previousAssignmentCount > 0;
    const io = req.app.get('socketio');
    if (wasReassigned && previousRiderId && previousRiderId.toString() !== String(rider?._id || '')) {
      const previousNotification = await Notification.create({
        recipient: previousRiderId,
        sender: req.user._id,
        type: 'delivery_update',
        title: 'Delivery Assignment Changed',
        message: `${source.orderNumber || 'A delivery'} has been reassigned and is no longer in your active workload.`,
        relatedId: delivery._id,
        relatedModel: 'Delivery',
        targetUrl: '/admin/dashboard'
      });
      if (io) io.to(`user_${previousRiderId}`).emit('newNotification', previousNotification);
    }
    if (assignmentChanged && rider?._id) {
      const riderNotification = await Notification.create({
        recipient: rider._id,
        sender: req.user._id,
        type: 'delivery_update',
        title: wasReassigned ? 'Delivery Reassigned to You' : 'New Delivery Assignment',
        message: `${source.orderNumber || 'A delivery'} is ready in your Rider Dashboard.`,
        relatedId: delivery._id,
        relatedModel: 'Delivery',
        targetUrl: `/rider-track/${delivery.riderToken}`
      });
      if (io) io.to(`user_${rider._id}`).emit('newNotification', riderNotification);
    }
    if (assignmentChanged && source.customer) {
      const customerNotification = await Notification.create({
        recipient: source.customer,
        sender: req.user._id,
        type: 'delivery_update',
        title: 'Delivery Assignment Updated',
        message: `Your delivery has been ${wasReassigned ? 'reassigned' : 'assigned'} and tracking is available.`,
        relatedId: delivery._id,
        relatedModel: 'Delivery',
        targetUrl: `/track/${delivery.trackingToken}`
      });
      if (io) io.to(`user_${source.customer}`).emit('newNotification', customerNotification);
    }

    res.status(201).json({
      message: 'Delivery links generated',
      riderLink: `${CLIENT_URL}/rider-track/${delivery.riderToken}`,
      customerLink: `${CLIENT_URL}/track/${delivery.trackingToken}`,
      delivery,
      assignedRider: rider || null,
      assignmentType: delivery.assignmentType,
      thirdPartyRider: delivery.assignmentType === 'third_party' ? delivery.thirdPartyRider : undefined
    });
  } catch (error) {
    console.error('Error generating delivery links:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
  }
};

// Public: Get delivery by token (Rider OR Customer)
const getDeliveryByToken = async (req, res) => {
  try {
    const { token } = req.params;
    
    // Check if it's a rider token
    let delivery = await Delivery.findOne({ riderToken: token })
      .populate({
        path: 'order',
        populate: [
          { path: 'customer', select: 'firstName lastName phoneNumber' },
          { path: 'store', select: 'name contactInfo' }
        ]
      })
      .populate({
        path: 'booking',
        populate: [
          { path: 'customer', select: 'firstName lastName phoneNumber' },
          { path: 'store', select: 'name contactInfo' },
          { path: 'service', select: 'name duration' }
        ]
      })
      .populate('assignedRider', 'firstName lastName phone staffType riderProfile.staffId riderProfile.vehicleType riderProfile.plateNumber');

    let role = 'rider';
    
    if (!delivery) {
      // Check if it's a customer tracking token
      delivery = await Delivery.findOne({ trackingToken: token })
        .populate({
          path: 'order',
          populate: [
            { path: 'customer', select: 'firstName lastName phoneNumber' },
            { path: 'store', select: 'name contactInfo' }
          ]
        })
        .populate({
          path: 'booking',
          populate: [
            { path: 'customer', select: 'firstName lastName phoneNumber' },
            { path: 'store', select: 'name contactInfo' },
            { path: 'service', select: 'name duration' }
          ]
        });
      role = 'customer';
    }

    if (!delivery) {
      return res.status(404).json({ message: 'Secure tracking link invalid or expired' });
    }

    if (role === 'rider' && !delivery.riderLinkOpenedAt) delivery.riderLinkOpenedAt = new Date();
    if (role === 'customer' && !delivery.trackingLinkOpenedAt) delivery.trackingLinkOpenedAt = new Date();
    if (delivery.isModified()) await delivery.save();

    const safeDelivery = delivery.toObject();
    delete safeDelivery.assignmentHistory;
    delete safeDelivery.assignedBy;
    if (role === 'customer') {
      delete safeDelivery.riderToken;
      delete safeDelivery.thirdPartyRider;
      delete safeDelivery.assignedRider;
    }
    res.json({ delivery: safeDelivery, role });
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
    const allowed = req.user.role === 'super_admin' || order.customer?.toString() === req.user._id.toString() || req.user.store?.toString() === order.store?.toString() || await Store.exists({ _id: order.store, owner: req.user._id });
    if (!allowed) return res.status(403).json({ message: 'Access denied to this delivery.' });
    const delivery = await Delivery.findOne({ order: orderId }).select('trackingToken riderToken status isLive assignmentType assignedRider thirdPartyRider assignedAt assignmentHistory').populate('assignedRider', 'firstName lastName riderProfile.staffId riderProfile.deliveryZone');
    if (!delivery) return res.status(404).json({ message: 'No delivery active' });
    const payload = delivery.toObject();
    if (req.user.role === 'customer') { delete payload.riderToken; delete payload.thirdPartyRider; delete payload.assignedRider; delete payload.assignmentHistory; }
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
    const allowed = req.user.role === 'super_admin' || booking.customer?.toString() === req.user._id.toString() || req.user.store?.toString() === booking.store?.toString() || await Store.exists({ _id: booking.store, owner: req.user._id });
    if (!allowed) return res.status(403).json({ message: 'Access denied to this delivery.' });
    const delivery = await Delivery.findOne({ booking: bookingId }).select('trackingToken riderToken status isLive assignmentType assignedRider thirdPartyRider assignedAt assignmentHistory').populate('assignedRider', 'firstName lastName riderProfile.staffId riderProfile.deliveryZone');
    if (!delivery) return res.status(404).json({ message: 'No delivery active' });
    const payload = delivery.toObject();
    if (req.user.role === 'customer') { delete payload.riderToken; delete payload.thirdPartyRider; delete payload.assignedRider; delete payload.assignmentHistory; }
    res.json({ delivery: payload });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Rider: Update status (Synced with Order State Machine)
const updateDeliveryStatus = async (req, res) => {
  try {
    const { token } = req.params;
    const { status } = req.body;

    const delivery = await Delivery.findOne({ riderToken: token });
    if (!delivery) return res.status(404).json({ message: 'Unauthorized link' });

    if (!delivery.isLive && status !== 'delivered') {
      return res.status(403).json({ message: 'Delivery completed. Control link disabled.' });
    }

    const transitions = {
      pending: ['picked_up'], unassigned: ['assigned'], assigned: ['picked_up'], accepted: ['picked_up'],
      picked_up: ['in_transit'], in_transit: ['arrived'], arrived: ['failed_attempt'],
      failed_attempt: ['in_transit', 'returned_to_store']
    };
    if (!transitions[delivery.status]?.includes(status)) {
      return res.status(400).json({ message: `Cannot change delivery from ${delivery.status} to ${status}.` });
    }

    delivery.status = status;
    if (status === 'picked_up') delivery.pickedUpAt = new Date();
    if (status === 'arrived') delivery.arrivedAt = new Date();
    delivery.statusHistory.push({ status, timestamp: new Date() });
    
    // Sync to Order
    if (delivery.order) {
       const order = await Order.findById(delivery.order);
       if (order) {
          order.status = status === 'arrived' ? 'in_transit' : status;
          order.fulfillmentTimeline.push({
            status: status,
            actor: req.user?._id || null, // Rider actor
            description: `Rider updated mission status to: ${status.replace('_', ' ')}`
          });
          await order.save();
       }
    }

    if (status === 'delivered') {
      delivery.deliveredAt = new Date();
      delivery.isLive = false;
      if (delivery.order) await Order.findByIdAndUpdate(delivery.order, { status: 'delivered', deliveryDate: new Date() });
    }

    await delivery.save();
    if (delivery.assignedRider) {
      const rider = await User.findOne({ _id: delivery.assignedRider, role: 'staff', staffType: 'delivery_rider' }).select('store riderProfile.earningRules');
      if (rider) {
        const rules = rider.riderProfile?.earningRules || {};
        const baseRate = Number(rules.baseRate || 0);
        const incentive = Number(rules.incentive || 0);
        const bonus = Number(rules.bonus || 0);
        const deduction = Number(rules.deduction || 0);
        const amount = Math.max(0, baseRate + incentive + bonus - deduction);
        await RiderEarning.findOneAndUpdate(
          { delivery: delivery._id },
          { $setOnInsert: { rider: rider._id, store: rider.store, delivery: delivery._id, baseRate, incentive, bonus, deduction, amount, status: 'available', earnedAt: delivery.deliveredAt } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    }
    
    const io = req.app.get('socketio');
    if (io) {
      io.to(`delivery_${delivery._id}`).emit('statusChanged', { deliveryId: delivery._id, status: delivery.status });
    }
    
    res.json({ success: true, status: delivery.status });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const completeDelivery = async (req, res) => {
  try {
    const delivery = await Delivery.findOne({ riderToken: req.params.token });
    if (!delivery) return res.status(404).json({ message: 'Delivery link is invalid.' });
    if (!delivery.isLive || delivery.status === 'delivered') return res.status(409).json({ message: 'Delivery has already been completed.' });
    if (delivery.status !== 'arrived') return res.status(400).json({ message: 'Mark the delivery as arrived before confirming completion.' });
    const { photo, signature, method, otp, notes, location, codPaymentStatus } = req.body;
    if (!photo && !signature && !notes?.trim() && !otp) return res.status(400).json({ message: 'Add a photo, signature, OTP, or delivery notes as proof.' });
    let otpVerified = false;
    if (otp) {
      const order = delivery.order ? await Order.findById(delivery.order).select('pickupSession.code') : null;
      if (!order?.pickupSession?.code || String(order.pickupSession.code) !== String(otp).trim()) return res.status(400).json({ message: 'The delivery OTP is incorrect.' });
      otpVerified = true;
    }
    delivery.proofOfDelivery = {
      photo, signature, method: otp ? 'otp' : (method || (photo ? 'photo' : signature ? 'signature' : 'notes')),
      otpVerified, notes: notes?.trim(), location, riderId: delivery.assignedRider || undefined,
      riderName: delivery.riderName,
      timestamp: new Date(), codPaymentStatus
    };
    delivery.status = 'delivered';
    delivery.deliveredAt = new Date();
    delivery.isLive = false;
    delivery.statusHistory.push({ status: 'delivered', timestamp: delivery.deliveredAt, notes: notes?.trim() });
    await delivery.save();
    if (delivery.assignedRider) {
      const rider = await User.findOne({ _id: delivery.assignedRider, role: 'staff', staffType: 'delivery_rider' }).select('store riderProfile.earningRules');
      if (rider) {
        const rules = rider.riderProfile?.earningRules || {};
        const baseRate = Number(rules.baseRate || 0), incentive = Number(rules.incentive || 0);
        const bonus = Number(rules.bonus || 0), deduction = Number(rules.deduction || 0);
        await RiderEarning.findOneAndUpdate(
          { delivery: delivery._id },
          { $setOnInsert: { rider: rider._id, store: rider.store, delivery: delivery._id, baseRate, incentive, bonus, deduction, amount: Math.max(0, baseRate + incentive + bonus - deduction), status: 'available', earnedAt: delivery.deliveredAt } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    }
    if (delivery.order) await Order.findByIdAndUpdate(delivery.order, {
      status: 'delivered', deliveryDate: delivery.deliveredAt,
      $push: { fulfillmentTimeline: { status: 'delivered', timestamp: delivery.deliveredAt, description: 'Delivery completed with proof of delivery' } }
    });
    const io = req.app.get('socketio');
    if (io) io.to(`delivery_${delivery._id}`).emit('statusChanged', { deliveryId: delivery._id, status: 'delivered' });
    await notifyDeliveryParties(req, delivery, 'Delivery Completed', 'The delivery was completed and proof of delivery is available.');
    res.json({ success: true, delivery });
  } catch (error) {
    console.error('Complete delivery error:', error);
    res.status(500).json({ message: 'Unable to complete delivery.' });
  }
};

const reportFailedDelivery = async (req, res) => {
  try {
    const delivery = await Delivery.findOne({ riderToken: req.params.token });
    if (!delivery) return res.status(404).json({ message: 'Delivery link is invalid.' });
    if (!delivery.isLive) return res.status(409).json({ message: 'Delivery link is no longer active.' });
    if (!['in_transit', 'arrived'].includes(delivery.status)) return res.status(400).json({ message: 'A delivery issue can only be reported while travelling or after arrival.' });
    const { reason, notes, photo, location } = req.body;
    const reasons = ['customer_unavailable', 'cannot_contact', 'incorrect_address', 'customer_refused', 'establishment_closed', 'address_inaccessible', 'other'];
    if (!reasons.includes(reason)) return res.status(400).json({ message: 'Select a valid delivery issue reason.' });
    if (reason === 'other' && !notes?.trim()) return res.status(400).json({ message: 'Notes are required for other issues.' });
    delivery.deliveryAttempts.push({ reason, notes: notes?.trim(), photo, location, timestamp: new Date() });
    delivery.status = 'failed_attempt';
    delivery.statusHistory.push({ status: 'failed_attempt', timestamp: new Date(), notes: `${reason}${notes ? `: ${notes}` : ''}` });
    await delivery.save();
    if (delivery.order) await Order.findByIdAndUpdate(delivery.order, {
      status: 'delivery_failed',
      $push: { fulfillmentTimeline: { status: 'delivery_failed', timestamp: new Date(), description: `Delivery attempt failed: ${reason.replace(/_/g, ' ')}` } }
    });
    const io = req.app.get('socketio');
    if (io) io.to(`delivery_${delivery._id}`).emit('statusChanged', { deliveryId: delivery._id, status: 'failed_attempt' });
    await notifyDeliveryParties(req, delivery, 'Delivery Attempt Failed', `The delivery attempt failed: ${reason.replace(/_/g, ' ')}.`);
    res.json({ success: true, delivery });
  } catch (error) {
    console.error('Failed delivery error:', error);
    res.status(500).json({ message: 'Unable to report delivery issue.' });
  }
};

// Rider: GPS Ping
const updateLocation = async (req, res) => {
  try {
    const { token } = req.params;
    const { lat, lng, heading, speed } = req.body;

    const delivery = await Delivery.findOne({ riderToken: token });
    if (!delivery || !delivery.isLive) return res.status(403).json({ message: 'Inactive' });

    delivery.riderLocation = { lat, lng, heading, speed, lastUpdated: new Date() };
    delivery.locationHistory.push({ lat, lng });

    await delivery.save();
    
    // Trigger Socket emit for real-time location update
    const io = req.app.get('socketio');
    if (io) {
      io.to(`delivery_${delivery._id}`).emit('locationUpdate', { deliveryId: delivery._id, lat, lng, heading, speed });
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
    const { content, sender } = req.body;

    const delivery = await Delivery.findOne({
      $or: [{ riderToken: token }, { trackingToken: token }]
    }).populate({
      path: 'order',
      populate: { path: 'store', populate: { path: 'owner' } }
    }).populate({
      path: 'booking',
      populate: { path: 'store', populate: { path: 'owner' } }
    });

    if (!delivery || !delivery.isLive) return res.status(403).json({ message: 'Chat disabled' });

    const message = { sender, content, timestamp: new Date() };
    delivery.chat.push(message);
    await delivery.save();

    // Trigger Socket emit for real-time chat message
    const io = req.app.get('socketio');
    if (io) {
      io.to(`delivery_${delivery._id}`).emit('newMessage', { deliveryId: delivery._id, ...message });
      
      // If rider sends a message, notify the customer AND the seller
      if (sender === 'rider') {
        const customerId = delivery.order?.customer || delivery.booking?.customer;
        const sellerId = delivery.order?.store?.owner?._id || delivery.booking?.store?.owner?._id;
        
        const notificationData = {
          type: 'chat_message',
          title: 'Message from Rider',
          message: `Rider message: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`,
          relatedId: delivery.order?._id || delivery.booking?._id,
          relatedModel: delivery.order ? 'Order' : 'Booking',
          targetUrl: `/track/${delivery.trackingToken}`
        };

        // Notify Customer
        if (customerId) {
          const custNotif = new Notification({ ...notificationData, recipient: customerId });
          await custNotif.save();
          io.to(`user_${customerId}`).emit('newNotification', custNotif);
        }
        
        // Notify Seller
        if (sellerId) {
          const sellerNotif = new Notification({ 
            ...notificationData, 
            recipient: sellerId,
            message: `[Order Update] Rider sent a message: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`
          });
          await sellerNotif.save();
          io.to(`user_${sellerId}`).emit('newNotification', sellerNotif);
        }
      }
    }
    
    res.status(201).json({ message });
  } catch (error) {
    console.error('Message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Rider: Verify Identity before starting
const verifyRider = async (req, res) => {
  try {
    const { token } = req.params;
    const { riderName, riderPhone, riderVehicleInfo } = req.body;

    const delivery = await Delivery.findOne({ riderToken: token });
    if (!delivery || !delivery.isLive) return res.status(403).json({ message: 'Unauthorized link' });

    if (delivery.assignedRider) {
      const assigned = await User.findById(delivery.assignedRider).select('firstName lastName phone staffType isActive riderProfile');
      if (!assigned || assigned.staffType !== 'delivery_rider' || !assigned.isActive || assigned.riderProfile?.accountStatus !== 'active') {
        return res.status(403).json({ message: 'The assigned Delivery Rider account is not active.' });
      }
      const suppliedName = String(riderName || '').trim().toLowerCase();
      const expectedName = `${assigned.firstName} ${assigned.lastName}`.trim().toLowerCase();
      const suppliedPhone = String(riderPhone || '').replace(/\D/g, '').slice(-10);
      const expectedPhone = String(assigned.phone || '').replace(/\D/g, '').slice(-10);
      if (suppliedName !== expectedName || !expectedPhone || suppliedPhone !== expectedPhone) {
        return res.status(403).json({ message: 'Rider identity does not match the assigned staff account.' });
      }
    } else if (delivery.assignmentType === 'third_party') {
      const suppliedName = String(riderName || '').trim().toLowerCase();
      const expectedName = String(delivery.thirdPartyRider?.name || '').trim().toLowerCase();
      const suppliedPhone = String(riderPhone || '').replace(/\D/g, '').slice(-10);
      const expectedPhone = String(delivery.thirdPartyRider?.mobile || '').replace(/\D/g, '').slice(-10);
      if (!expectedName || suppliedName !== expectedName || !expectedPhone || suppliedPhone !== expectedPhone) {
        return res.status(403).json({ message: 'Rider identity does not match this third-party assignment.' });
      }
    }

    delivery.riderName = riderName;
    delivery.riderPhone = riderPhone;
    delivery.riderVehicleInfo = riderVehicleInfo;
    delivery.isRiderVerified = true;
    
    await delivery.save();
    res.json({ success: true, message: 'Rider verified' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Customer: Submit Complaint
const submitComplaint = async (req, res) => {
  try {
    const { token } = req.params;
    const { content, type } = req.body;

    const delivery = await Delivery.findOne({ trackingToken: token });
    if (!delivery) return res.status(404).json({ message: 'Delivery not found' });

    delivery.complaints.push({ content, type, status: 'pending' });
    await delivery.save();
    res.status(201).json({ success: true, message: 'Complaint submitted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin/Seller: Resolve Complaint
const resolveComplaint = async (req, res) => {
  try {
    const { deliveryId, complaintId } = req.params;
    
    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) return res.status(404).json({ message: 'Delivery not found' });

    const complaint = delivery.complaints.id(complaintId);
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });

    complaint.status = 'resolved';
    complaint.resolvedAt = new Date();
    
    await delivery.save();
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
  generateDeliveryLinks,
  getDeliveryByToken,
  getDeliveryByOrder,
  getDeliveryByBooking,
  updateDeliveryStatus,
  updateLocation,
  sendDeliveryMessage,
  verifyRider,
  submitComplaint,
  resolveComplaint,
  calculateDeliveryFee,
  internalCreateDelivery,
  completeDelivery,
  reportFailedDelivery
};
