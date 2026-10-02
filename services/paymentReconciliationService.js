const mongoose = require('mongoose');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const AdoptionRequest = require('../models/AdoptionRequest');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProcurementPayment = require('../models/ProcurementPayment');
const StockSyncService = require('./stockSyncService');
const RevenueService = require('./revenueService');
const { createNotification } = require('../controllers/notificationController');
const { internalCreateDelivery } = require('../controllers/deliveryController');
const {
  releasePetReservation,
  reservePetForAdoption,
  reservePetForOrder
} = require('./petAvailabilityService');

const amountCentavos = (record, type) => {
  if (type === 'booking') return Math.round(Number(record.totalPrice) * 100);
  if (type === 'procurement') return Math.round(Math.max(
    0,
    Number(record.totalCost)
      - Number(record.paidAmount || 0)
      - Number(record.approvedAdjustmentTotal || 0)
  ) * 100);
  if (type === 'adoption') {
    const pricing = record.paymentDetails?.pricingBreakdown || {};
    const paid = Number(record.paymentDetails?.paidAmount || 0);
    const due = paid <= 0 && Number(pricing.depositAmount) > 0
      ? Number(pricing.depositAmount)
      : Math.max(0, Number(pricing.totalPrice) - paid);
    return Math.round(due * 100);
  }
  return Math.round(Number(record.totalAmount) * 100);
};

const finalizeProcurement = async (purchaseOrder, payment) => {
  if (!payment?.id) throw Object.assign(new Error('PayMongo payment identity is required.'), { statusCode: 400 });
  const amount = Number(payment.attributes?.amount || 0) / 100;
  let updated;
  let counted = false;
  let amountMismatch = false;
  try {
    await mongoose.connection.transaction(async session => {
      counted = false;
      amountMismatch = false;
      const current = await PurchaseOrder.findById(purchaseOrder._id).session(session);
      if (!current) throw Object.assign(new Error('Purchase order not found.'), { statusCode: 404 });
      if (current.status === 'cancelled') {
        throw Object.assign(new Error('A cancelled purchase order cannot accept a PayMongo payment.'), { statusCode: 409 });
      }

      let paymentRecord = await ProcurementPayment.findOne({ providerPaymentId: payment.id }).session(session);
      if (paymentRecord && String(paymentRecord.purchaseOrder) !== String(current._id)) {
        throw Object.assign(new Error('PayMongo payment is already associated with another purchase order.'), { statusCode: 409 });
      }

      const existingPaymentId = current.paymentDetails?.paymentId;
      if (existingPaymentId === payment.id) {
        updated = current;
        return;
      }

      const paymentRecordData = {
        store: current.store,
        purchaseOrder: current._id,
        supplier: current.supplier,
        transactionType: 'payment',
        amount,
        paymentDate: payment.attributes?.paid_at ? new Date(payment.attributes.paid_at * 1000) : new Date(),
        paymentMethod: 'paymongo',
        provider: 'paymongo',
        providerPaymentId: payment.id,
        checkoutSessionId: current.paymentDetails?.sessionId,
        reference: payment.attributes?.payment_intent_id || payment.id,
        recordedBy: current.seller
      };

      if (existingPaymentId && existingPaymentId !== payment.id) {
        if (!paymentRecord) {
          [paymentRecord] = await ProcurementPayment.create([{
            ...paymentRecordData,
            status: 'duplicate',
            notes: 'Additional verified PayMongo payment detected; excluded from authoritative paid totals.'
          }], { session });
        } else if (paymentRecord.status === 'recorded') {
          paymentRecord.status = 'duplicate';
          paymentRecord.notes = 'Additional verified PayMongo payment detected; excluded from authoritative paid totals.';
          await paymentRecord.save({ session });
        }
        const duplicateIds = current.paymentDetails?.duplicatePaymentIds || [];
        if (!duplicateIds.some(id => id === payment.id)) duplicateIds.push(payment.id);
        current.set('paymentDetails.duplicatePaymentIds', duplicateIds);
        current.set('paymentDetails.failureReason', 'An additional PayMongo payment was detected and was not counted twice.');
        await current.save({ session });
        updated = current;
        return;
      }

      if (!paymentMatches(current, 'procurement', payment)) {
        current.paymentStatus = 'failed';
        current.set('paymentDetails.failureReason', 'PayMongo amount did not match the authoritative procurement balance.');
        await current.save({ session });
        updated = current;
        amountMismatch = true;
        return;
      }

      if (!paymentRecord) {
        [paymentRecord] = await ProcurementPayment.create([{
          ...paymentRecordData,
          status: 'recorded'
        }], { session });
      }
      if (paymentRecord.status !== 'recorded') {
        throw Object.assign(new Error('This PayMongo payment is not eligible to be applied.'), { statusCode: 409 });
      }

      const adjustedTotal = Math.max(0, Number(current.totalCost) - Number(current.approvedAdjustmentTotal || 0));
      const nextPaidAmount = Math.min(adjustedTotal, Number(current.paidAmount || 0) + Number(paymentRecord.amount));
      current.paidAmount = nextPaidAmount;
      current.paymentStatus = nextPaidAmount >= adjustedTotal ? 'paid' : 'partially_paid';
      current.paymentMethod = 'paymongo';
      current.paymentReference = payment.id;
      current.paymentDate = new Date();
      current.set(getPaymentFields(payment));
      if (current.paymentStatus === 'paid'
          && ['accepted', 'resolved'].includes(current.inspectionStatus)
          && ['delivered', 'resolved'].includes(current.status)) {
        current.status = 'completed';
        current.completedAt = new Date();
      }
      await current.save({ session });
      counted = true;
      updated = current;
    });
  } catch (error) {
    if (error?.code === 11000) {
      const current = await PurchaseOrder.findById(purchaseOrder._id);
      if (current?.paymentDetails?.paymentId === payment.id) return current;
    }
    throw error;
  }

  if (amountMismatch) {
    const error = new Error('PayMongo amount does not match the procurement balance.');
    error.statusCode = 409;
    throw error;
  }

  if (counted) await Promise.allSettled([
    createNotification({
      recipient: purchaseOrder.seller,
      type: 'purchase_order',
      title: 'Procurement Payment Confirmed',
      message: `PayMongo confirmed payment for ${purchaseOrder.orderNumber}.`,
      relatedId: purchaseOrder._id,
      relatedModel: 'PurchaseOrder',
      targetUrl: `/admin/purchase-orders?id=${purchaseOrder._id}`
    })
  ]);
  return updated;
};

