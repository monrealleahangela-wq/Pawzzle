const mongoose = require('mongoose');
const Order = require('../models/Order');
const OrderReturn = require('../models/OrderReturn');
const InventoryLedgerService = require('./inventoryLedgerService');
const { assertCapability } = require('./customerVariantLifecycleReadinessService');
const { canOperateStore, idsEqual } = require('../utils/authorizationPolicy');

const fail = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });
const safeReason = value => {
  const reason = String(value || '').trim();
  if (reason.length < 3 || reason.length > 1000) throw fail(400, 'INVALID_RETURN_REASON', 'Enter a return reason between 3 and 1000 characters.');
  return reason;
};
const sellerAuthorized = (user, store) => canOperateStore(user, store, ['sales.manage', 'orders.update']);

const requestVariantReturn = async ({ user, orderId, itemId, quantity, reason }) => {
  await assertCapability('returns');
  if (user.role !== 'customer') throw fail(403, 'RETURN_FORBIDDEN', 'Only the purchasing customer can request a return.');
  const order = await Order.findById(orderId);
  if (!order || order.isDeleted || !idsEqual(order.customer, user._id)) throw fail(404, 'ORDER_NOT_FOUND', 'Order not found.');
  if (!['delivered', 'completed'].includes(order.status) || order.paymentStatus !== 'paid') {
    throw fail(409, 'RETURN_NOT_ELIGIBLE', 'Only paid and delivered items can be returned.');
  }
  const item = order.items.id(itemId);
  if (!item || item.itemType !== 'product') throw fail(404, 'ORDER_ITEM_NOT_FOUND', 'Order item not found.');
  if (!item.variantId || !item.variantSnapshot?.sku) {
    throw fail(409, 'VARIANT_RETURN_REQUIRED', 'This gated return path only supports normalized product variants.');
  }
  const requestedQuantity = Number(quantity);
  if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > Number(item.quantity)) {
    throw fail(400, 'INVALID_RETURN_QUANTITY', 'Return quantity must be within the purchased quantity.');
  }
  const existing = await OrderReturn.findOne({ order: order._id, orderItem: item._id });
  if (existing) return { record: existing, created: false };
  const now = new Date();
  try {
    const record = await OrderReturn.create({
      order: order._id,
      orderItem: item._id,
      customer: order.customer,
      store: order.store,
      itemSnapshot: {
        parentProduct: item.itemId,
        productVariant: item.variantId,
        name: item.name,
        sku: item.variantSnapshot.sku,
        attributes: item.variantSnapshot.attributes || [],
        image: item.variantSnapshot.image || item.image,
        unitPrice: item.variantSnapshot.retailUnitPrice ?? item.price,
        purchasedQuantity: item.quantity
      },
      requestedQuantity,
      reason: safeReason(reason),
      history: [{ action: 'requested', toStatus: 'requested', actor: user._id, at: now }]
    });
    item.returnStatus = 'requested';
    await order.save();
    return { record, created: true };
  } catch (error) {
    if (error.code === 11000) {
      const record = await OrderReturn.findOne({ order: order._id, orderItem: item._id });
      if (record) return { record, created: false };
    }
    throw error;
  }
};

const transitionReturnReview = async ({ user, returnId, action, note }) => {
  await assertCapability('returns');
  if (!['approve', 'reject', 'receive'].includes(action)) throw fail(400, 'INVALID_RETURN_ACTION', 'Unsupported return action.');
  const record = await OrderReturn.findById(returnId);
  if (!record) throw fail(404, 'RETURN_NOT_FOUND', 'Return not found.');
  if (!(await sellerAuthorized(user, record.store))) throw fail(403, 'RETURN_FORBIDDEN', 'Store return-management permission is required.');
  const expected = action === 'receive' ? 'approved' : 'requested';
  const next = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'received';
  const now = new Date();
  const updated = await OrderReturn.findOneAndUpdate(
    { _id: record._id, status: expected, revision: record.revision },
    { $set: { status: next }, $inc: { revision: 1 }, $push: { history: {
      action, fromStatus: expected, toStatus: next, actor: user._id, note: String(note || '').trim(), at: now
    } } },
    { new: true, runValidators: true }
  );
  if (!updated) throw fail(409, 'RETURN_CONFLICT', 'The return changed. Refresh and try again.');
  await Order.updateOne({ _id: updated.order, 'items._id': updated.orderItem }, { $set: { 'items.$.returnStatus': next } });
  return updated;
};

