const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const Product = require('../models/Product');
const Pet = require('../models/Pet');
const AdoptionRequest = require('../models/AdoptionRequest');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProcurementReceivingReport = require('../models/ProcurementReceivingReport');
const PaymentWebhookEvent = require('../models/PaymentWebhookEvent');
const PayMongo = require('../services/paymongoService');
const { prepareForPayment } = require('../services/bookingLifecycleService');
const {
  amountCentavos,
  reconcilePaidSession,
  markSessionFailed,
  finalizeOrder,
  finalizeBooking,
  finalizeAdoption,
  finalizeProcurement
} = require('../services/paymentReconciliationService');
const { isPlatformAdmin, isStoreAdmin, isOperationalStaff, hasPermission } = require('../config/permissions');
const { canAccessStore, canOperateStore } = require('../utils/authorizationPolicy');
const { requiresAcknowledgment } = require('../utils/refundPolicy');
const { assertStoreTransactionEligible } = require('../services/storeComplianceService');
const {
  getPetAvailabilityIssue,
  releasePetReservation,
  reservePetForAdoption,
  reservePetForOrder
} = require('../services/petAvailabilityService');

const PAYMONGO_WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;
const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
let FRONTEND_URL = process.env.FRONTEND_URL;
if (!FRONTEND_URL || FRONTEND_URL.includes('localhost')) {
  FRONTEND_URL = isProduction ? 'https://pawzzle.io' : 'http://localhost:3000';
}

const sessionHistory = record => record.paymentDetails?.sessionHistory || [];
const PROCUREMENT_CHECKOUT_BLOCKED_STATUSES = [
  'cancelled', 'returned', 'issue_reported', 'pending_supplier_resolution',
  'resolution_submitted', 'resolution_accepted', 'resolution_rejected',
  'awaiting_replacement', 'reinspection', 'completed'
];

const procurementCheckoutEligibilityFilter = record => ({
  _id: record._id,
  status: { $eq: record.status, $nin: PROCUREMENT_CHECKOUT_BLOCKED_STATUSES },
  paymentStatus: { $eq: record.paymentStatus, $nin: ['paid', 'settled'] },
  $and: [
    {
      $or: [
        { 'paymentDetails.paymentId': { $exists: false } },
        { 'paymentDetails.paymentId': null }
      ]
    },
    Number(record.paymentDetails?.sessionVersion || 0) === 0
      ? {
          $or: [
            { 'paymentDetails.sessionVersion': 0 },
            { 'paymentDetails.sessionVersion': { $exists: false } }
          ]
        }
      : { 'paymentDetails.sessionVersion': Number(record.paymentDetails.sessionVersion) },
    Number(record.paidAmount || 0) === 0
      ? { $or: [{ paidAmount: 0 }, { paidAmount: { $exists: false } }] }
      : { paidAmount: Number(record.paidAmount) },
    Number(record.approvedAdjustmentTotal || 0) === 0
      ? { $or: [{ approvedAdjustmentTotal: 0 }, { approvedAdjustmentTotal: { $exists: false } }] }
      : { approvedAdjustmentTotal: Number(record.approvedAdjustmentTotal) },
    record.paymentDetails?.sessionId
      ? { 'paymentDetails.sessionId': record.paymentDetails.sessionId }
      : {
          $or: [
            { 'paymentDetails.sessionId': { $exists: false } },
            { 'paymentDetails.sessionId': null }
          ]
        }
  ]
});

const expireUnattachedCheckoutSession = async session => {
  if (!session?.id || session.attributes?.status !== 'active') return;
  try {
    await PayMongo.expireCheckoutSession(session.id);
  } catch (error) {
    console.error(`Unable to expire unattached PayMongo session ${session.id}:`, error.response?.data || error.message);
  }
};