const paymentMatches = (record, type, payment) => Number(payment?.attributes?.amount) === amountCentavos(record, type);

const getPaymentFields = payment => ({
  'paymentDetails.paymentId': payment.id,
  'paymentDetails.paymentIntentId': payment.attributes?.payment_intent_id,
  'paymentDetails.sourceType': payment.attributes?.source?.type,
  'paymentDetails.amountPaid': Number(payment.attributes?.amount || 0) / 100,
  'paymentDetails.transactionDate': payment.attributes?.paid_at
    ? new Date(payment.attributes.paid_at * 1000)
    : new Date(),
  'paymentDetails.failureReason': null
});

const finalizeBooking = async (booking, payment) => {
  if (!paymentMatches(booking, 'booking', payment)) {
    await Booking.findByIdAndUpdate(booking._id, {
      $set: {
        paymentStatus: 'failed',
        'paymentDetails.failureReason': 'PayMongo amount did not match the authoritative booking total.'
      }
    });
    const error = new Error('PayMongo amount does not match the booking total.');
    error.statusCode = 409;
    throw error;
  }

  const existingPaymentId = booking.paymentDetails?.paymentId;
  if (existingPaymentId && existingPaymentId !== payment.id) {
    return Booking.findByIdAndUpdate(booking._id, {
      $addToSet: { 'paymentDetails.duplicatePaymentIds': payment.id },
      $set: { 'paymentDetails.failureReason': 'An additional PayMongo payment was detected and was not recorded as additional revenue.' }
    }, { new: true });
  }

  const bookingClosed = ['cancelled', 'confirmation_expired', 'rejected', 'no_show'].includes(booking.status);
  const claimed = await Booking.findOneAndUpdate({
    _id: booking._id,
    paymentStatus: { $ne: 'paid' },
    $or: [
      { 'paymentDetails.paymentId': { $exists: false } },
      { 'paymentDetails.paymentId': null },
      { 'paymentDetails.paymentId': payment.id }
    ]
  }, {
    $set: {
      paymentStatus: 'paid',
      paymentMethod: 'paymongo',
      ...(bookingClosed ? {} : {
        status: 'confirmed',
        'lifecycle.confirmedAt': new Date(),
        'serviceProgress.status': 'scheduled',
        'serviceProgress.scheduledAt': new Date()
      }),
      ...getPaymentFields(payment)
    }
  }, { new: true });

  if (!bookingClosed) await RevenueService.recordPayment('booking', booking._id);
  if (claimed && !existingPaymentId) {
    await Promise.all([
      createNotification({
        recipient: booking.addedBy,
        sender: booking.customer,
        type: 'booking_status',
        title: 'Payment Received',
        message: `PayMongo confirmed payment for booking #${String(booking._id).slice(-8).toUpperCase()}.`,
        relatedId: booking._id,
        relatedModel: 'Booking',
        targetUrl: `/admin/bookings?id=${booking._id}`
      }),
      createNotification({
        recipient: booking.customer,
        sender: booking.addedBy,
        type: 'booking_status',
        title: 'Payment Confirmed',
        message: bookingClosed
          ? 'Payment was received after this booking closed. The store has been notified for refund review.'
          : 'Your PayMongo payment was verified and your booking is now confirmed.',
        relatedId: booking._id,
        relatedModel: 'Booking',
        targetUrl: `/bookings?id=${booking._id}`
      }),
      ...(!bookingClosed && booking.staff ? [createNotification({
        recipient: booking.staff,
        sender: booking.customer,
        type: 'booking_status',
        title: 'Assigned Booking Confirmed',
        message: `PayMongo confirmed booking #${String(booking._id).slice(-8).toUpperCase()}.`,
        relatedId: booking._id,
        relatedModel: 'Booking',
        targetUrl: `/admin/bookings?id=${booking._id}`
      })] : [])
    ]);
  }
  return Booking.findById(booking._id);
};

