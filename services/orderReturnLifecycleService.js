const mongoose = require('mongoose');
const Delivery = require('../models/Delivery');
const Order = require('../models/Order');
const OrderReturn = require('../models/OrderReturn');
const Store = require('../models/Store');
const User = require('../models/User');
const InventoryLedgerService = require('./inventoryLedgerService');
const { assignDelivery } = require('./deliveryAssignmentService');
const { createNotification } = require('../controllers/notificationController');
const { isPlatformAdmin } = require('../config/permissions');
const { canOperateStore, getAuthorizedStoreIds, idsEqual } = require('../utils/authorizationPolicy');

const ISSUE_TYPES = new Set(['damaged', 'wrong_item', 'missing_item', 'defective', 'not_as_described', 'missing_parts', 'other']);
const RESOLUTIONS = new Set(['return_refund', 'replacement', 'refund_only']);
const DECISIONS = new Set(['approve_return', 'approve_refund', 'approve_replacement', 'reject']);
const TERMINAL_STATUSES = new Set(['resolved', 'cancelled', 'closed', 'refunded']);

const fail = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });
const safeText = (value, { required = false, min = 3, max = 2000, label = 'note' } = {}) => {
  const text = String(value || '').trim();
  if ((required && text.length < min) || text.length > max) {
    throw fail(400, 'INVALID_RETURN_INPUT', `Enter a valid ${label} between ${min} and ${max} characters.`);
  }
  return text;
};
const sellerAuthorized = (user, store) => canOperateStore(user, store, ['sales.manage', 'orders.update']);
const actorRole = user => user?.staffType || user?.role || 'system';
const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const addressSnapshot = value => {
  const source = value?.toObject ? value.toObject() : (value || {});
  const province = source.province || source.state || '';
  const parts = [source.unitBuilding, source.street, source.barangay, source.city, province, source.zipCode, source.country]
    .map(part => String(part || '').trim()).filter(Boolean);
  return {
    formattedAddress: source.formattedAddress || parts.join(', ') || 'Address unavailable',
    street: source.street, barangay: source.barangay, city: source.city,
    province, zipCode: source.zipCode, country: source.country || 'Philippines',
    landmark: source.landmark,
    coordinates: source.coordinates?.lat != null && source.coordinates?.lng != null
      ? { lat: Number(source.coordinates.lat), lng: Number(source.coordinates.lng) }
      : undefined
  };
};

const evidenceFromFiles = (files, userId) => (files || []).map(file => ({
  publicId: file.filename,
  deliveryType: 'authenticated',
  resourceType: String(file.mimetype || '').startsWith('video/') ? 'video' : 'image',
  format: String(file.mimetype || '').split('/')[1]?.replace('quicktime', 'mov').replace('jpeg', 'jpg') || 'bin',
  originalName: file.originalname,
  size: file.size,
  uploadedBy: userId,
  uploadedAt: new Date()
}));

const appendHistory = (record, { action, fromStatus = record.status, toStatus = record.status, user, note }) => {
  record.history.push({ action, fromStatus, toStatus, actor: user._id, actorRole: actorRole(user), note, at: new Date() });
};

const itemReturnStatus = status => {
  if (['issue_reported', 'seller_review', 'requested'].includes(status)) return 'issue_reported';
  if (['return_approved_awaiting_pickup', 'pickup_scheduled', 'rider_assigned', 'going_to_customer', 'return_picked_up', 'returning_to_seller'].includes(status)) return 'return_in_progress';
  if (status === 'returned_to_seller') return 'received';
  if (status === 'under_inspection') return 'under_inspection';
  if (['refund_approved', 'refund_processing', 'refund_pending'].includes(status)) return 'refund_processing';
  if (['refund_completed', 'refunded'].includes(status)) return 'refunded';
  if (['replacement_approved', 'replacement_prepared', 'replacement_rider_assigned', 'replacement_picked_up', 'replacement_in_transit', 'replacement_arrived'].includes(status)) return 'replacement_in_progress';
  if (['replacement_delivered', 'awaiting_customer_confirmation'].includes(status)) return 'replacement_delivered';
  if (status === 'rejected') return 'rejected';
  if (['resolved', 'closed'].includes(status)) return 'resolved';
  return 'requested';
};

const syncOrderItemStatus = (record, session) => Order.updateOne(
  { _id: record.order, 'items._id': record.orderItem },
  { $set: { 'items.$.returnStatus': itemReturnStatus(record.status) } },
  session ? { session } : undefined
);