const inspectVariantReturn = async ({ user, returnId, acceptedQuantity, resellableQuantity, note }) => {
  await assertCapability('returns');
  let result;
  await mongoose.connection.transaction(async session => {
    const record = await OrderReturn.findById(returnId).session(session);
    if (!record) throw fail(404, 'RETURN_NOT_FOUND', 'Return not found.');
    if (!(await sellerAuthorized(user, record.store))) throw fail(403, 'RETURN_FORBIDDEN', 'Store return-management permission is required.');
    const accepted = Number(acceptedQuantity);
    const resellable = Number(resellableQuantity);
    if (record.status !== 'received') {
      const sameCompletedInspection = ['inspected', 'refund_pending', 'refunded', 'closed'].includes(record.status)
        && Number(record.inspection?.acceptedQuantity) === accepted
        && Number(record.inspection?.resellableQuantity) === resellable;
      if (sameCompletedInspection) {
        result = record;
        return;
      }
      throw fail(409, 'RETURN_NOT_RECEIVED', 'Physical receipt is required before inspection.');
    }
    if (!Number.isInteger(accepted) || !Number.isInteger(resellable)
        || accepted < 0 || accepted > record.requestedQuantity || resellable < 0 || resellable > accepted) {
      throw fail(400, 'INVALID_RETURN_INSPECTION', 'Accepted and resellable quantities are invalid.');
    }
    const nonResellable = accepted - resellable;
    const idempotencyKey = `order-return-restock:${record._id}`;
    if (resellable > 0) {
      await InventoryLedgerService.restockVariantInSession({
        store: record.store,
        product: record.itemSnapshot.parentProduct,
        productVariant: record.itemSnapshot.productVariant,
        quantity: resellable,
        order: record.order,
        orderItem: record.orderItem,
        performedBy: user._id,
        idempotencyKey,
        reason: `Accepted resellable return ${record._id}`,
        lotNumber: `RETURN-${record.order}-${record.orderItem}`
      }, session);
    }
    record.inspection = {
      acceptedQuantity: accepted,
      resellableQuantity: resellable,
      nonResellableQuantity: nonResellable,
      note: String(note || '').trim(),
      inspectedBy: user._id,
      inspectedAt: new Date()
    };
    record.restock = {
      status: resellable > 0 ? 'applied' : 'not_applicable',
      idempotencyKey: resellable > 0 ? idempotencyKey : undefined,
      appliedAt: resellable > 0 ? new Date() : undefined
    };
    record.status = accepted > 0 ? 'refund_pending' : 'inspected';
    record.refund.status = accepted > 0 ? 'review_required' : 'denied';
    record.revision += 1;
    record.history.push({
      action: 'inspected', fromStatus: 'received', toStatus: record.status,
      actor: user._id, note: record.inspection.note, at: new Date()
    });
    await record.save({ session });
    await Order.updateOne(
      { _id: record.order, 'items._id': record.orderItem },
      { $set: { 'items.$.returnStatus': record.status } },
      { session }
    );
    result = record;
  });
  return result;
};

const recordRefundResult = async ({ user, returnId, callbackId, status, reference, amount }) => {
  await assertCapability('returns');
  if (!['platform_admin', 'super_admin'].includes(user.role)) throw fail(403, 'REFUND_FORBIDDEN', 'Platform refund authority is required.');
  if (!['refunded', 'denied'].includes(status) || !String(callbackId || '').trim()) {
    throw fail(400, 'INVALID_REFUND_RESULT', 'A refund status and callback identity are required.');
  }
  const record = await OrderReturn.findById(returnId);
  if (!record) throw fail(404, 'RETURN_NOT_FOUND', 'Return not found.');
  if ((record.refund.callbackIds || []).includes(callbackId)) return { record, idempotent: true };
  if (record.status !== 'refund_pending') throw fail(409, 'REFUND_NOT_READY', 'This return is not awaiting a refund decision.');
  const safeAmount = Number(amount || 0);
  const maximumRefund = Number(record.inspection?.acceptedQuantity || 0) * Number(record.itemSnapshot.unitPrice || 0);
  if (!Number.isFinite(safeAmount) || safeAmount < 0 || safeAmount > maximumRefund) {
    throw fail(400, 'INVALID_REFUND_AMOUNT', 'Refund amount exceeds the accepted historical order amount.');
  }
  const nextStatus = status === 'refunded' ? 'refunded' : 'closed';
  const at = new Date();
  const updated = await OrderReturn.findOneAndUpdate({
    _id: record._id,
    status: 'refund_pending',
    'refund.callbackIds': { $ne: callbackId }
  }, {
    $set: {
      status: nextStatus,
      'refund.status': status,
      'refund.reference': reference,
      'refund.amount': safeAmount,
      'refund.updatedAt': at
    },
    $addToSet: { 'refund.callbackIds': callbackId },
    $push: { history: { action: `refund_${status}`, fromStatus: 'refund_pending', toStatus: nextStatus, actor: user._id, at } },
    $inc: { revision: 1 }
  }, { new: true, runValidators: true });
  if (!updated) {
    const retried = await OrderReturn.findById(record._id);
    if ((retried?.refund?.callbackIds || []).includes(callbackId)) return { record: retried, idempotent: true };
    throw fail(409, 'REFUND_CONFLICT', 'The refund state changed. Refresh and try again.');
  }
  await Order.updateOne({ _id: updated.order, 'items._id': updated.orderItem }, { $set: { 'items.$.returnStatus': updated.status } });
  return { record: updated, idempotent: false };
};

const listOrderReturns = orderId => OrderReturn.find({ order: orderId }).sort({ createdAt: -1 }).lean();

module.exports = {
  inspectVariantReturn,
  listOrderReturns,
  recordRefundResult,
  requestVariantReturn,
  transitionReturnReview
};
