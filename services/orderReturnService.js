const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const OrderReturn = require('../models/OrderReturn');
const Store = require('../models/Store');
const User = require('../models/User');
const { createNotification } = require('../controllers/notificationController');
const { canOperateStore, idsEqual } = require('../utils/authorizationPolicy');
const { isStoreAdmin, isOperationalStaff, normalizeRole } = require('../config/permissions');
const { buildActiveRiderAccountFilter } = require('./deliveryAssignmentService');

const STAGES = Object.freeze(['requested', 'approved', 'preparing', 'ready_for_pickup', 'returning', 'arrived', 'completed']);
const NEXT = Object.freeze({
  approve: ['requested', 'approved'], reject: ['requested', 'rejected'],
  prepare: ['approved', 'preparing'], ready: ['preparing', 'ready_for_pickup'],
  pickup: ['ready_for_pickup', 'returning'], arrive: ['returning', 'arrived'],
  complete: ['arrived', 'completed']
});
const problem = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });
const noteValue = (value, required = false) => {
  if (value !== undefined && typeof value !== 'string') throw problem(400, 'INVALID_RETURN_NOTE', 'Enter a valid return note.');
  const note = (value || '').trim();
  if (note.length > 1000 || (required && note.length < 3)) throw problem(400, 'INVALID_RETURN_NOTE', 'Enter a return reason between 3 and 1000 characters.');
  return note;
};
const isSeller = async (user, store) => (isStoreAdmin(user) || isOperationalStaff(user))
  && canOperateStore(user, store, ['sales.manage', 'orders.update']);
const isRider = (user, record) => normalizeRole(user) === 'delivery_rider'
  && idsEqual(user.store, record.store) && idsEqual(user._id, record.assignedRider);
const canView = async (user, record) => idsEqual(user?._id, record.customer)
  || isRider(user, record) || await canOperateStore(user, record.store, ['sales.manage']);

// Pure state-machine check. Authorization and persistence are enforced again in transitionReturn.
const planTransition = (record, action, { seller, rider, customer }) => {
  const current = record.status;
  if (['completed', 'rejected', 'cancelled'].includes(current)) throw problem(409, 'RETURN_CLOSED', 'This return is already closed.');
  const sellerActions = ['approve', 'reject', 'prepare', 'ready', 'assign_rider', 'confirm_receipt', 'complete', 'resolve_exception'];
  const transportActions = ['pickup', 'arrive', 'report_delayed', 'report_pickup_failed'];
  if (sellerActions.includes(action) && !seller) throw problem(403, 'RETURN_FORBIDDEN', 'Store return-management permission is required.');
  if (transportActions.includes(action) && !seller && !rider) throw problem(403, 'RETURN_FORBIDDEN', 'Only the assigned Rider or authorized Store staff can update transport.');
  if (action === 'cancel' && !seller && !(customer && current === 'requested')) {
    throw problem(403, 'RETURN_FORBIDDEN', 'Only the requester can cancel a pending return; later cancellation requires Store review.');
  }
  if (record.exception?.kind && action !== 'resolve_exception' && action !== 'cancel') {
    throw problem(409, 'RETURN_EXCEPTION_OPEN', 'Resolve the return exception before moving to the next stage.');
  }
  if (NEXT[action]) {
    if (current !== NEXT[action][0]) throw problem(409, 'INVALID_RETURN_TRANSITION', 'This return stage cannot be skipped or repeated.');
    if (action === 'complete' && !record.sellerReceipt?.confirmedAt) {
      throw problem(409, 'SELLER_RECEIPT_REQUIRED', 'The Store must confirm physical receipt before completion.');
    }
    return NEXT[action][1];
  }
  if (action === 'confirm_receipt') {
    if (current !== 'arrived' || record.sellerReceipt?.confirmedAt) throw problem(409, 'INVALID_RETURN_TRANSITION', 'Seller receipt can be confirmed once after arrival.');
    return current;
  }
  if (action === 'assign_rider') {
    if (current !== 'ready_for_pickup' || record.assignedRider) throw problem(409, 'INVALID_RETURN_TRANSITION', 'Assign one Rider after the return is ready.');
    return current;
  }
  if (action === 'report_delayed' || action === 'report_pickup_failed') {
    if (!['ready_for_pickup', 'returning'].includes(current) || (action === 'report_pickup_failed' && current !== 'ready_for_pickup')) {
      throw problem(409, 'INVALID_RETURN_TRANSITION', 'This exception does not apply at the current stage.');
    }
    return current;
  }
  if (action === 'resolve_exception') {
    if (!record.exception?.kind) throw problem(409, 'INVALID_RETURN_TRANSITION', 'There is no open return exception.');
    return current;
  }
  if (action === 'cancel') {
    if (!['requested', 'approved', 'preparing', 'ready_for_pickup'].includes(current)) {
      throw problem(409, 'INVALID_RETURN_TRANSITION', 'A return already in transport cannot be cancelled here.');
    }
    return 'cancelled';
  }
  throw problem(400, 'INVALID_RETURN_ACTION', 'Unknown return action.');
};

