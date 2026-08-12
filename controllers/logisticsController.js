const mongoose = require('mongoose');
const Delivery = require('../models/Delivery');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const User = require('../models/User');
const RiderEarning = require('../models/RiderEarning');
const resolveStore = require('../utils/resolveStore');
const { getDeliveryStatusLabel, getDeliveryLinkStatus } = require('../utils/logistics');

const PLATFORM_ROLES = new Set(['super_admin', 'platform_admin']);
const escapeRegex = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const clientUrl = () => {
  const production = process.env.NODE_ENV === 'production' || process.env.RENDER;
  const configured = process.env.CLIENT_URL;
  return !configured || configured.includes('localhost')
    ? (production ? 'https://pawzzle.io' : 'http://localhost:3000')
    : configured;
};

const resolveScope = async req => {
  const store = await resolveStore(req);
  if (!store && PLATFORM_ROLES.has(req.user.role)) return { match: {}, store: null };
  if (!store) {
    const error = new Error('A store assignment is required to access Logistics.');
    error.statusCode = 403;
    throw error;
  }
  const [orderIds, bookingIds] = await Promise.all([
    Order.find({ store }).distinct('_id'),
    Booking.find({ store }).distinct('_id')
  ]);
  return {
    store,
    match: { $or: [{ store }, { order: { $in: orderIds } }, { booking: { $in: bookingIds } }] }
  };
};

const serializeDelivery = delivery => {
  const row = delivery.toObject ? delivery.toObject() : delivery;
  return {
    ...row,
    deliveryNumber: `DLV-${String(row._id).slice(-8).toUpperCase()}`,
    statusLabel: getDeliveryStatusLabel(row.status),
    linkStatus: getDeliveryLinkStatus(row)
  };
};