const attachProcurementCheckoutSession = async (record, checkoutSession, version) => {
  const createdAt = checkoutSession.attributes?.created_at
    ? new Date(checkoutSession.attributes.created_at * 1000)
    : new Date();
  const historyRow = {
    sessionId: checkoutSession.id,
    checkoutUrl: checkoutSession.attributes.checkout_url,
    status: checkoutSession.attributes.status || 'active',
    createdAt
  };
  const attached = await PurchaseOrder.findOneAndUpdate(
    procurementCheckoutEligibilityFilter(record),
    {
      $set: {
        paymentMethod: 'paymongo',
        paymentStatus: 'pending',
        'paymentDetails.sessionId': checkoutSession.id,
        'paymentDetails.checkoutUrl': checkoutSession.attributes.checkout_url,
        'paymentDetails.sessionStatus': checkoutSession.attributes.status || 'active',
        'paymentDetails.sessionVersion': version,
        'paymentDetails.sessionCreatedAt': createdAt,
        'paymentDetails.failureReason': null,
        updatedAt: new Date()
      },
      $push: { 'paymentDetails.sessionHistory': historyRow }
    },
    { new: true, runValidators: true }
  );
  if (attached) return attached;

  const current = await PurchaseOrder.findById(record._id);
  if (current?.paymentDetails?.sessionId === checkoutSession.id
      && current.paymentDetails?.sessionStatus === 'active'
      && !PROCUREMENT_CHECKOUT_BLOCKED_STATUSES.includes(current.status)
      && !['paid', 'settled'].includes(current.paymentStatus)) {
    return current;
  }

  await expireUnattachedCheckoutSession(checkoutSession);
  const error = new Error('The purchase order changed while PayMongo checkout was being created. Start payment again from the current order state.');
  error.statusCode = 409;
  throw error;
};

const markReusableProcurementSession = async (record, checkoutSession) => {
  const current = await PurchaseOrder.findOneAndUpdate({
    _id: record._id,
    status: { $nin: PROCUREMENT_CHECKOUT_BLOCKED_STATUSES },
    paymentStatus: { $nin: ['paid', 'settled'] },
    'paymentDetails.sessionId': checkoutSession.id,
    'paymentDetails.sessionStatus': { $ne: 'expired' },
    $or: [
      { 'paymentDetails.paymentId': { $exists: false } },
      { 'paymentDetails.paymentId': null }
    ]
  }, {
    $set: {
      paymentMethod: 'paymongo',
      paymentStatus: 'pending',
      'paymentDetails.sessionStatus': 'active',
      updatedAt: new Date()
    }
  }, { new: true, runValidators: true });
  if (current) return current;

  const authoritative = await PurchaseOrder.findById(record._id);
  const error = new Error(['paid', 'settled'].includes(authoritative?.paymentStatus)
    ? 'This purchase order is already financially settled.'
    : 'This purchase order is no longer eligible for the existing PayMongo checkout.');
  error.statusCode = 409;
  throw error;
};

const releaseTransactionPetReservations = async (type, record) => {
  if (type === 'adoption' && record.pet) {
    await releasePetReservation({
      petId: record.pet?._id || record.pet,
      source: 'adoption',
      referenceId: record._id
    });
  }
  if (type === 'order') {
    await Promise.all((record.items || [])
      .filter(item => item.itemType === 'pet')
      .map(item => releasePetReservation({ petId: item.itemId, source: 'order', referenceId: record._id })));
  }
};

const emitPaymentDashboardUpdate = (req, type, record, status) => {
  const io = req.app.get('socketio');
  if (!io || !record || type === 'adoption') return;
  const payload = { type: 'payment', resourceType: type, id: String(record._id), status, timestamp: new Date() };
  if (record.store) io.to(`store_${String(record.store?._id || record.store)}`).emit('dashboardUpdate', payload);
  io.to('admin_global').emit('dashboardUpdate', payload);
};

const saveCheckoutSession = async (record, type, session, version) => {
  if (!record.paymentDetails) record.paymentDetails = {};
  if (!Array.isArray(record.paymentDetails.sessionHistory)) record.paymentDetails.sessionHistory = [];
  const createdAt = session.attributes?.created_at
    ? new Date(session.attributes.created_at * 1000)
    : new Date();
  record.paymentDetails.sessionId = session.id;
  record.paymentDetails.checkoutUrl = session.attributes.checkout_url;
  record.paymentDetails.sessionStatus = session.attributes.status || 'active';
  record.paymentDetails.sessionVersion = version;
  record.paymentDetails.sessionCreatedAt = createdAt;
  if (type !== 'adoption') record.paymentDetails.failureReason = undefined;
  if (!sessionHistory(record).some(row => row.sessionId === session.id)) {
    record.paymentDetails.sessionHistory.push({
      sessionId: session.id,
      checkoutUrl: session.attributes.checkout_url,
      status: session.attributes.status || 'active',
      createdAt
    });
  }
  if (type === 'adoption') {
    record.paymentDetails.method = 'paymongo';
    record.paymentDetails.paymentStatus = 'payment_pending';
  } else {
    record.paymentMethod = 'paymongo';
    record.paymentStatus = 'pending';
  }
  await record.save();
};