const notifyParticipants = async (record, user, title, message) => {
  try {
    const store = await Store.findById(record.store).select('owner');
    const recipients = [
      { id: record.customer, url: `/returns/${record._id}` },
      { id: store?.owner, url: `/admin/returns?case=${record._id}` },
      { id: record.pickup?.assignedRider, url: record.pickup?.delivery ? `/rider/deliveries/${record.pickup.delivery}` : null },
      { id: record.replacement?.assignedRider, url: record.replacement?.delivery ? `/rider/deliveries/${record.replacement.delivery}` : null }
    ].filter(row => row.id && !idsEqual(row.id, user?._id));
    const unique = [...new Map(recipients.map(row => [String(row.id), row])).values()];
    await Promise.allSettled(unique.map(row => createNotification({
      recipient: row.id,
      sender: user?._id,
      type: 'order_status',
      title,
      message,
      relatedId: record._id,
      relatedModel: 'OrderReturn',
      targetUrl: row.url
    })));
  } catch (error) {
    console.error('Return notification dispatch failed:', error.message);
  }
};

const requestVariantReturn = async ({
  user, orderId, itemId, quantity, reason, description, issueType = 'other',
  requestedResolution = 'return_refund', evidence = []
}) => {
  if (user.role !== 'customer') throw fail(403, 'RETURN_FORBIDDEN', 'Only the purchasing customer can report an order-item issue.');
  if (!ISSUE_TYPES.has(issueType)) throw fail(400, 'INVALID_ISSUE_TYPE', 'Select a valid issue type.');
  if (!RESOLUTIONS.has(requestedResolution)) throw fail(400, 'INVALID_RESOLUTION', 'Select a valid requested resolution.');
  const order = await Order.findById(orderId);
  if (!order || order.isDeleted || !idsEqual(order.customer, user._id)) throw fail(404, 'ORDER_NOT_FOUND', 'Order not found.');
  if (!['delivered', 'completed', 'finalized'].includes(order.status) || order.paymentStatus !== 'paid') {
    throw fail(409, 'RETURN_NOT_ELIGIBLE', 'Only paid and delivered product items can be reported.');
  }
  const item = order.items.id(itemId);
  if (!item || item.itemType !== 'product') throw fail(404, 'ORDER_ITEM_NOT_FOUND', 'Product order item not found.');
  const requestedQuantity = Number(quantity || item.quantity);
  if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > Number(item.quantity)) {
    throw fail(400, 'INVALID_RETURN_QUANTITY', 'Issue quantity must be within the purchased quantity.');
  }
  const complaint = safeText(description || reason, { required: true, label: 'description' });
  const existing = await OrderReturn.findOne({ order: order._id, orderItem: item._id });
  if (existing) return { record: existing, created: false };
  try {
    const record = await OrderReturn.create({
      order: order._id,
      orderItem: item._id,
      customer: order.customer,
      store: order.store,
      itemSnapshot: {
        parentProduct: item.itemId,
        productVariant: item.variantId || undefined,
        itemType: item.itemType,
        name: item.name,
        sku: item.variantSnapshot?.sku,
        attributes: item.variantSnapshot?.attributes || [],
        image: item.variantSnapshot?.image || item.image,
        unitPrice: item.variantSnapshot?.retailUnitPrice ?? item.price,
        purchasedQuantity: item.quantity,
        unitWeightKg: item.unitWeightKg || undefined
      },
      requestedQuantity,
      issueType,
      description: complaint,
      reason: complaint,
      requestedResolution,
      evidence,
      policySnapshot: order.refundPolicySnapshot ? {
        ...(order.refundPolicySnapshot.toObject?.() || order.refundPolicySnapshot),
        capturedAt: order.refundPolicySnapshot.capturedAt || order.createdAt
      } : undefined,
      status: 'issue_reported',
      history: [{
        action: 'issue_reported', toStatus: 'issue_reported', actor: user._id,
        actorRole: actorRole(user), note: complaint, at: new Date()
      }]
    });
    await syncOrderItemStatus(record);
    await notifyParticipants(record, user, 'New return/refund case', `${record.caseId}: ${item.name} was reported for seller review.`);
    return { record, created: true };
  } catch (error) {
    if (error.code === 11000) {
      const record = await OrderReturn.findOne({ order: order._id, orderItem: item._id });
      if (record) return { record, created: false };
    }
    throw error;
  }
};