const getLogisticsDashboard = async (req, res) => {
  try {
    const scope = await resolveScope(req);
    const rows = await Delivery.find(scope.match)
      .select('_id status assignmentType assignedRider createdAt deliveredAt deliveryAttempts complaints')
      .lean();
    const count = predicate => rows.filter(predicate).length;
    const summary = {
      total: rows.length,
      pendingAssignment: count(row => ['pending', 'unassigned'].includes(row.status) || row.assignmentType === 'unassigned'),
      assigned: count(row => ['assigned', 'accepted'].includes(row.status)),
      outForDelivery: count(row => ['picked_up', 'in_transit'].includes(row.status)),
      arrived: count(row => row.status === 'arrived'),
      delivered: count(row => row.status === 'delivered'),
      failed: count(row => ['failed_attempt', 'returned_to_store', 'declined'].includes(row.status)),
      cancelled: count(row => row.status === 'cancelled')
    };

    const riderQuery = {
      role: 'staff', staffType: 'delivery_rider', isActive: true, isDeleted: false,
      'riderProfile.accountStatus': 'active'
    };
    if (scope.store) riderQuery.store = scope.store;
    const activeInternalRiders = await User.countDocuments(riderQuery);

    const byStatus = Object.entries(summary)
      .filter(([key]) => !['total', 'pendingAssignment'].includes(key))
      .map(([key, value]) => ({ key, label: key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), value }));
    byStatus.unshift({ key: 'pendingAssignment', label: 'Pending Assignment', value: summary.pendingAssignment });

    const dailyMap = {};
    const start = new Date(); start.setDate(start.getDate() - 13); start.setHours(0, 0, 0, 0);
    for (const row of rows) {
      const date = new Date(row.createdAt);
      if (date < start) continue;
      const key = date.toISOString().slice(0, 10);
      dailyMap[key] = (dailyMap[key] || 0) + 1;
    }
    const deliveriesOverTime = Array.from({ length: 14 }, (_, index) => {
      const date = new Date(start); date.setDate(start.getDate() + index);
      const key = date.toISOString().slice(0, 10);
      return { date: key, count: dailyMap[key] || 0 };
    });

    const deliveryIds = rows.map(row => row._id);
    const earningTotals = deliveryIds.length ? await RiderEarning.aggregate([
      { $match: { delivery: { $in: deliveryIds } } },
      { $group: { _id: '$status', amount: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]) : [];

    res.json({
      summary: { ...summary, activeInternalRiders },
      charts: {
        byStatus,
        deliveriesOverTime,
        performance: { completed: summary.delivered, failed: summary.failed },
        byAssignment: ['internal', 'third_party', 'unassigned'].map(key => ({
          key,
          label: key === 'third_party' ? 'Third-party' : key.replace(/^./, character => character.toUpperCase()),
          value: count(row => row.assignmentType === key)
        }))
      },
      riderEarnings: earningTotals
    });
  } catch (error) {
    console.error('Logistics dashboard error:', error);
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Unable to load the logistics dashboard.' });
  }
};

const getDeliveries = async (req, res) => {
  try {
    const scope = await resolveScope(req);
    const { status, riderType, rider, search, from, to, page = 1, limit = 20 } = req.query;
    const filters = [];
    if (status) filters.push({ status });
    if (riderType) filters.push({ assignmentType: riderType });
    if (rider && mongoose.Types.ObjectId.isValid(rider)) filters.push({ assignedRider: rider });
    if (from || to) {
      const createdAt = {};
      if (from) createdAt.$gte = new Date(from);
      if (to) { const end = new Date(to); end.setHours(23, 59, 59, 999); createdAt.$lte = end; }
      filters.push({ createdAt });
    }

    if (search?.trim()) {
      const pattern = new RegExp(escapeRegex(search.trim()), 'i');
      const customerIds = await User.find({
        $or: [{ firstName: pattern }, { lastName: pattern }, { username: pattern }]
      }).distinct('_id');
      const orderQuery = { $or: [{ orderNumber: pattern }, { trackingNumber: pattern }, { customer: { $in: customerIds } }] };
      const bookingQuery = { customer: { $in: customerIds } };
      if (scope.store) { orderQuery.store = scope.store; bookingQuery.store = scope.store; }
      const [orderIds, bookingIds, riderIds] = await Promise.all([
        Order.find(orderQuery).distinct('_id'),
        Booking.find(bookingQuery).distinct('_id'),
        User.find({ role: 'staff', staffType: 'delivery_rider', $or: [{ firstName: pattern }, { lastName: pattern }, { 'riderProfile.staffId': pattern }] }).distinct('_id')
      ]);
      filters.push({
        $or: [
          { riderToken: pattern }, { trackingToken: pattern }, { order: { $in: orderIds } },
          { booking: { $in: bookingIds } }, { assignedRider: { $in: riderIds } },
          { 'thirdPartyRider.name': pattern }, { 'thirdPartyRider.company': pattern },
          { 'thirdPartyRider.referenceNumber': pattern }
        ]
      });
    }

    const match = filters.length ? { $and: [scope.match, ...filters] } : scope.match;
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const safePage = Math.max(1, Number(page) || 1);
    const [deliveries, total] = await Promise.all([
      Delivery.find(match)
        .select('-locationHistory -chat -riderToken -trackingToken')
        .populate({ path: 'order', select: 'orderNumber customer shippingAddress deliveryMethod shippingFee totalAmount paymentMethod paymentStatus trackingNumber', populate: { path: 'customer', select: 'firstName lastName' } })
        .populate({ path: 'booking', select: 'customer serviceAddress totalPrice paymentMethod paymentStatus', populate: [{ path: 'customer', select: 'firstName lastName' }, { path: 'service', select: 'name' }] })
        .populate('assignedRider', 'firstName lastName phone riderProfile.staffId riderProfile.accountStatus riderProfile.deliveryZone')
        .sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit),
      Delivery.countDocuments(match)
    ]);
    res.json({
      deliveries: deliveries.map(serializeDelivery),
      pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) }
    });
  } catch (error) {
    console.error('List logistics deliveries error:', error);
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Unable to load deliveries.' });
  }
};

const getDeliveryDetails = async (req, res) => {
  try {
    const scope = await resolveScope(req);
    const delivery = await Delivery.findOne({ $and: [scope.match, { _id: req.params.id }] })
      .populate({ path: 'order', populate: [{ path: 'customer', select: 'firstName lastName email phone' }, { path: 'store', select: 'name contactInfo' }] })
      .populate({ path: 'booking', populate: [{ path: 'customer', select: 'firstName lastName email phone' }, { path: 'store', select: 'name contactInfo' }, { path: 'service', select: 'name duration category' }] })
      .populate('assignedRider', 'firstName lastName phone isActive staffType riderProfile')
      .populate('assignedBy', 'firstName lastName')
      .populate('assignmentHistory.rider', 'firstName lastName riderProfile.staffId')
      .populate('assignmentHistory.assignedBy', 'firstName lastName')
      .populate('proofOfDelivery.riderId', 'firstName lastName riderProfile.staffId');
    if (!delivery) return res.status(404).json({ message: 'Delivery not found.' });

    const earning = await RiderEarning.findOne({ delivery: delivery._id })
      .populate('rider', 'firstName lastName riderProfile.staffId')
      .populate('payout', 'payoutId status amount referenceNumber processedAt');
    const payload = serializeDelivery(delivery);
    payload.links = {
      rider: `${clientUrl()}/rider-track/${delivery.riderToken}`,
      customer: `${clientUrl()}/track/${delivery.trackingToken}`,
      status: payload.linkStatus
    };
    delete payload.riderToken;
    delete payload.trackingToken;
    res.json({ delivery: payload, earning });
  } catch (error) {
    console.error('Delivery details error:', error);
    if (error.name === 'CastError') return res.status(404).json({ message: 'Delivery not found.' });
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Unable to load delivery details.' });
  }
};