const updateSessionStatus = async (record, status, type) => {
  if (type === 'procurement') {
    const updateFields = {
      'paymentDetails.sessionStatus': status,
      updatedAt: new Date()
    };
    const hasHistoryRow = sessionHistory(record)
      .some(row => row.sessionId === record.paymentDetails?.sessionId);
    if (hasHistoryRow) updateFields['paymentDetails.sessionHistory.$[sessionRow].status'] = status;
    const current = await PurchaseOrder.findOneAndUpdate({
      _id: record._id,
      paymentStatus: { $nin: ['paid', 'settled'] },
      'paymentDetails.sessionId': record.paymentDetails?.sessionId,
      $or: [
        { 'paymentDetails.paymentId': { $exists: false } },
        { 'paymentDetails.paymentId': null }
      ]
    }, {
      $set: updateFields
    }, {
      new: true,
      ...(hasHistoryRow ? { arrayFilters: [{ 'sessionRow.sessionId': record.paymentDetails?.sessionId }] } : {})
    });
    return current || PurchaseOrder.findById(record._id);
  }
  record.paymentDetails.sessionStatus = status;
  const row = sessionHistory(record).find(item => item.sessionId === record.paymentDetails.sessionId);
  if (row) row.status = status;
  await record.save();
  return record;
};

const getReusableSession = async (record, type) => {
  const sessionId = record.paymentDetails?.sessionId;
  if (!sessionId || record.paymentDetails?.sessionStatus === 'expired') return null;
  try {
    const session = await PayMongo.getCheckoutSession(sessionId);
    const paidPayment = PayMongo.getPaidPayment(session);
    if (paidPayment) {
      await reconcilePaidSession(session);
      const error = new Error('This transaction is already paid.');
      error.statusCode = 409;
      throw error;
    }
    if (session.attributes?.status === 'active') return session;
    const current = await updateSessionStatus(record, 'expired', type);
    if (type === 'procurement' && ['paid', 'settled'].includes(current?.paymentStatus)) {
      const error = new Error('This purchase order is already financially settled.');
      error.statusCode = 409;
      throw error;
    }
    if (type === 'procurement'
        && current?.paymentDetails?.sessionId
        && current.paymentDetails.sessionId !== sessionId) {
      const error = new Error('A newer PayMongo checkout session is already authoritative for this purchase order.');
      error.statusCode = 409;
      throw error;
    }
    await releaseTransactionPetReservations(type, record);
    return null;
  } catch (error) {
    if (error.statusCode) throw error;
    if (error.response?.status === 404) {
      await releaseTransactionPetReservations(type, record);
      return null;
    }
    throw error;
  }
};

const ensureCheckoutSession = async ({ record, type, attributes }) => {
  const existing = await getReusableSession(record, type);
  if (existing) {
    if (type === 'procurement') await markReusableProcurementSession(record, existing);
    else {
      if (type === 'adoption') record.paymentDetails.paymentStatus = 'payment_pending';
      else record.paymentStatus = 'pending';
      await record.save();
    }
    return existing;
  }

  const version = Number(record.paymentDetails?.sessionVersion || 0) + 1;
  const session = await PayMongo.createCheckoutSession({
    ...attributes,
    metadata: {
      ...(attributes.metadata || {}),
      record_type: type,
      record_id: String(record._id)
    }
  }, PayMongo.buildCheckoutIdempotencyKey(type, record._id, version));
  if (type === 'procurement') await attachProcurementCheckoutSession(record, session, version);
  else await saveCheckoutSession(record, type, session, version);
  return session;
};