const calculateRefundBreakdown = (record, order, otherEligibleCharges = 0) => {
  const quantity = Number(record.inspection?.acceptedQuantity ?? record.requestedQuantity);
  const productAmount = roundMoney(quantity * Number(record.itemSnapshot.unitPrice || 0));
  const productItems = (order.items || []).filter(item => item.itemType === 'product');
  const fullSingleItemReturn = productItems.length === 1
    && idsEqual(productItems[0]._id, record.orderItem)
    && quantity === Number(productItems[0].quantity);
  const shippingAmount = fullSingleItemReturn ? roundMoney(order.shippingFee || 0) : 0;
  const eligibleOther = Math.max(0, roundMoney(otherEligibleCharges || 0));
  const cap = Math.max(0, Number(order.totalAmount || productAmount + shippingAmount + eligibleOther));
  const amount = roundMoney(Math.min(cap, productAmount + shippingAmount + eligibleOther));
  return { productAmount, shippingAmount, otherEligibleCharges: eligibleOther, amount };
};

const applyDecision = async ({ record, user, decision, reason, otherEligibleCharges = 0, admin = false, skipReviewState = false }) => {
  if (!DECISIONS.has(decision)) throw fail(400, 'INVALID_RETURN_ACTION', 'Select a valid return decision.');
  if (TERMINAL_STATUSES.has(record.status)) throw fail(409, 'RETURN_CLOSED', 'Completed cases cannot be edited.');
  if (!admin && !skipReviewState && !['issue_reported', 'seller_review', 'requested'].includes(record.status)) {
    throw fail(409, 'RETURN_CONFLICT', 'This case is no longer awaiting seller review.');
  }
  if (admin && record.status !== 'disputed') throw fail(409, 'RETURN_NOT_DISPUTED', 'Admin intervention requires an open dispute.');
  const note = safeText(reason, { required: decision === 'reject', label: decision === 'reject' ? 'rejection reason' : 'decision note' });
  const fromStatus = record.status;
  record.decision = {
    outcome: decision,
    reason: note,
    requiresPhysicalReturn: decision === 'approve_return',
    decidedBy: user._id,
    decidedAt: new Date()
  };
  if (decision === 'reject') {
    record.status = 'rejected';
  } else if (decision === 'approve_return') {
    record.status = 'return_approved_awaiting_pickup';
    record.pickup.status = 'awaiting_schedule';
  } else if (decision === 'approve_refund') {
    const order = await Order.findById(record.order);
    const breakdown = calculateRefundBreakdown(record, order, otherEligibleCharges);
    record.status = 'refund_processing';
    record.refund = {
      ...record.refund?.toObject?.(), ...breakdown,
      status: 'processing', paymentMethod: order.paymentMethod,
      idempotencyKey: record.refund?.idempotencyKey || `order-return-refund:${record._id}`,
      approvedBy: user._id, updatedAt: new Date()
    };
  } else {
    record.status = 'replacement_approved';
    record.replacement.status = 'approved';
  }
  if (admin) {
    record.dispute.status = 'resolved';
    record.dispute.adminDecision = decision === 'reject' ? 'uphold_rejection' : decision;
    record.dispute.adminReason = note;
    record.dispute.decidedBy = user._id;
    record.dispute.decidedAt = new Date();
  }
  appendHistory(record, {
    action: admin ? `admin_${decision}` : `seller_${decision}`,
    fromStatus, toStatus: record.status, user, note
  });
  record.revision += 1;
  await record.save();
  await syncOrderItemStatus(record);
  await notifyParticipants(record, user, 'Return case decision updated', `${record.caseId} is now ${record.status.replace(/_/g, ' ')}.`);
  return record;
};

const decideReturnCase = async ({ user, returnId, decision, reason, otherEligibleCharges }) => {
  const record = await OrderReturn.findById(returnId);
  if (!record) throw fail(404, 'RETURN_NOT_FOUND', 'Return case not found.');
  if (!(await sellerAuthorized(user, record.store))) throw fail(403, 'RETURN_FORBIDDEN', 'Store return-management permission is required.');
  return applyDecision({ record, user, decision, reason, otherEligibleCharges });
};

const transitionReturnReview = async ({ user, returnId, action, note }) => {
  if (action === 'approve') return decideReturnCase({ user, returnId, decision: 'approve_return', reason: note });
  if (action === 'reject') return decideReturnCase({ user, returnId, decision: 'reject', reason: note });
  if (action === 'receive') return confirmReturnReceived({ user, returnId, note });
  throw fail(400, 'INVALID_RETURN_ACTION', 'Unsupported return action.');
};

const missionParcel = record => ({
  weightKg: Math.max(0.001, Number(record.itemSnapshot.unitWeightKg || 0.5) * Number(record.requestedQuantity || 1)),
  parcelCount: 1,
  confirmed: true,
  measurementSource: record.itemSnapshot.unitWeightKg ? 'catalog_estimate' : 'documented_manual_estimate',
  manualException: !record.itemSnapshot.unitWeightKg,
  manualExceptionReason: !record.itemSnapshot.unitWeightKg ? 'Return case fallback estimate pending seller packaging confirmation.' : undefined
});