const fulfillOrderOnce = async (orderId) => {
  const claimed = await Order.findOneAndUpdate({
    _id: orderId,
    'paymentDetails.fulfilledAt': { $exists: false },
    $or: [
      { 'paymentDetails.fulfillmentStatus': { $exists: false } },
      { 'paymentDetails.fulfillmentStatus': 'pending' }
    ]
  }, {
    $set: { 'paymentDetails.fulfillmentStatus': 'processing' }
  }, { new: true });

  if (!claimed) return Order.findById(orderId);

  const claimedPetIds = [];
  try {
    for (const item of claimed.items.filter(item => item.itemType === 'pet')) {
      const pet = await reservePetForOrder(item.itemId, claimed._id);
      if (!pet) throw new Error(`Pet "${item.name}" is already reserved or unavailable.`);
      claimedPetIds.push(item.itemId);
    }
    for (const item of claimed.items.filter(item => item.itemType === 'product')) {
      await StockSyncService.reduceStockOnOrder(item.itemId, item.quantity, claimed.store);
    }

    await createNotification({
      recipient: claimed.addedBy,
      sender: claimed.customer,
      type: 'order_status',
      title: 'Order Paid',
      message: `Order #${claimed.orderNumber} has been confirmed by PayMongo.`,
      relatedId: claimed._id,
      relatedModel: 'Order'
    });

    if (claimed.deliveryMethod === 'delivery') {
      await internalCreateDelivery({ orderId: claimed._id });
    }

    return Order.findByIdAndUpdate(claimed._id, {
      $set: {
        'paymentDetails.fulfilledAt': new Date(),
        'paymentDetails.fulfillmentStatus': 'completed'
      }
    }, { new: true });
  } catch (error) {
    await Promise.all(claimedPetIds.map(petId => releasePetReservation({
      petId,
      source: 'order',
      referenceId: claimed._id
    })));
    await Order.findByIdAndUpdate(claimed._id, {
      $set: {
        'paymentDetails.fulfillmentStatus': 'failed',
        'paymentDetails.failureReason': `Paid order fulfillment requires retry: ${error.message}`
      }
    });
    throw error;
  }
};