const createCheckoutSession = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).populate('customer').populate('store');
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    if (order.status === 'cancelled') return res.status(400).json({ message: 'Cannot pay for a cancelled order.' });
    if (order.paymentStatus === 'paid') return res.status(409).json({ message: 'This order is already paid.' });
    if (String(order.customer._id) !== String(req.user._id) && !isPlatformAdmin(req.user)) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    assertStoreTransactionEligible(order.store, { requireTax: true });
    if (requiresAcknowledgment(order.refundPolicySnapshot || order.store?.refundPolicy)
        && !order.refundPolicyAcknowledgment?.acknowledged) {
      return res.status(409).json({ message: 'Acknowledge the store No Refund policy before starting PayMongo.' });
    }

    for (const item of order.items) {
      const current = item.itemType === 'product'
        ? await Product.findById(item.itemId).select('price stockQuantity isActive')
        : await Pet.findById(item.itemId).select('price isAvailable status quantity reservation isDeleted name');
      const reservedForThisOrder = item.itemType === 'pet'
        && String(current?.reservation?.order || '') === String(order._id);
      const petIssue = item.itemType === 'pet' && !reservedForThisOrder
        ? getPetAvailabilityIssue(current, item.quantity)
        : null;
      const unavailable = !current
        || Number(current.price) !== Number(item.price)
        || (item.itemType === 'product' && (!current.isActive || current.stockQuantity < item.quantity))
        || Boolean(petIssue);
      if (unavailable) return res.status(409).json({ message: 'An item price or availability changed. Please recreate checkout.' });
    }

    const recordedPricing = order.pricingBreakdown?.calculationVersion ? order.pricingBreakdown : null;
    const total = Number(recordedPricing?.finalTotal ?? order.totalAmount);
    if (!Number.isFinite(total) || total <= 0 || Math.abs(total - Number(order.totalAmount)) > 0.009) {
      return res.status(409).json({ message: 'Order amount is inconsistent. Please recreate checkout.' });
    }

    const petItems = order.items.filter(item => item.itemType === 'pet');
    const reservedPetIds = [];
    for (const item of petItems) {
      const reserved = await reservePetForOrder(item.itemId, order._id);
      if (!reserved) {
        await Promise.all(reservedPetIds.map(petId => releasePetReservation({ petId, source: 'order', referenceId: order._id })));
        return res.status(409).json({ message: `Pet "${item.name}" is already reserved or unavailable.` });
      }
      reservedPetIds.push(item.itemId);
    }

    if (!order.invoiceSnapshot?.issuedAt) {
      const address = order.store?.contactInfo?.address;
      order.invoiceSnapshot = {
        issuedAt: new Date(),
        sellerName: order.store?.name || '',
        sellerAddress: address ? [address.street, address.barangay, address.city, address.state, address.zipCode].filter(Boolean).join(', ') : '',
        sellerTaxStatus: recordedPricing?.taxStatus || 'unrecorded',
        pricingBreakdown: recordedPricing?.toObject?.() || recordedPricing || {},
        deliveryFeeCalculation: order.deliveryFeeCalculation?.toObject?.() || order.deliveryFeeCalculation || null
      };
    }

    let session;
    try {
      session = await ensureCheckoutSession({
        record: order,
        type: 'order',
        attributes: {
        send_email_receipt: true,
        show_description: true,
        show_line_items: true,
        description: `Payment for Order #${order.orderNumber}`,
        line_items: [{ amount: amountCentavos(order, 'order'), currency: 'PHP', name: `Order ${order.orderNumber}`, quantity: 1 }],
        payment_method_types: ['card', 'gcash', 'paymaya', 'dob', 'dob_ubp'],
        success_url: `${FRONTEND_URL}/orders/${order._id}?payment=success`,
        cancel_url: `${FRONTEND_URL}/checkout?payment=cancelled&type=order&id=${order._id}`,
        reference_number: order.orderNumber
        }
      });
    } catch (error) {
      const refreshed = await Order.findById(order._id);
      if (refreshed?.paymentDetails?.sessionStatus !== 'active') {
        await releaseTransactionPetReservations('order', order);
      }
      throw error;
    }
    res.json({ checkoutUrl: session.attributes.checkout_url });
  } catch (error) {
    console.error('PayMongo order checkout error:', error.response?.data || error.message);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to create payment session.' });
  }
};