const notifyParticipants = async (record, actor, action) => {
  try {
    const store = await Store.findById(record.store).select('owner');
    const recipients = [
      { id: record.customer, url: `/orders/${record.order}` },
      { id: store?.owner, url: `/admin/orders/${record.order}` },
      { id: record.assignedRider, url: '/rider/returns' }
    ].filter(row => row.id && !idsEqual(row.id, actor));
    await Promise.allSettled(recipients.filter((row, i) =>
      recipients.findIndex(other => idsEqual(other.id, row.id)) === i
    ).map(row => createNotification({
      recipient: row.id, sender: actor, type: 'order_status',
      title: 'Return to Seller update',
      message: `Return ${action.replaceAll('_', ' ')}: ${record.itemSnapshot.name}.`,
      relatedId: record.order, relatedModel: 'Order', targetUrl: row.url
    })));
  } catch (error) {
    // The committed return state remains authoritative; notification delivery is best effort.
    console.error('Return notification dispatch failed:', error.name || 'unknown');
  }
};

const requestReturn = async ({ user, orderId, itemId, reason }) => {
  if (user.role !== 'customer' || !mongoose.isValidObjectId(orderId) || !mongoose.isValidObjectId(itemId)) {
    throw problem(403, 'RETURN_FORBIDDEN', 'Only the purchasing customer can request this item return.');
  }
  const order = await Order.findById(orderId);
  if (!order || order.isDeleted || !idsEqual(order.customer, user._id)) throw problem(404, 'ORDER_NOT_FOUND', 'Order not found.');
  if (!['delivered', 'completed'].includes(order.status) || order.paymentStatus !== 'paid' || !order.store) {
    throw problem(409, 'RETURN_NOT_ELIGIBLE', 'Only paid, delivered items can enter Store return review.');
  }
  const item = order.items.find(row => idsEqual(row._id, itemId));
  if (!item) throw problem(404, 'ORDER_ITEM_NOT_FOUND', 'This item is not part of the order.');
  const existing = await OrderReturn.findOne({ order: order._id, orderItem: item._id });
  if (existing) return { record: existing, created: false };
  const note = noteValue(reason, true);
  const at = new Date();
  const deterministicId = new mongoose.Types.ObjectId(crypto.createHash('sha256')
    .update(`${order._id}:${item._id}`).digest().subarray(0, 12));
  try {
    const record = await OrderReturn.create({
      _id: deterministicId, order: order._id, orderItem: item._id,
      itemSnapshot: { name: item.name, itemType: item.itemType, quantity: item.quantity },
      customer: order.customer, store: order.store, status: 'requested',
      history: [{ action: 'request', toStatus: 'requested', actor: user._id, at, note }]
    });
    await notifyParticipants(record, user._id, 'requested');
    return { record, created: true };
  } catch (error) {
    if (error.code === 11000) {
      const record = await OrderReturn.findOne({ order: order._id, orderItem: item._id });
      if (record) return { record, created: false };
    }
    throw error;
  }
};

const transitionReturn = async ({ user, returnId, action, note, riderId }) => {
  if (!mongoose.isValidObjectId(returnId)) throw problem(400, 'INVALID_RETURN_ID', 'Invalid return reference.');
  const record = await OrderReturn.findById(returnId);
  if (!record) throw problem(404, 'RETURN_NOT_FOUND', 'Return not found.');
  const seller = await isSeller(user, record.store);
  const rider = isRider(user, record);
  const customer = idsEqual(user._id, record.customer) && user.role === 'customer';
  const nextStatus = planTransition(record, action, { seller, rider, customer });
  const requiredReason = ['reject', 'cancel', 'report_delayed', 'report_pickup_failed'].includes(action);
  const safeNote = noteValue(note, requiredReason);
  const at = new Date();
  const set = {};
  if (nextStatus !== record.status) set.status = nextStatus;
  if (action === 'assign_rider') {
    if (!mongoose.isValidObjectId(riderId)) throw problem(400, 'INVALID_RIDER', 'Select a valid Rider.');
    const assignee = await User.findOne(buildActiveRiderAccountFilter({ _id: riderId, store: record.store }));
    if (!assignee) throw problem(400, 'INVALID_RIDER', 'Select an active Rider from this Store.');
    set.assignedRider = assignee._id;
  }
  if (action === 'confirm_receipt') set.sellerReceipt = { confirmedAt: at, confirmedBy: user._id, note: safeNote };
  if (action === 'report_delayed' || action === 'report_pickup_failed') {
    set.exception = { kind: action === 'report_delayed' ? 'delayed' : 'pickup_failed',
      reason: safeNote, reportedAt: at, reportedBy: user._id };
  }
  if (action === 'resolve_exception') set.exception = { kind: null };
  const updated = await OrderReturn.findOneAndUpdate(
    { _id: record._id, status: record.status, revision: record.revision,
      ...(action === 'complete' ? { 'sellerReceipt.confirmedAt': { $exists: true } } : {}) },
    { $set: set, $inc: { revision: 1 }, $push: { history: {
      action, fromStatus: record.status, toStatus: nextStatus, actor: user._id, at, note: safeNote
    } } },
    { new: true, runValidators: true }
  );
  if (!updated) throw problem(409, 'RETURN_CONFLICT', 'The return changed. Refresh and try again.');
  await notifyParticipants(updated, user._id, action);
  return updated;
};

module.exports = { STAGES, planTransition, requestReturn, transitionReturn, canView, isSeller, isRider, problem };