const finalizeOrder = async (order, payment) => {
  if (!paymentMatches(order, 'order', payment)) {
    await Order.findByIdAndUpdate(order._id, {
      $set: {
        paymentStatus: 'failed',
        status: 'payment_failed',
        'paymentDetails.failureReason': 'PayMongo amount did not match the authoritative order total.'
      }
    });
    const error = new Error('PayMongo amount does not match the order total.');
    error.statusCode = 409;
    throw error;
  }

  const existingPaymentId = order.paymentDetails?.paymentId;
  if (existingPaymentId && existingPaymentId !== payment.id) {
    return Order.findByIdAndUpdate(order._id, {
      $addToSet: { 'paymentDetails.duplicatePaymentIds': payment.id },
      $set: { 'paymentDetails.failureReason': 'An additional PayMongo payment was detected and was not recorded as additional revenue.' }
    }, { new: true });
  }

  const cancelled = order.status === 'cancelled';
  await Order.findOneAndUpdate({
    _id: order._id,
    $or: [
      { 'paymentDetails.paymentId': { $exists: false } },
      { 'paymentDetails.paymentId': null },
      { 'paymentDetails.paymentId': payment.id }
    ]
  }, {
    $set: {
      paymentStatus: 'paid',
      paymentMethod: 'paymongo',
      ...(cancelled ? {} : { status: 'confirmed' }),
      ...getPaymentFields(payment),
      ...(cancelled ? { 'paymentDetails.failureReason': 'Payment received after the order was cancelled; refund review is required.' } : {})
    }
  });

  if (cancelled) return Order.findById(order._id);
  await RevenueService.recordPayment('order', order._id);
  return fulfillOrderOnce(order._id);
};

const finalizeAdoption = async (adoption, payment) => {
  const alreadyRecorded = adoption.paymentDetails?.history?.some(row => row.paymentId === payment.id);
  if (alreadyRecorded) return adoption;

  if (['cancelled', 'declined', 'expired', 'completed'].includes(adoption.status)) {
    await AdoptionRequest.findByIdAndUpdate(adoption._id, {
      $set: { 'paymentDetails.paymentStatus': 'payment_failed' },
      $push: {
        'paymentDetails.history': {
          status: 'refund_review_required',
          amount: Number(payment.attributes?.amount || 0) / 100,
          paymentId: payment.id,
          description: `Payment received after the inquiry became ${adoption.status}`,
          timestamp: new Date()
        }
      }
    });
    const error = new Error(`This inquiry is ${adoption.status}. The payment requires refund review.`);
    error.statusCode = 409;
    throw error;
  }

  if (!paymentMatches(adoption, 'adoption', payment)) {
    await AdoptionRequest.findByIdAndUpdate(adoption._id, {
      $set: { 'paymentDetails.paymentStatus': 'payment_failed' }
    });
    const error = new Error('PayMongo amount does not match the adoption amount due.');
    error.statusCode = 409;
    throw error;
  }

  const reservedPet = await reservePetForAdoption(adoption.pet, adoption._id);
  if (!reservedPet) {
    await AdoptionRequest.findByIdAndUpdate(adoption._id, {
      $set: { 'paymentDetails.paymentStatus': 'payment_failed' }
    });
    const error = new Error('This pet is already reserved or unavailable. The payment requires refund review.');
    error.statusCode = 409;
    throw error;
  }

  const paidAmount = Number(payment.attributes.amount) / 100;
  const updated = await AdoptionRequest.findOneAndUpdate({
    _id: adoption._id,
    'paymentDetails.history.paymentId': { $ne: payment.id }
  }, {
    $inc: {
      'paymentDetails.paidAmount': paidAmount,
      'paymentDetails.pricingBreakdown.paidAmount': paidAmount,
      'paymentDetails.pricingBreakdown.balanceDue': -paidAmount
    },
    $set: {
      'paymentDetails.method': 'paymongo',
      'paymentDetails.paidAt': new Date()
    },
    $push: {
      'paymentDetails.history': {
        status: 'payment_received',
        amount: paidAmount,
        paymentId: payment.id,
        description: 'Payment confirmed by PayMongo',
        timestamp: new Date()
      }
    }
  }, { new: true });

  if (!updated) return AdoptionRequest.findById(adoption._id);
  const pricing = updated.paymentDetails.pricingBreakdown;
  pricing.balanceDue = Math.max(0, Number(pricing.balanceDue || 0));
  updated.paymentDetails.paymentStatus = pricing.balanceDue <= 0
    ? 'paid_in_full'
    : Number(pricing.depositAmount) > 0 && Number(updated.paymentDetails.paidAmount) >= Number(pricing.depositAmount)
      ? 'deposit_paid'
      : 'partially_paid';
  const historyEntry = updated.paymentDetails.history[updated.paymentDetails.history.length - 1];
  if (historyEntry?.paymentId === payment.id) historyEntry.status = updated.paymentDetails.paymentStatus;
  if (['inquiry_submitted', 'under_review'].includes(updated.status)) updated.status = 'approved';
  await updated.save();

  await createNotification({
    recipient: updated.seller,
    sender: updated.customer,
    type: 'adoption_status',
    title: 'Adoption Payment Received',
    message: `PayMongo confirmed a payment of ₱${paidAmount.toLocaleString()}.`,
    relatedId: updated._id,
    relatedModel: 'AdoptionRequest'
  });
  return updated;
};