const createBookingCheckoutSession = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId).populate('customer').populate('service').populate('store');
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });
    if (booking.status !== 'awaiting_payment') {
      return res.status(409).json({
        message: booking.status === 'awaiting_customer_confirmation'
          ? 'Review and accept the assigned staff and booking details before payment.'
          : 'This booking is not currently eligible for payment.'
      });
    }
    if (booking.paymentStatus === 'paid') return res.status(409).json({ message: 'This booking is already paid.' });
    if (String(booking.customer._id) !== String(req.user._id) && !isPlatformAdmin(req.user)) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    assertStoreTransactionEligible(booking.store, { requireTax: true });
    if (requiresAcknowledgment(booking.refundPolicySnapshot || booking.store?.refundPolicy)
        && !booking.refundPolicyAcknowledgment?.acknowledged) {
      return res.status(409).json({ message: 'Acknowledge the store No Refund policy before starting PayMongo.' });
    }

    const priorTotal = Number(booking.totalPrice);
    await prepareForPayment(booking);
    if (booking.paymentDetails?.sessionId && Math.abs(priorTotal - Number(booking.totalPrice)) > 0.009) {
      try { await PayMongo.expireCheckoutSession(booking.paymentDetails.sessionId); } catch (_) { /* create a fresh authoritative session */ }
      await updateSessionStatus(booking, 'expired');
    }
    booking.paymentStatus = 'pending';
    await booking.save();

    const total = Number(booking.pricingBreakdown?.finalPrice ?? booking.totalPrice);
    if (!Number.isFinite(total) || total <= 0 || Math.abs(total - Number(booking.totalPrice)) > 0.009) {
      return res.status(409).json({ message: 'Booking amount is inconsistent. Please recreate the booking.' });
    }

    if (!booking.invoiceSnapshot?.issuedAt) {
      const address = booking.store?.contactInfo?.address;
      booking.invoiceSnapshot = {
        issuedAt: new Date(),
        sellerName: booking.store?.name || '',
        sellerAddress: address ? [address.street, address.barangay, address.city, address.state, address.zipCode].filter(Boolean).join(', ') : '',
        sellerTaxStatus: booking.pricingBreakdown?.taxStatus || 'non_vat',
        pricingBreakdown: booking.pricingBreakdown?.toObject?.() || booking.pricingBreakdown || {}
      };
    }

    const session = await ensureCheckoutSession({
      record: booking,
      type: 'booking',
      attributes: {
        send_email_receipt: true,
        show_description: true,
        show_line_items: true,
        description: `Booking for ${booking.service.name}`,
        line_items: [{ amount: amountCentavos(booking, 'booking'), currency: 'PHP', name: booking.service.name, quantity: 1 }],
        payment_method_types: ['card', 'gcash', 'paymaya', 'dob', 'dob_ubp'],
        success_url: `${FRONTEND_URL}/bookings?payment=success&id=${booking._id}`,
        cancel_url: `${FRONTEND_URL}/bookings?payment=cancelled&type=booking&id=${booking._id}`,
        reference_number: `BK-${booking._id.toString().slice(-8).toUpperCase()}`
      }
    });
    res.json({ checkoutUrl: session.attributes.checkout_url });
  } catch (error) {
    console.error('PayMongo booking checkout error:', error.response?.data || error.message);
    const isTaxPending = error.code === 'STORE_TAX_VERIFICATION_REQUIRED';
    res.status(error.statusCode || 500).json({
      code: error.code,
      message: isTaxPending
        ? "Payment is unavailable until the Store's tax information is verified. Your booking proposal is still saved."
        : (error.message || 'Failed to create payment session.')
    });
  }
};

const createAdoptionCheckoutSession = async (req, res) => {
  try {
    const adoption = await AdoptionRequest.findById(req.params.requestId).populate('customer').populate('pet');
    if (!adoption) return res.status(404).json({ message: 'Adoption request not found.' });
    if (['cancelled', 'declined', 'expired', 'completed'].includes(adoption.status)) {
      return res.status(400).json({ message: `Cannot pay for an inquiry that is ${adoption.status}.` });
    }
    const authorized = String(adoption.customer._id) === String(req.user._id)
      || String(adoption.seller) === String(req.user._id)
      || isPlatformAdmin(req.user);
    if (!authorized) return res.status(403).json({ message: 'Access denied.' });

    const reservedForThisRequest = String(adoption.pet?.reservation?.adoptionRequest || '') === String(adoption._id);
    const availabilityIssue = reservedForThisRequest ? null : getPetAvailabilityIssue(adoption.pet, 1);
    if (availabilityIssue) return res.status(409).json({ message: availabilityIssue });

    const dueCentavos = amountCentavos(adoption, 'adoption');
    if (dueCentavos <= 0) return res.status(409).json({ message: 'This adoption payment is already complete.' });

    const reservedPet = await reservePetForAdoption(adoption.pet._id, adoption._id);
    if (!reservedPet) return res.status(409).json({ message: 'This pet is already reserved or unavailable.' });

    let session;
    try {
      session = await ensureCheckoutSession({
        record: adoption,
        type: 'adoption',
        attributes: {
        send_email_receipt: true,
        show_description: true,
        show_line_items: true,
        description: `Adoption fee for ${adoption.pet.name}`,
        line_items: [{ amount: dueCentavos, currency: 'PHP', name: `Pet purchase: ${adoption.pet.name}`, quantity: 1 }],
        payment_method_types: ['card', 'gcash', 'paymaya', 'dob', 'dob_ubp'],
        success_url: `${FRONTEND_URL}/pets/${adoption.pet._id}?payment=success&id=${adoption._id}`,
        cancel_url: `${FRONTEND_URL}/pets/${adoption.pet._id}?payment=cancelled&type=adoption&id=${adoption._id}`,
        reference_number: `AD-${adoption._id.toString().slice(-8).toUpperCase()}`
        }
      });
    } catch (error) {
      const refreshed = await AdoptionRequest.findById(adoption._id);
      if (refreshed?.paymentDetails?.sessionStatus !== 'active') {
        await releaseTransactionPetReservations('adoption', adoption);
      }
      throw error;
    }
    res.json({ checkoutUrl: session.attributes.checkout_url });
  } catch (error) {
    console.error('PayMongo adoption checkout error:', error.response?.data || error.message);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to create payment session.' });
  }
};

