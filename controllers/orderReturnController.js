const Order = require('../models/Order');
const OrderReturn = require('../models/OrderReturn');
const { cloudinary } = require('../middleware/upload');
const { createTemporaryEvidenceUrl } = require('../utils/procurementEvidence');
const { canOperateStore, getAuthorizedStoreIds, hasAnyPermission, idsEqual } = require('../utils/authorizationPolicy');
const { isOperationalStaff, isPlatformAdmin, isStoreAdmin } = require('../config/permissions');
const {
  confirmCustomerResolution,
  confirmReturnReceived,
  decideDispute,
  decideReturnCase,
  evidenceFromFiles,
  finalizeInspectionResolution,
  getReturnCase,
  inspectVariantReturn,
  initiatePayMongoRefund,
  listOrderReturns,
  listStoreReturns,
  openDispute,
  prepareReplacement,
  recordRefundResult,
  requestVariantReturn,
  scheduleReturnPickup,
  transitionReturnReview
} = require('../services/orderReturnLifecycleService');

const sendError = (res, error) => {
  if (!error.statusCode) console.error('Order return operation failed:', error);
  return res.status(error.statusCode || 500).json({
    code: error.code || 'RETURN_UNAVAILABLE',
    message: error.statusCode ? error.message : 'Return processing is temporarily unavailable.'
  });
};

const evidenceMetadata = evidence => ({
  _id: evidence._id,
  resourceType: evidence.resourceType,
  format: evidence.format,
  originalName: evidence.originalName,
  size: evidence.size,
  uploadedBy: evidence.uploadedBy,
  uploadedAt: evidence.uploadedAt
});

const presentReturn = record => {
  const value = record?.toObject ? record.toObject() : { ...record };
  const mapEvidence = list => (list || []).map(evidenceMetadata);
  value.evidence = mapEvidence(value.evidence);
  if (value.pickup) {
    value.pickup.evidence = mapEvidence(value.pickup.evidence);
    delete value.pickup.verificationCode;
  }
  if (value.inspection) value.inspection.evidence = mapEvidence(value.inspection.evidence);
  return value;
};

const removeUploadedFiles = async files => Promise.allSettled((files || []).map(file => cloudinary.uploader.destroy(
  file.filename,
  {
    resource_type: String(file.mimetype || '').startsWith('video/') ? 'video' : 'image',
    type: 'authenticated',
    invalidate: true
  }
)));

const listForOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).select('customer store status paymentStatus items');
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    const allowed = idsEqual(order.customer, req.user._id) || isPlatformAdmin(req.user)
      || await canOperateStore(req.user, order.store, ['sales.view', 'sales.manage', 'orders.view']);
    if (!allowed) return res.status(403).json({ message: 'Return access denied.' });
    const returns = await listOrderReturns(order._id);
    return res.json({
      returns: returns.map(presentReturn),
      eligibleItems: req.user.role === 'customer' && ['delivered', 'completed', 'finalized'].includes(order.status) && order.paymentStatus === 'paid'
        ? order.items.filter(item => item.itemType === 'product' && !returns.some(row => idsEqual(row.orderItem, item._id)))
          .map(item => ({ _id: item._id, name: item.name, quantity: item.quantity, price: item.price, image: item.image }))
        : []
    });
  } catch (error) { return sendError(res, error); }
};

const getOne = async (req, res) => {
  try {
    const record = await getReturnCase({ user: req.user, returnId: req.params.id });
    return res.json({ return: presentReturn(record) });
  } catch (error) { return sendError(res, error); }
};

const listForStore = async (req, res) => {
  try {
    const storeIds = await getAuthorizedStoreIds(req.user);
    const authorized = isPlatformAdmin(req.user) || ((isStoreAdmin(req.user) || isOperationalStaff(req.user))
      && hasAnyPermission(req.user, ['sales.view', 'sales.manage', 'orders.view'])
      && (storeIds === null || storeIds.length > 0));
    if (!authorized) return res.status(403).json({ message: 'Store return-management permission is required.' });
    const returns = await listStoreReturns(req.user);
    return res.json({ returns: returns.map(presentReturn) });
  } catch (error) { return sendError(res, error); }
};

const listForAdmin = async (req, res) => {
  try {
    if (!isPlatformAdmin(req.user)) return res.status(403).json({ message: 'Platform administrator access is required.' });
    const returns = await listStoreReturns(req.user);
    return res.json({ returns: returns.map(presentReturn) });
  } catch (error) { return sendError(res, error); }
};

const create = async (req, res) => {
  try {
    const evidence = evidenceFromFiles(req.files, req.user._id);
    const result = await requestVariantReturn({
      user: req.user,
      orderId: req.params.orderId,
      itemId: req.body.itemId,
      quantity: req.body.quantity,
      reason: req.body.description || req.body.reason,
      description: req.body.description,
      issueType: req.body.issueType,
      requestedResolution: req.body.requestedResolution,
      evidence
    });
    if (!result.created && req.files?.length) await removeUploadedFiles(req.files);
    return res.status(result.created ? 201 : 200).json({ return: presentReturn(result.record), created: result.created });
  } catch (error) {
    if (req.files?.length) await removeUploadedFiles(req.files);
    return sendError(res, error);
  }
};

const transition = async (req, res) => {
  try {
    const record = await transitionReturnReview({ user: req.user, returnId: req.params.id, action: req.body.action, note: req.body.note });
    return res.json({ return: presentReturn(record) });
  } catch (error) { return sendError(res, error); }
};