const findBySession = async session => {
  const metadata = session?.attributes?.metadata || {};
  if (metadata.record_id && ['order', 'booking', 'adoption', 'procurement'].includes(metadata.record_type)) {
    const Model = metadata.record_type === 'order' ? Order
      : metadata.record_type === 'booking' ? Booking
        : metadata.record_type === 'procurement' ? PurchaseOrder : AdoptionRequest;
    const record = await Model.findById(metadata.record_id);
    if (record) return { record, type: metadata.record_type };
  }

  const sessionFilter = {
    $or: [
      { 'paymentDetails.sessionId': session.id },
      { 'paymentDetails.sessionHistory.sessionId': session.id }
    ]
  };
  const booking = await Booking.findOne(sessionFilter);
  if (booking) return { record: booking, type: 'booking' };
  const adoption = await AdoptionRequest.findOne(sessionFilter);
  if (adoption) return { record: adoption, type: 'adoption' };
  const procurement = await PurchaseOrder.findOne(sessionFilter);
  if (procurement) return { record: procurement, type: 'procurement' };
  const order = await Order.findOne({
    $or: [
      ...sessionFilter.$or,
      { orderNumber: session.attributes?.reference_number }
    ]
  });
  return order ? { record: order, type: 'order' } : null;
};

const reconcilePaidSession = async session => {
  const payment = session?.attributes?.payments?.find(row => row.attributes?.status === 'paid');
  if (!payment) return null;
  const target = await findBySession(session);
  if (!target) {
    const error = new Error(`No local transaction matches PayMongo session ${session.id}.`);
    error.statusCode = 404;
    throw error;
  }
  if (target.type === 'order') return { type: target.type, record: await finalizeOrder(target.record, payment) };
  if (target.type === 'booking') return { type: target.type, record: await finalizeBooking(target.record, payment) };
  if (target.type === 'procurement') return { type: target.type, record: await finalizeProcurement(target.record, payment) };
  return { type: target.type, record: await finalizeAdoption(target.record, payment) };
};

const markSessionFailed = async session => {
  const target = await findBySession(session);
  if (!target) return null;
  let updated;
  if (target.type === 'adoption') {
    updated = await AdoptionRequest.findOneAndUpdate({
      _id: target.record._id,
      'paymentDetails.method': 'paymongo',
      'paymentDetails.paymentStatus': { $nin: ['paid_in_full', 'deposit_paid', 'payment_failed'] }
    }, {
        $set: { 'paymentDetails.paymentStatus': 'payment_failed', 'paymentDetails.method': 'paymongo' }
      }, { new: true });
  } else {
    const Model = target.type === 'order' ? Order : target.type === 'procurement' ? PurchaseOrder : Booking;
    updated = await Model.findOneAndUpdate({
      _id: target.record._id,
      paymentMethod: 'paymongo',
      paymentStatus: { $nin: ['paid', 'settled', 'failed'] },
      $or: [
        { 'paymentDetails.paymentId': { $exists: false } },
        { 'paymentDetails.paymentId': null }
      ]
    }, {
      $set: {
        paymentStatus: 'failed',
        paymentMethod: 'paymongo',
        ...(target.type === 'order' ? { status: 'payment_failed' } : {}),
        'paymentDetails.failureReason': 'PayMongo reported a failed payment.'
      }
    }, { new: true });
    if (updated && target.type === 'booking' && updated.customer && updated.addedBy) {
      await createNotification({
        recipient: updated.customer,
        sender: updated.addedBy,
        type: 'booking_status',
        title: 'Payment Unsuccessful',
        message: 'PayMongo did not complete your booking payment. You can retry while the booking remains valid.',
        relatedId: updated._id,
        relatedModel: 'Booking',
        targetUrl: `/bookings?id=${target.record._id}`
      });
    }
  }
  return updated ? { type: target.type, record: updated } : null;
};

module.exports = {
  amountCentavos,
  findBySession,
  reconcilePaidSession,
  markSessionFailed,
  finalizeOrder,
  finalizeBooking,
  finalizeAdoption,
  finalizeProcurement
};
