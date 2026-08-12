const crypto = require('crypto');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const Product = require('../models/Product');
const Pet = require('../models/Pet');
const AdoptionRequest = require('../models/AdoptionRequest');
const PaymentWebhookEvent = require('../models/PaymentWebhookEvent');
const PayMongo = require('../services/paymongoService');
const { prepareForPayment } = require('../services/bookingLifecycleService');
const {
  amountCentavos,
  reconcilePaidSession,
  markSessionFailed,
  finalizeOrder,
  finalizeBooking,
  finalizeAdoption
} = require('../services/paymentReconciliationService');

const PAYMONGO_WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;
const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
let FRONTEND_URL = process.env.FRONTEND_URL;
if (!FRONTEND_URL || FRONTEND_URL.includes('localhost')) {
  FRONTEND_URL = isProduction ? 'https://pawzzle.io' : 'http://localhost:3000';
}

const sessionHistory = record => record.paymentDetails?.sessionHistory || [];

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

const updateSessionStatus = async (record, status) => {
  record.paymentDetails.sessionStatus = status;
  const row = sessionHistory(record).find(item => item.sessionId === record.paymentDetails.sessionId);
  if (row) row.status = status;
  await record.save();
};

const getReusableSession = async record => {
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
    await updateSessionStatus(record, 'expired');
    return null;
  } catch (error) {
    if (error.statusCode) throw error;
    if (error.response?.status === 404) return null;
    throw error;
  }
};

