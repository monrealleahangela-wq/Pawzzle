const {
  inspectVariantReturn, listOrderReturns, recordRefundResult,
  requestVariantReturn, transitionReturnReview
} = require('../services/orderReturnLifecycleService');
const Order = require('../models/Order');
const { canOperateStore, idsEqual } = require('../utils/authorizationPolicy');
const { isPlatformAdmin } = require('../config/permissions');

const sendError = (res, error) => res.status(error.statusCode || 500).json({
  code: error.code || 'RETURN_UNAVAILABLE',
  message: error.statusCode ? error.message : 'Return processing is temporarily unavailable.'
});

const listForOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).select('customer store');
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    const allowed = idsEqual(order.customer, req.user._id) || isPlatformAdmin(req.user)
      || await canOperateStore(req.user, order.store, ['sales.view', 'sales.manage', 'orders.view']);
    if (!allowed) return res.status(403).json({ message: 'Return access denied.' });
    return res.json({ returns: await listOrderReturns(order._id) });
  } catch (error) { return sendError(res, error); }
};

const create = async (req, res) => {
  try {
    const result = await requestVariantReturn({
      user: req.user, orderId: req.params.orderId, itemId: req.body.itemId,
      quantity: req.body.quantity, reason: req.body.reason
    });
    return res.status(result.created ? 201 : 200).json({ return: result.record, created: result.created });
  } catch (error) { return sendError(res, error); }
};

const transition = async (req, res) => {
  try {
    const record = await transitionReturnReview({ user: req.user, returnId: req.params.id, action: req.body.action, note: req.body.note });
    return res.json({ return: record });
  } catch (error) { return sendError(res, error); }
};

const inspect = async (req, res) => {
  try {
    const record = await inspectVariantReturn({
      user: req.user, returnId: req.params.id,
      acceptedQuantity: req.body.acceptedQuantity,
      resellableQuantity: req.body.resellableQuantity,
      note: req.body.note
    });
    return res.json({ return: record });
  } catch (error) { return sendError(res, error); }
};

const refundResult = async (req, res) => {
  try {
    const result = await recordRefundResult({
      user: req.user, returnId: req.params.id, callbackId: req.body.callbackId,
      status: req.body.status, reference: req.body.reference, amount: req.body.amount
    });
    return res.json({ return: result.record, idempotent: result.idempotent });
  } catch (error) { return sendError(res, error); }
};

module.exports = { create, inspect, listForOrder, refundResult, transition };