const createProcurementCheckoutSession = async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.purchaseOrderId).populate('supplier', 'businessName');
    if (!order) return res.status(404).json({ message: 'Purchase order not found.' });
    if (!(isPlatformAdmin(req.user) || await canOperateStore(req.user, order.store, ['procurement.manage', 'finance.manage']))) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    if (PROCUREMENT_CHECKOUT_BLOCKED_STATUSES.includes(order.status)) {
      return res.status(409).json({ message: `This purchase order cannot be paid while it is ${order.status.replaceAll('_', ' ')}.` });
    }
    if (['paid', 'settled'].includes(order.paymentStatus)) return res.status(409).json({ message: 'This purchase order is already financially settled.' });
    if (order.paymentTiming === 'after_inspection') {
      const report = await ProcurementReceivingReport.findOne({ purchaseOrder: order._id, store: order.store });
      if (!report || report.processingStatus !== 'completed'
          || !['not_required', 'resolved'].includes(report.resolutionStatus)
          || !report.paymentReady) {
        return res.status(409).json({ message: 'Payment becomes available after the delivered purchase order passes receiving inspection.' });
      }
    }
    const dueCentavos = amountCentavos(order, 'procurement');
    if (dueCentavos <= 0) return res.status(409).json({ message: 'This purchase order has no outstanding balance.' });

    const session = await ensureCheckoutSession({
      record: order,
      type: 'procurement',
      attributes: {
        send_email_receipt: true,
        show_description: true,
        show_line_items: true,
        description: `Procurement payment for ${order.orderNumber}`,
        line_items: [{
          amount: dueCentavos,
          currency: 'PHP',
          name: `${order.orderNumber} - ${order.supplier?.businessName || 'Supplier'}`,
          quantity: 1
        }],
        payment_method_types: ['card', 'gcash', 'paymaya', 'dob', 'dob_ubp'],
        success_url: `${FRONTEND_URL}/admin/purchase-orders?payment=success&id=${order._id}`,
        cancel_url: `${FRONTEND_URL}/admin/purchase-orders?payment=cancelled&id=${order._id}`,
        reference_number: order.orderNumber
      }
    });
    res.json({ checkoutUrl: session.attributes.checkout_url });
  } catch (error) {
    console.error('PayMongo procurement checkout error:', error.response?.data || error.message);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to create procurement payment session.' });
  }
};