const decision = async (req, res) => {
  try {
    const record = await decideReturnCase({
      user: req.user, returnId: req.params.id, decision: req.body.decision,
      reason: req.body.reason, otherEligibleCharges: req.body.otherEligibleCharges
    });
    return res.json({ return: presentReturn(record) });
  } catch (error) { return sendError(res, error); }
};

const schedulePickup = async (req, res) => {
  try {
    const result = await scheduleReturnPickup({ user: req.user, returnId: req.params.id, scheduledAt: req.body.scheduledAt });
    return res.status(result.assignmentError ? 202 : 201).json({
      return: presentReturn(result.record),
      delivery: result.delivery,
      assignmentWarning: result.assignmentError?.message,
      // The seller can relay this code, while the customer retrieves the same
      // value from the authenticated pickup-code endpoint.
      verificationCode: result.verificationCode
    });
  } catch (error) { return sendError(res, error); }
};

const pickupCode = async (req, res) => {
  try {
    const record = await OrderReturn.findById(req.params.id).select('customer status pickup.verificationCodeLast4 +pickup.verificationCode');
    if (!record || !idsEqual(record.customer, req.user._id) || req.user.role !== 'customer') {
      return res.status(404).json({ message: 'Return pickup code not found.' });
    }
    if (!record.pickup?.verificationCode) return res.status(409).json({ message: 'The return pickup has not been scheduled.' });
    return res.set('Cache-Control', 'no-store, private').json({
      verificationCode: record.pickup.verificationCode,
      last4: record.pickup.verificationCodeLast4
    });
  } catch (error) { return sendError(res, error); }
};

const confirmReceived = async (req, res) => {
  try {
    const record = await confirmReturnReceived({ user: req.user, returnId: req.params.id, note: req.body.note });
    return res.json({ return: presentReturn(record) });
  } catch (error) { return sendError(res, error); }
};

const inspect = async (req, res) => {
  try {
    const evidence = evidenceFromFiles(req.files, req.user._id);
    const record = await inspectVariantReturn({
      user: req.user, returnId: req.params.id,
      acceptedQuantity: req.body.acceptedQuantity,
      resellableQuantity: req.body.resellableQuantity,
      outcome: req.body.outcome,
      note: req.body.note,
      evidence
    });
    return res.json({ return: presentReturn(record) });
  } catch (error) {
    if (req.files?.length) await removeUploadedFiles(req.files);
    return sendError(res, error);
  }
};

const finalResolution = async (req, res) => {
  try {
    const record = await finalizeInspectionResolution({
      user: req.user, returnId: req.params.id, resolution: req.body.resolution,
      reason: req.body.reason, otherEligibleCharges: req.body.otherEligibleCharges
    });
    return res.json({ return: presentReturn(record) });
  } catch (error) { return sendError(res, error); }
};

const prepareReplacementShipment = async (req, res) => {
  try {
    const result = await prepareReplacement({ user: req.user, returnId: req.params.id });
    return res.status(result.assignmentError ? 202 : 201).json({
      return: presentReturn(result.record), delivery: result.delivery,
      assignmentWarning: result.assignmentError?.message
    });
  } catch (error) { return sendError(res, error); }
};

const dispute = async (req, res) => {
  try {
    const record = await openDispute({ user: req.user, returnId: req.params.id, reason: req.body.reason });
    return res.json({ return: presentReturn(record) });
  } catch (error) { return sendError(res, error); }
};

const customerConfirm = async (req, res) => {
  try {
    const record = await confirmCustomerResolution({
      user: req.user, returnId: req.params.id, resolved: req.body.resolved === true, note: req.body.note
    });
    return res.json({ return: presentReturn(record) });
  } catch (error) { return sendError(res, error); }
};

const adminDecision = async (req, res) => {
  try {
    const record = await decideDispute({
      user: req.user, returnId: req.params.id, decision: req.body.decision,
      reason: req.body.reason, otherEligibleCharges: req.body.otherEligibleCharges
    });
    return res.json({ return: presentReturn(record) });
  } catch (error) { return sendError(res, error); }
};

const refundResult = async (req, res) => {
  try {
    const result = await recordRefundResult({
      user: req.user, returnId: req.params.id, callbackId: req.body.callbackId,
      status: req.body.status, reference: req.body.reference, amount: req.body.amount
    });
    return res.json({ return: presentReturn(result.record), idempotent: result.idempotent });
  } catch (error) { return sendError(res, error); }
};

const processPayMongoRefund = async (req, res) => {
  try {
    const result = await initiatePayMongoRefund({ user: req.user, returnId: req.params.id });
    return res.json({ return: presentReturn(result.record), idempotent: result.idempotent });
  } catch (error) { return sendError(res, error); }
};

const evidenceAccess = async (req, res) => {
  try {
    const record = await getReturnCase({ user: req.user, returnId: req.params.id });
    const evidenceId = req.params.evidenceId;
    const allEvidence = [
      ...(record.evidence || []),
      ...(record.pickup?.evidence || []),
      ...(record.inspection?.evidence || [])
    ];
    const evidence = allEvidence.find(row => idsEqual(row._id, evidenceId));
    if (!evidence) return res.status(404).json({ message: 'Return evidence not found.' });
    const access = createTemporaryEvidenceUrl({ cloudinary, evidence });
    return res.set('Cache-Control', 'no-store, private').json(access);
  } catch (error) { return sendError(res, error); }
};

module.exports = {
  adminDecision,
  confirmReceived,
  create,
  customerConfirm,
  decision,
  dispute,
  evidenceAccess,
  finalResolution,
  getOne,
  inspect,
  listForAdmin,
  listForOrder,
  listForStore,
  pickupCode,
  prepareReplacementShipment,
  processPayMongoRefund,
  refundResult,
  schedulePickup,
  transition
};