const getDeliveryIssues = async (req, res) => {
  try {
    const scope = await resolveScope(req);
    const deliveries = await Delivery.find({
      $and: [scope.match, { $or: [{ 'deliveryAttempts.0': { $exists: true } }, { 'complaints.0': { $exists: true } }, { status: { $in: ['failed_attempt', 'returned_to_store'] } }] }]
    })
      .select('order booking status assignedRider assignmentType thirdPartyRider deliveryAttempts complaints createdAt')
      .populate({ path: 'order', select: 'orderNumber customer', populate: { path: 'customer', select: 'firstName lastName' } })
      .populate({ path: 'booking', select: 'customer', populate: { path: 'customer', select: 'firstName lastName' } })
      .populate('assignedRider', 'firstName lastName riderProfile.staffId')
      .sort({ updatedAt: -1 }).limit(200).lean();
    const issues = [];
    for (const delivery of deliveries) {
      for (const attempt of delivery.deliveryAttempts || []) {
        issues.push({
          _id: attempt._id, type: 'attempt', deliveryId: delivery._id,
          deliveryNumber: `DLV-${String(delivery._id).slice(-8).toUpperCase()}`,
          orderNumber: delivery.order?.orderNumber || `Booking ${String(delivery.booking?._id || '').slice(-8).toUpperCase()}`,
          customer: delivery.order?.customer || delivery.booking?.customer,
          rider: delivery.assignedRider || delivery.thirdPartyRider,
          riderType: delivery.assignmentType, reason: attempt.reason, notes: attempt.notes,
          photo: attempt.photo, date: attempt.timestamp,
          resolutionStatus: attempt.resolutionStatus || 'open', resolutionNotes: attempt.resolutionNotes
        });
      }
      for (const complaint of delivery.complaints || []) {
        issues.push({
          _id: complaint._id, type: 'complaint', deliveryId: delivery._id,
          deliveryNumber: `DLV-${String(delivery._id).slice(-8).toUpperCase()}`,
          orderNumber: delivery.order?.orderNumber || `Booking ${String(delivery.booking?._id || '').slice(-8).toUpperCase()}`,
          customer: delivery.order?.customer || delivery.booking?.customer,
          rider: delivery.assignedRider || delivery.thirdPartyRider,
          riderType: delivery.assignmentType, reason: complaint.type, notes: complaint.content,
          date: complaint.createdAt, resolutionStatus: complaint.status, resolvedAt: complaint.resolvedAt,
          resolutionNotes: complaint.resolutionNotes
        });
      }
    }
    issues.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ issues });
  } catch (error) {
    console.error('Delivery issues error:', error);
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Unable to load delivery issues.' });
  }
};

const resolveDeliveryIssue = async (req, res) => {
  try {
    const scope = await resolveScope(req);
    const delivery = await Delivery.findOne({ $and: [scope.match, { _id: req.params.deliveryId }] });
    if (!delivery) return res.status(404).json({ message: 'Delivery not found.' });
    const notes = String(req.body.notes || '').trim();
    if (!notes) return res.status(400).json({ message: 'Resolution notes are required.' });
    if (req.params.issueType === 'attempt') {
      const attempt = delivery.deliveryAttempts.id(req.params.issueId);
      if (!attempt) return res.status(404).json({ message: 'Delivery attempt issue not found.' });
      attempt.resolutionStatus = 'resolved'; attempt.resolutionNotes = notes;
      attempt.resolvedAt = new Date(); attempt.resolvedBy = req.user._id;
    } else if (req.params.issueType === 'complaint') {
      const complaint = delivery.complaints.id(req.params.issueId);
      if (!complaint) return res.status(404).json({ message: 'Delivery complaint not found.' });
      complaint.status = 'resolved'; complaint.resolvedAt = new Date();
      complaint.resolutionNotes = notes; complaint.resolvedBy = req.user._id;
    } else return res.status(400).json({ message: 'Invalid delivery issue type.' });
    await delivery.save();
    res.json({ message: 'Delivery issue resolved.' });
  } catch (error) {
    console.error('Resolve delivery issue error:', error);
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Unable to resolve the delivery issue.' });
  }
};

module.exports = {
  getLogisticsDashboard,
  getDeliveries,
  getDeliveryDetails,
  getDeliveryIssues,
  resolveDeliveryIssue
};