const createMission = async ({ record, user, missionType, scheduledAt }) => {
  const existingDeliveryId = missionType === 'return_pickup' ? record.pickup?.delivery : record.replacement?.delivery;
  if (existingDeliveryId) {
    const delivery = await Delivery.findById(existingDeliveryId);
    return { record, delivery, created: false };
  }
  const [order, store] = await Promise.all([
    Order.findById(record.order).populate('customer', 'firstName lastName phone phoneNumber'),
    Store.findById(record.store).select('name contactInfo owner')
  ]);
  if (!order || !store) throw fail(409, 'RETURN_SOURCE_MISSING', 'The original order or store is unavailable.');
  const customerName = [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(' ') || 'Customer';
  const customerAddress = addressSnapshot(order.shippingAddress);
  const storeAddress = addressSnapshot(store.contactInfo?.address);
  const returnPickup = missionType === 'return_pickup';
  const parcel = missionParcel(record);
  const verificationCode = returnPickup ? String(Math.floor(100000 + Math.random() * 900000)) : undefined;
  const delivery = await Delivery.create({
    store: record.store,
    sourceType: 'manual',
    missionType,
    returnCase: record._id,
    returnItem: {
      caseId: record.caseId, name: record.itemSnapshot.name, quantity: record.requestedQuantity,
      issueType: record.issueType, requestedResolution: record.requestedResolution
    },
    manualDelivery: {
      recipientName: returnPickup ? customerName : customerName,
      recipientPhone: order.phoneNumber || order.customer?.phone || order.customer?.phoneNumber || store.contactInfo?.phone || 'Unavailable',
      pickupAddress: returnPickup ? customerAddress : storeAddress,
      dropoffAddress: returnPickup ? storeAddress : customerAddress,
      notes: returnPickup
        ? `Return pickup for ${record.caseId}. Verify the customer code before accepting the item.`
        : `Replacement shipment for ${record.caseId}.`,
      idempotencyKey: `${missionType}:${record._id}`,
      createdBy: user._id,
      updatedBy: user._id
    },
    status: 'pending',
    assignmentType: 'unassigned',
    parcel: {
      weightKg: parcel.weightKg,
      parcelCount: parcel.parcelCount,
      measurementSource: parcel.measurementSource,
      weightStatus: record.itemSnapshot.unitWeightKg ? 'complete' : 'manual_exception',
      manualExceptionReason: parcel.manualExceptionReason,
      recordedAt: new Date(),
      recordedBy: user._id
    },
    statusHistory: [{ status: 'pending', timestamp: new Date(), notes: `${missionType.replace(/_/g, ' ')} mission created.` }]
  });
  const fromStatus = record.status;
  if (returnPickup) {
    record.pickup.status = 'scheduled';
    record.pickup.delivery = delivery._id;
    record.pickup.scheduledAt = scheduledAt ? new Date(scheduledAt) : new Date();
    record.pickup.pickupAddress = customerAddress;
    record.pickup.sellerDestination = storeAddress;
    record.pickup.verificationCode = verificationCode;
    record.pickup.verificationCodeLast4 = verificationCode.slice(-4);
    record.status = 'pickup_scheduled';
  } else {
    record.replacement.status = 'prepared';
    record.replacement.delivery = delivery._id;
    record.replacement.preparedAt = new Date();
    record.status = 'replacement_prepared';
  }
  appendHistory(record, {
    action: `${missionType}_created`, fromStatus, toStatus: record.status, user,
    note: scheduledAt ? `Scheduled for ${new Date(scheduledAt).toISOString()}` : undefined
  });
  record.revision += 1;
  await record.save();

  let assignment;
  let assignmentError;
  try {
    assignment = await assignDelivery({ deliveryId: delivery._id, parcel, actorId: user._id });
    if (returnPickup) {
      record.pickup.status = 'rider_assigned';
      record.pickup.assignedRider = assignment.riderId;
      record.status = 'rider_assigned';
    } else {
      record.replacement.status = 'rider_assigned';
      record.replacement.assignedRider = assignment.riderId;
      record.status = 'replacement_rider_assigned';
    }
    appendHistory(record, {
      action: `${missionType}_rider_assigned`, fromStatus: fromStatus === record.status ? fromStatus : missionType === 'return_pickup' ? 'pickup_scheduled' : 'replacement_prepared',
      toStatus: record.status, user
    });
    record.revision += 1;
    await record.save();
  } catch (error) {
    assignmentError = { code: error.code || 'NO_ELIGIBLE_RIDER', message: error.message };
  }
  await syncOrderItemStatus(record);
  await notifyParticipants(record, user, returnPickup ? 'Return pickup scheduled' : 'Replacement prepared',
    `${record.caseId} ${assignment ? 'has an assigned rider' : 'is waiting for an eligible rider'}.`);
  return { record, delivery: assignment?.delivery || delivery, assignment, assignmentError, verificationCode, created: true };
};

const scheduleReturnPickup = ({ user, returnId, scheduledAt }) => OrderReturn.findById(returnId).then(async record => {
  if (!record) throw fail(404, 'RETURN_NOT_FOUND', 'Return case not found.');
  if (!(await sellerAuthorized(user, record.store))) throw fail(403, 'RETURN_FORBIDDEN', 'Store return-management permission is required.');
  if (!['return_approved_awaiting_pickup', 'pickup_scheduled', 'rider_assigned'].includes(record.status)) {
    throw fail(409, 'RETURN_NOT_READY', 'This case is not awaiting a return pickup.');
  }
  return createMission({ record, user, missionType: 'return_pickup', scheduledAt });
});

const prepareReplacement = ({ user, returnId }) => OrderReturn.findById(returnId).then(async record => {
  if (!record) throw fail(404, 'RETURN_NOT_FOUND', 'Return case not found.');
  if (!(await sellerAuthorized(user, record.store))) throw fail(403, 'RETURN_FORBIDDEN', 'Store return-management permission is required.');
  if (!['replacement_approved', 'replacement_prepared', 'replacement_rider_assigned'].includes(record.status)) {
    throw fail(409, 'REPLACEMENT_NOT_READY', 'A replacement must be approved before it is prepared.');
  }
  return createMission({ record, user, missionType: 'replacement' });
});

const verifyReturnPickup = async ({ delivery, user, verificationCode }) => {
  if (delivery.missionType !== 'return_pickup' || !delivery.returnCase) return null;
  const record = await OrderReturn.findById(delivery.returnCase).select('+pickup.verificationCode');
  if (!record) throw fail(404, 'RETURN_NOT_FOUND', 'Return case not found.');
  const submitted = String(verificationCode || '').trim();
  if (!submitted || submitted !== String(record.pickup.verificationCode || '')) {
    throw fail(400, 'INVALID_RETURN_CODE', 'The return pickup verification code is incorrect.');
  }
  record.pickup.verifiedAt = new Date();
  appendHistory(record, { action: 'pickup_verified', user, note: `Verification ending in ${record.pickup.verificationCodeLast4}` });
  record.revision += 1;
  await record.save();
  return record;
};

const syncReturnMissionStatus = async ({ delivery, user, deliveryStatus, session }) => {
  if (!delivery?.returnCase || !['return_pickup', 'replacement'].includes(delivery.missionType)) return null;
  const query = OrderReturn.findById(delivery.returnCase);
  const record = session ? await query.session(session) : await query;
  if (!record) return null;
  const fromStatus = record.status;
  if (delivery.missionType === 'return_pickup') {
    const mapping = {
      accepted: ['going_to_customer', 'going_to_customer'],
      picked_up: ['return_picked_up', 'picked_up'],
      in_transit: ['returning_to_seller', 'returning'],
      delivered: ['returned_to_seller', 'delivered']
    };
    const next = mapping[deliveryStatus];
    if (!next) return record;
    record.status = next[0];
    record.pickup.status = next[1];
  } else {
    const mapping = {
      picked_up: ['replacement_picked_up', 'picked_up'],
      in_transit: ['replacement_in_transit', 'in_transit'],
      arrived: ['replacement_arrived', 'arrived'],
      delivered: ['awaiting_customer_confirmation', 'delivered']
    };
    const next = mapping[deliveryStatus];
    if (!next) return record;
    record.status = next[0];
    record.replacement.status = next[1];
    if (deliveryStatus === 'delivered') record.replacement.deliveredAt = new Date();
  }
  if (fromStatus === record.status) return record;
  appendHistory(record, {
    action: `${delivery.missionType}_${deliveryStatus}`,
    fromStatus, toStatus: record.status, user,
    note: `Rider mission ${deliveryStatus.replace(/_/g, ' ')}`
  });
  record.revision += 1;
  await record.save(session ? { session } : undefined);
  await syncOrderItemStatus(record, session);
  if (!session) {
    await notifyParticipants(record, user, 'Return case tracking update', `${record.caseId} is now ${record.status.replace(/_/g, ' ')}.`);
  }
  return record;
};

async function confirmReturnReceived({ user, returnId, note }) {
  const record = await OrderReturn.findById(returnId);
  if (!record) throw fail(404, 'RETURN_NOT_FOUND', 'Return case not found.');
  if (!(await sellerAuthorized(user, record.store))) throw fail(403, 'RETURN_FORBIDDEN', 'Store return-management permission is required.');
  if (!['returned_to_seller', 'received'].includes(record.status)) throw fail(409, 'RETURN_NOT_RECEIVED', 'The return pickup must be delivered to the store first.');
  const fromStatus = record.status;
  record.status = 'under_inspection';
  appendHistory(record, { action: 'return_received', fromStatus, toStatus: record.status, user, note: safeText(note) });
  record.revision += 1;
  await record.save();
  await syncOrderItemStatus(record);
  await notifyParticipants(record, user, 'Return received by seller', `${record.caseId} is now under inspection.`);
  return record;
}

const inspectVariantReturn = async ({ user, returnId, acceptedQuantity, resellableQuantity, note, outcome, evidence = [] }) => {
  let result;
  await mongoose.connection.transaction(async session => {
    const record = await OrderReturn.findById(returnId).session(session);
    if (!record) throw fail(404, 'RETURN_NOT_FOUND', 'Return case not found.');
    if (!(await sellerAuthorized(user, record.store))) throw fail(403, 'RETURN_FORBIDDEN', 'Store return-management permission is required.');
    const accepted = Number(acceptedQuantity);
    const resellable = Number(resellableQuantity || 0);
    const legacy = record.status === 'received';
    if (!legacy && record.status !== 'under_inspection') {
      const sameInspection = ['refund_pending', 'inspected'].includes(record.status)
        && Number(record.inspection?.acceptedQuantity) === accepted
        && Number(record.inspection?.resellableQuantity) === resellable;
      if (sameInspection) { result = record; return; }
      throw fail(409, 'RETURN_NOT_RECEIVED', 'The return must be received and placed under inspection first.');
    }
    if (!Number.isInteger(accepted) || !Number.isInteger(resellable)
        || accepted < 0 || accepted > record.requestedQuantity || resellable < 0 || resellable > accepted) {
      throw fail(400, 'INVALID_RETURN_INSPECTION', 'Accepted and resellable quantities are invalid.');
    }
    const nonResellable = accepted - resellable;
    const idempotencyKey = `order-return-restock:${record._id}`;
    if (resellable > 0 && record.itemSnapshot.productVariant) {
      await InventoryLedgerService.restockVariantInSession({
        store: record.store,
        product: record.itemSnapshot.parentProduct,
        productVariant: record.itemSnapshot.productVariant,
        quantity: resellable,
        order: record.order,
        orderItem: record.orderItem,
        performedBy: user._id,
        idempotencyKey,
        reason: `Accepted resellable return ${record.caseId}`,
        lotNumber: `RETURN-${record.order}-${record.orderItem}`
      }, session);
    }
    const fromStatus = record.status;
    record.inspection = {
      acceptedQuantity: accepted,
      resellableQuantity: resellable,
      nonResellableQuantity: nonResellable,
      outcome: outcome || (accepted > 0 ? 'eligible_refund' : 'rejected'),
      note: safeText(note),
      evidence,
      inspectedBy: user._id,
      inspectedAt: new Date()
    };
    record.restock = {
      status: resellable > 0 && record.itemSnapshot.productVariant ? 'applied' : 'not_applicable',
      idempotencyKey: resellable > 0 && record.itemSnapshot.productVariant ? idempotencyKey : undefined,
      appliedAt: resellable > 0 && record.itemSnapshot.productVariant ? new Date() : undefined
    };
    // Preserve the original normalized-variant integration contract while the
    // customer workflow keeps inspection and final resolution as separate steps.
    record.status = legacy ? (accepted > 0 ? 'refund_pending' : 'inspected') : 'under_inspection';
    if (legacy) record.refund.status = accepted > 0 ? 'review_required' : 'denied';
    appendHistory(record, { action: 'inspection_recorded', fromStatus, toStatus: record.status, user, note: record.inspection.note });
    record.revision += 1;
    await record.save({ session });
    await Order.updateOne(
      { _id: record.order, 'items._id': record.orderItem },
      { $set: { 'items.$.returnStatus': itemReturnStatus(record.status) } },
      { session }
    );
    result = record;
  });
  return result;
};

const finalizeInspectionResolution = async ({ user, returnId, resolution, reason, otherEligibleCharges }) => {
  const record = await OrderReturn.findById(returnId);
  if (!record) throw fail(404, 'RETURN_NOT_FOUND', 'Return case not found.');
  if (!(await sellerAuthorized(user, record.store))) throw fail(403, 'RETURN_FORBIDDEN', 'Store return-management permission is required.');
  if (record.status !== 'under_inspection' || !record.inspection?.inspectedAt) {
    throw fail(409, 'INSPECTION_REQUIRED', 'Record the seller inspection before final resolution.');
  }
  return applyDecision({
    record, user,
    decision: resolution === 'refund' ? 'approve_refund' : resolution === 'replacement' ? 'approve_replacement' : 'reject',
    reason, otherEligibleCharges,
    admin: false,
    skipReviewState: true
  });
};

const openDispute = async ({ user, returnId, reason }) => {
  const record = await OrderReturn.findById(returnId);
  if (!record || !idsEqual(record.customer, user._id) || user.role !== 'customer') throw fail(404, 'RETURN_NOT_FOUND', 'Return case not found.');
  if (!['rejected', 'awaiting_customer_confirmation', 'replacement_delivered'].includes(record.status)) {
    throw fail(409, 'DISPUTE_NOT_AVAILABLE', 'This case cannot be disputed at its current stage.');
  }
  const note = safeText(reason, { required: true, label: 'dispute reason' });
  const fromStatus = record.status;
  record.status = 'disputed';
  record.dispute = { status: 'open', reason: note, openedAt: new Date(), openedBy: user._id };
  appendHistory(record, { action: 'customer_disputed', fromStatus, toStatus: record.status, user, note });
  record.revision += 1;
  await record.save();
  const admins = await User.find({ role: { $in: ['super_admin', 'platform_admin'] }, isActive: true, isDeleted: { $ne: true } }).select('_id');
  await Promise.allSettled(admins.map(admin => createNotification({
    recipient: admin._id, sender: user._id, type: 'order_status',
    title: 'Return case dispute requires review',
    message: `${record.caseId} was escalated by the customer.`,
    relatedId: record._id, relatedModel: 'OrderReturn', targetUrl: `/superadmin/returns?case=${record._id}`
  })));
  return record;
};

const decideDispute = async ({ user, returnId, decision, reason, otherEligibleCharges }) => {
  if (!isPlatformAdmin(user)) throw fail(403, 'RETURN_FORBIDDEN', 'Platform administrator access is required.');
  const record = await OrderReturn.findById(returnId);
  if (!record) throw fail(404, 'RETURN_NOT_FOUND', 'Return case not found.');
  const mapped = decision === 'uphold_rejection' ? 'reject' : decision;
  return applyDecision({ record, user, decision: mapped, reason, otherEligibleCharges, admin: true });
};

const confirmCustomerResolution = async ({ user, returnId, resolved, note }) => {
  const record = await OrderReturn.findById(returnId);
  if (!record || !idsEqual(record.customer, user._id) || user.role !== 'customer') throw fail(404, 'RETURN_NOT_FOUND', 'Return case not found.');
  if (!['awaiting_customer_confirmation', 'replacement_delivered'].includes(record.status)) {
    throw fail(409, 'CONFIRMATION_NOT_AVAILABLE', 'Replacement receipt confirmation is not available yet.');
  }
  if (resolved !== true) return openDispute({ user, returnId, reason: note || 'The replacement did not resolve the reported issue.' });
  const fromStatus = record.status;
  record.status = 'resolved';
  record.replacement.status = 'confirmed';
  record.replacement.confirmedAt = new Date();
  appendHistory(record, { action: 'customer_confirmed_resolved', fromStatus, toStatus: record.status, user, note: safeText(note) });
  record.revision += 1;
  await record.save();
  await syncOrderItemStatus(record);
  await notifyParticipants(record, user, 'Return case resolved', `${record.caseId} was confirmed resolved by the customer.`);
  return record;
};

const recordRefundResult = async ({ user, returnId, callbackId, status, reference, amount }) => {
  if (!isPlatformAdmin(user)) throw fail(403, 'REFUND_FORBIDDEN', 'Platform refund authority is required.');
  if (!['refunded', 'denied'].includes(status) || !String(callbackId || '').trim()) {
    throw fail(400, 'INVALID_REFUND_RESULT', 'A refund status and provider callback identity are required.');
  }
  const record = await OrderReturn.findById(returnId);
  if (!record) throw fail(404, 'RETURN_NOT_FOUND', 'Return case not found.');
  if ((record.refund.callbackIds || []).includes(callbackId)) return { record, idempotent: true };
  if (!['refund_processing', 'refund_pending'].includes(record.status)) throw fail(409, 'REFUND_NOT_READY', 'This case is not awaiting refund processing.');
  const safeAmount = Number(amount ?? record.refund.amount ?? 0);
  const maximumRefund = Number(record.refund.amount || (record.inspection?.acceptedQuantity || record.requestedQuantity) * Number(record.itemSnapshot.unitPrice || 0));
  if (!Number.isFinite(safeAmount) || safeAmount < 0 || safeAmount > maximumRefund) {
    throw fail(400, 'INVALID_REFUND_AMOUNT', 'Refund amount exceeds the authorized refundable amount.');
  }
  const legacy = record.status === 'refund_pending';
  const fromStatus = record.status;
  record.refund.status = status;
  record.refund.reference = safeText(reference, { max: 500 });
  record.refund.amount = safeAmount;
  record.refund.processedBy = user._id;
  record.refund.updatedAt = new Date();
  record.refund.callbackIds.addToSet(callbackId);
  if (status === 'refunded') {
    record.status = legacy ? 'refunded' : 'refund_completed';
    appendHistory(record, { action: 'refund_completed', fromStatus, toStatus: record.status, user, note: record.refund.reference });
    if (!legacy) {
      const completed = record.status;
      record.status = 'resolved';
      appendHistory(record, { action: 'case_resolved', fromStatus: completed, toStatus: record.status, user, note: 'Refund completed successfully.' });
    }
  } else {
    record.status = 'disputed';
    record.dispute.status = 'open';
    record.dispute.reason = 'Authorized refund processing was denied or failed.';
    record.dispute.openedAt = new Date();
    record.dispute.openedBy = user._id;
    appendHistory(record, { action: 'refund_denied', fromStatus, toStatus: record.status, user, note: record.refund.reference });
  }
  record.revision += 1;
  await record.save();
  await syncOrderItemStatus(record);
  await notifyParticipants(record, user, status === 'refunded' ? 'Refund completed' : 'Refund requires review',
    `${record.caseId}: ${status === 'refunded' ? `₱${safeAmount.toFixed(2)} was recorded as refunded` : 'refund processing needs administrator review'}.`);
  return { record, idempotent: false };
};

const listOrderReturns = orderId => OrderReturn.find({ order: orderId }).sort({ createdAt: -1 }).lean();

const listStoreReturns = async user => {
  const storeIds = await getAuthorizedStoreIds(user);
  if (storeIds !== null && !storeIds.length) throw fail(403, 'RETURN_FORBIDDEN', 'No authorized store is available.');
  return OrderReturn.find(storeIds === null ? {} : { store: { $in: storeIds } })
    .populate('customer', 'firstName lastName email phone')
    .populate('order', 'orderNumber paymentMethod shippingFee totalAmount shippingAddress')
    .populate('store', 'name')
    .populate('pickup.assignedRider replacement.assignedRider', 'firstName lastName riderProfile.staffId')
    .sort({ updatedAt: -1 }).limit(250);
};

const getReturnCase = async ({ user, returnId }) => {
  const record = await OrderReturn.findById(returnId)
    .populate('customer', 'firstName lastName email phone')
    .populate('order', 'orderNumber paymentMethod shippingFee totalAmount shippingAddress fulfillmentTimeline')
    .populate('store', 'name contactInfo refundPolicy')
    .populate('pickup.delivery replacement.delivery')
    .populate('pickup.assignedRider replacement.assignedRider', 'firstName lastName riderProfile.staffId');
  if (!record) throw fail(404, 'RETURN_NOT_FOUND', 'Return case not found.');
  const allowed = isPlatformAdmin(user) || idsEqual(record.customer?._id || record.customer, user._id)
    || idsEqual(record.pickup?.assignedRider?._id || record.pickup?.assignedRider, user._id)
    || idsEqual(record.replacement?.assignedRider?._id || record.replacement?.assignedRider, user._id)
    || await sellerAuthorized(user, record.store?._id || record.store);
  if (!allowed) throw fail(403, 'RETURN_FORBIDDEN', 'Return case access denied.');
  return record;
};

module.exports = {
  ISSUE_TYPES,
  RESOLUTIONS,
  calculateRefundBreakdown,
  confirmCustomerResolution,
  confirmReturnReceived,
  decideDispute,
  decideReturnCase,
  evidenceFromFiles,
  finalizeInspectionResolution,
  getReturnCase,
  inspectVariantReturn,
  listOrderReturns,
  listStoreReturns,
  openDispute,
  prepareReplacement,
  recordRefundResult,
  requestVariantReturn,
  scheduleReturnPickup,
  syncReturnMissionStatus,
  transitionReturnReview,
  verifyReturnPickup
};