const ensureCheckoutSession = async ({ record, type, attributes }) => {
  const existing = await getReusableSession(record);
  if (existing) {
    if (type === 'adoption') record.paymentDetails.paymentStatus = 'payment_pending';
    else record.paymentStatus = 'pending';
    await record.save();
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
  await saveCheckoutSession(record, type, session, version);
  return session;
};

const createCheckoutSession = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).populate('customer').populate('store');
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    if (order.status === 'cancelled') return res.status(400).json({ message: 'Cannot pay for a cancelled order.' });
    if (order.paymentStatus === 'paid') return res.status(409).json({ message: 'This order is already paid.' });
    if (String(order.customer._id) !== String(req.user._id) && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied.' });
    }

    for (const item of order.items) {
      const current = item.itemType === 'product'
        ? await Product.findById(item.itemId).select('price stockQuantity isActive')
        : await Pet.findById(item.itemId).select('price isAvailable');
      const unavailable = !current
        || Number(current.price) !== Number(item.price)
        || (item.itemType === 'product' && (!current.isActive || current.stockQuantity < item.quantity))
        || (item.itemType === 'pet' && !current.isAvailable);
      if (unavailable) return res.status(409).json({ message: 'An item price or availability changed. Please recreate checkout.' });
    }

    const total = Number(order.pricingBreakdown?.finalTotal ?? order.totalAmount);
    if (!Number.isFinite(total) || total <= 0 || Math.abs(total - Number(order.totalAmount)) > 0.009) {
      return res.status(409).json({ message: 'Order amount is inconsistent. Please recreate checkout.' });
    }

    if (!order.invoiceSnapshot?.issuedAt) {
      const address = order.store?.contactInfo?.address;
      order.invoiceSnapshot = {
        issuedAt: new Date(),
        sellerName: order.store?.name || '',
        sellerAddress: address ? [address.street, address.barangay, address.city, address.state, address.zipCode].filter(Boolean).join(', ') : '',
        sellerTaxStatus: order.pricingBreakdown?.taxStatus || 'non_vat',
        pricingBreakdown: order.pricingBreakdown?.toObject?.() || order.pricingBreakdown || {}
      };
    }

    const session = await ensureCheckoutSession({
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
    if (String(booking.customer._id) !== String(req.user._id) && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied.' });
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
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to create payment session.' });
  }
};

const createAdoptionCheckoutSession = async (req, res) => {
  try {
    const adoption = await AdoptionRequest.findById(req.params.requestId).populate('customer').populate('pet');
    if (!adoption) return res.status(404).json({ message: 'Adoption request not found.' });
    if (adoption.status === 'cancelled') return res.status(400).json({ message: 'Cannot pay for a cancelled inquiry.' });
    const authorized = String(adoption.customer._id) === String(req.user._id)
      || String(adoption.seller) === String(req.user._id)
      || req.user.role === 'super_admin';
    if (!authorized) return res.status(403).json({ message: 'Access denied.' });

    const dueCentavos = amountCentavos(adoption, 'adoption');
    if (dueCentavos <= 0) return res.status(409).json({ message: 'This adoption payment is already complete.' });

    const session = await ensureCheckoutSession({
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
    res.json({ checkoutUrl: session.attributes.checkout_url });
  } catch (error) {
    console.error('PayMongo adoption checkout error:', error.response?.data || error.message);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to create payment session.' });
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
      await reconcilePaidSession(resource);
    } else if (eventType === 'checkout_session.payment.failed' || eventType === 'payment.failed') {
      await markSessionFailed(resource);
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
  return adoption ? { type: 'adoption', record: adoption } : null;
};

const verifyPayment = async (req, res) => {
  try {
    const target = await findTargetById(req.params.orderId);
    if (!target) return res.status(404).json({ message: 'Transaction not found.' });
    const isCustomer = String(target.record.customer) === String(req.user._id);
    const isSeller = target.type === 'adoption' && String(target.record.seller) === String(req.user._id);
    const isStoreOperator = ['admin', 'store_owner', 'staff'].includes(req.user.role)
      && (String(target.record.addedBy) === String(req.user._id)
        || (req.user.store && String(target.record.store) === String(req.user.store)));
    if (!isCustomer && !isSeller && !isStoreOperator && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied.' });
    }
    if (!target.record.paymentDetails?.sessionId) return res.status(400).json({ message: 'No PayMongo session exists for this transaction.' });

    const session = await PayMongo.getCheckoutSession(target.record.paymentDetails.sessionId);
    const payment = PayMongo.getPaidPayment(session);
    if (payment) {
      let record;
      if (target.type === 'order') record = await finalizeOrder(target.record, payment);
      else if (target.type === 'booking') record = await finalizeBooking(target.record, payment);
      else record = await finalizeAdoption(target.record, payment);
      const status = target.type === 'adoption' ? record.paymentDetails.paymentStatus : record.paymentStatus;
      return res.json({ status, [target.type]: record });
    }

    if (session.attributes?.status === 'expired') await updateSessionStatus(target.record, 'expired');
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
    if (String(target.record.customer) !== String(req.user._id) && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied.' });
    }
    const sessionId = target.record.paymentDetails?.sessionId;
    if (!sessionId) return res.status(400).json({ message: 'No active PayMongo session exists.' });

    const session = await PayMongo.getCheckoutSession(sessionId);
    const paidPayment = PayMongo.getPaidPayment(session);
    if (paidPayment) {
      if (target.type === 'order') await finalizeOrder(target.record, paidPayment);
      else if (target.type === 'booking') await finalizeBooking(target.record, paidPayment);
      else await finalizeAdoption(target.record, paidPayment);
      return res.status(409).json({ message: 'PayMongo already confirmed this payment; it cannot be cancelled.' });
    }
    if (session.attributes?.status === 'active') await PayMongo.expireCheckoutSession(sessionId);

    target.record.paymentDetails.sessionStatus = 'expired';
    const historyRow = sessionHistory(target.record).find(row => row.sessionId === sessionId);
    if (historyRow) historyRow.status = 'expired';
    if (target.type === 'adoption') {
      target.record.paymentDetails.method = 'paymongo';
      target.record.paymentDetails.paymentStatus = 'payment_cancelled';
    } else if (target.record.paymentStatus !== 'paid') {
      target.record.paymentMethod = 'paymongo';
      target.record.paymentStatus = 'cancelled';
    }
    await target.record.save();
    const status = target.type === 'adoption' ? target.record.paymentDetails.paymentStatus : target.record.paymentStatus;
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
  handleWebhook,
  verifyPayment,
  cancelPayment
};