const isValidWebhookSignature = req => {
  if (!PAYMONGO_WEBHOOK_SECRET) return !isProduction;
  const signatureHeader = req.get('Paymongo-Signature');
  if (!signatureHeader || !req.rawBody) return false;
  const parts = Object.fromEntries(signatureHeader.split(',').map(part => part.trim().split('=')));
  const timestamp = parts.t;
  const signature = process.env.PAYMONGO_SECRET_KEY?.startsWith('sk_live_') ? parts.li : parts.te;
  if (!timestamp || !signature || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = crypto.createHmac('sha256', PAYMONGO_WEBHOOK_SECRET)
    .update(`${timestamp}.${req.rawBody.toString('utf8')}`).digest('hex');
  const supplied = Buffer.from(signature, 'hex');
  const calculated = Buffer.from(expected, 'hex');
  return supplied.length === calculated.length && crypto.timingSafeEqual(supplied, calculated);
};

const claimWebhookEvent = async event => {
  const existing = await PaymentWebhookEvent.findOne({ eventId: event.id });
  if (existing?.status === 'completed') return null;
  const processingIsFresh = existing?.status === 'processing'
    && existing.updatedAt
    && Date.now() - new Date(existing.updatedAt).getTime() < 5 * 60 * 1000;
  if (processingIsFresh) return null;
  if (existing) {
    existing.status = 'processing';
    existing.attempts += 1;
    existing.lastError = undefined;
    await existing.save();
    return existing;
  }
  try {
    return await PaymentWebhookEvent.create({ eventId: event.id, eventType: event.attributes.type });
  } catch (error) {
    if (error.code === 11000) return null;
    throw error;
  }
};

const handleWebhook = async (req, res) => {
  if (!isValidWebhookSignature(req)) return res.status(401).json({ message: 'Invalid PayMongo webhook signature.' });
  const event = req.body?.data;
  if (!event?.id || !event?.attributes?.type || !event.attributes.data) {
    return res.status(400).json({ message: 'Invalid webhook payload.' });
  }

  let receipt;
  try {
    receipt = await claimWebhookEvent(event);
    if (!receipt) return res.sendStatus(200);
    const eventType = event.attributes.type;
    const resource = event.attributes.data;
    if (eventType === 'checkout_session.payment.paid') {
      const reconciled = await reconcilePaidSession(resource);
      if (reconciled) emitPaymentDashboardUpdate(req, reconciled.type, reconciled.record, 'paid');
    } else if (eventType === 'checkout_session.payment.failed' || eventType === 'payment.failed') {
      const failed = await markSessionFailed(resource);
      if (failed) emitPaymentDashboardUpdate(req, failed.type, failed.record, 'failed');
    }
    receipt.status = 'completed';
    receipt.processedAt = new Date();
    await receipt.save();
    return res.sendStatus(200);
  } catch (error) {
    console.error('PayMongo webhook error:', error.message);
    if (receipt) {
      receipt.status = error.statusCode >= 400 && error.statusCode < 500 ? 'completed' : 'failed';
      receipt.lastError = error.message;
      if (receipt.status === 'completed') receipt.processedAt = new Date();
      await receipt.save().catch(() => {});
    }
    if (error.statusCode >= 400 && error.statusCode < 500) return res.sendStatus(200);
    return res.status(500).json({ message: 'Webhook processing failed.' });
  }
};

const findTargetById = async id => {
  const order = await Order.findById(id);
  if (order) return { type: 'order', record: order };
  const booking = await Booking.findById(id);
  if (booking) return { type: 'booking', record: booking };
  const adoption = await AdoptionRequest.findById(id);
  if (adoption) return { type: 'adoption', record: adoption };
  const procurement = await PurchaseOrder.findById(id);
  return procurement ? { type: 'procurement', record: procurement } : null;
};

const verifyPayment = async (req, res) => {
  try {
    const target = await findTargetById(req.params.orderId);
    if (!target) return res.status(404).json({ message: 'Transaction not found.' });
    const isCustomer = String(target.record.customer) === String(req.user._id);
    const isSeller = target.type === 'adoption' && String(target.record.seller) === String(req.user._id);
    const isStoreOperator = (isStoreAdmin(req.user) || isOperationalStaff(req.user))
      && target.record.store
      && await canAccessStore(req.user, target.record.store)
      && ['payments.manage', 'sales.manage', 'bookings.manage', 'finance.manage', 'procurement.manage']
        .some(permission => hasPermission(req.user, permission));
    if (!isCustomer && !isSeller && !isStoreOperator && !isPlatformAdmin(req.user)) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    if (!target.record.paymentDetails?.sessionId) return res.status(400).json({ message: 'No PayMongo session exists for this transaction.' });

    const session = await PayMongo.getCheckoutSession(target.record.paymentDetails.sessionId);
    const payment = PayMongo.getPaidPayment(session);
    if (payment) {
      let record;
      if (target.type === 'order') record = await finalizeOrder(target.record, payment);
      else if (target.type === 'booking') record = await finalizeBooking(target.record, payment);
      else if (target.type === 'adoption') record = await finalizeAdoption(target.record, payment);
      else record = await finalizeProcurement(target.record, payment);
      const status = target.type === 'adoption' ? record.paymentDetails.paymentStatus : record.paymentStatus;
      emitPaymentDashboardUpdate(req, target.type, record, status);
      return res.json({ status, [target.type]: record });
    }

    if (session.attributes?.status === 'expired') {
      target.record = await updateSessionStatus(target.record, 'expired', target.type);
      await releaseTransactionPetReservations(target.type, target.record);
      if (target.type === 'procurement' && ['paid', 'settled'].includes(target.record.paymentStatus)) {
        emitPaymentDashboardUpdate(req, target.type, target.record, target.record.paymentStatus);
        return res.json({ status: target.record.paymentStatus, procurement: target.record });
      }
    }
    const status = target.type === 'adoption'
      ? target.record.paymentDetails.paymentStatus
      : target.record.paymentStatus;
    return res.json({ status, sessionStatus: session.attributes?.status, message: 'Payment is not confirmed by PayMongo.' });
  } catch (error) {
    console.error('PayMongo verification error:', error.response?.data || error.message);
    res.status(error.statusCode || 500).json({ message: error.message || 'Payment verification failed.' });
  }
};

const cancelPayment = async (req, res) => {
  try {
    const target = await findTargetById(req.params.id);
    if (!target || target.type !== req.params.type) return res.status(404).json({ message: 'Transaction not found.' });
    const procurementOperator = target.type === 'procurement'
      && await canOperateStore(req.user, target.record.store, ['procurement.manage', 'finance.manage']);
    if (String(target.record.customer) !== String(req.user._id) && !procurementOperator && !isPlatformAdmin(req.user)) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    const sessionId = target.record.paymentDetails?.sessionId;
    if (!sessionId) return res.status(400).json({ message: 'No active PayMongo session exists.' });

    const session = await PayMongo.getCheckoutSession(sessionId);
    const paidPayment = PayMongo.getPaidPayment(session);
    if (paidPayment) {
      if (target.type === 'order') await finalizeOrder(target.record, paidPayment);
      else if (target.type === 'booking') await finalizeBooking(target.record, paidPayment);
      else if (target.type === 'adoption') await finalizeAdoption(target.record, paidPayment);
      else await finalizeProcurement(target.record, paidPayment);
      return res.status(409).json({ message: 'PayMongo already confirmed this payment; it cannot be cancelled.' });
    }
    let expiredSession = session;
    if (session.attributes?.status === 'active') expiredSession = await PayMongo.expireCheckoutSession(sessionId);
    const paidDuringExpiration = PayMongo.getPaidPayment(expiredSession);
    if (paidDuringExpiration) {
      if (target.type === 'order') await finalizeOrder(target.record, paidDuringExpiration);
      else if (target.type === 'booking') await finalizeBooking(target.record, paidDuringExpiration);
      else if (target.type === 'adoption') await finalizeAdoption(target.record, paidDuringExpiration);
      else await finalizeProcurement(target.record, paidDuringExpiration);
      return res.status(409).json({ message: 'PayMongo confirmed this payment while cancellation was in progress; it cannot be cancelled.' });
    }

    let cancelledRecord = target.record;
    if (target.type === 'procurement') {
      await mongoose.connection.transaction(async databaseSession => {
        const current = await PurchaseOrder.findById(target.record._id).session(databaseSession);
        if (!current) throw Object.assign(new Error('Purchase order not found.'), { statusCode: 404 });
        if (current.paymentDetails?.sessionId !== sessionId) {
          throw Object.assign(new Error('A newer PayMongo checkout session is already authoritative for this purchase order.'), { statusCode: 409 });
        }
        if (['paid', 'settled'].includes(current.paymentStatus)
            || current.paymentDetails?.paymentId) {
          throw Object.assign(new Error('PayMongo already confirmed this payment; it cannot be cancelled.'), { statusCode: 409 });
        }
        current.paymentDetails.sessionStatus = 'expired';
        const currentHistoryRow = sessionHistory(current).find(row => row.sessionId === sessionId);
        if (currentHistoryRow) currentHistoryRow.status = 'expired';
        current.paymentMethod = 'paymongo';
        current.paymentStatus = Number(current.paidAmount || 0) > 0
          ? 'partially_paid'
          : (current.paymentTiming === 'after_inspection' ? 'awaiting_payment' : 'unpaid');
        await current.save({ session: databaseSession });
        cancelledRecord = current;
      });
    } else if (target.type === 'adoption') {
      target.record.paymentDetails.sessionStatus = 'expired';
      const historyRow = sessionHistory(target.record).find(row => row.sessionId === sessionId);
      if (historyRow) historyRow.status = 'expired';
      target.record.paymentDetails.method = 'paymongo';
      target.record.paymentDetails.paymentStatus = 'payment_cancelled';
      await target.record.save();
    } else {
      target.record.paymentDetails.sessionStatus = 'expired';
      const historyRow = sessionHistory(target.record).find(row => row.sessionId === sessionId);
      if (historyRow) historyRow.status = 'expired';
      if (!['paid', 'settled'].includes(target.record.paymentStatus)) {
        target.record.paymentMethod = 'paymongo';
        target.record.paymentStatus = 'cancelled';
      }
      await target.record.save();
    }
    await releaseTransactionPetReservations(target.type, cancelledRecord);
    const status = target.type === 'adoption' ? cancelledRecord.paymentDetails.paymentStatus : cancelledRecord.paymentStatus;
    emitPaymentDashboardUpdate(req, target.type, cancelledRecord, status);
    res.json({ status, sessionStatus: 'expired' });
  } catch (error) {
    console.error('PayMongo cancellation error:', error.response?.data || error.message);
    res.status(error.statusCode || 502).json({ message: error.message || 'Could not cancel the PayMongo session.' });
  }
};

module.exports = {
  createCheckoutSession,
  createBookingCheckoutSession,
  createAdoptionCheckoutSession,
  createProcurementCheckoutSession,
  handleWebhook,
  verifyPayment,
  cancelPayment
};
