const mongoose = require('mongoose');
const Order = require('../models/Order');
const OrderReturn = require('../models/OrderReturn');
const User = require('../models/User');
const { canOperateStore, getAuthorizedStoreIds, idsEqual } = require('../utils/authorizationPolicy');
const { buildActiveRiderAccountFilter } = require('../services/deliveryAssignmentService');
const { normalizeRole, isStoreAdmin, isOperationalStaff, hasPermission } = require('../config/permissions');
const { cloudinary } = require('../middleware/upload');
const { inferEvidenceFormat, toEvidenceMetadata, createTemporaryEvidenceUrl } = require('../utils/procurementEvidence');
const { requestReturn, transitionReturn, canView, isSeller, isRider, problem } = require('../services/orderReturnService');

const presentReturn = record => {
  const value = record?.toObject ? record.toObject() : record;
  return { ...value, evidence: (value.evidence || []).map(toEvidenceMetadata) };
};
const destroyUnattachedEvidence = async file => {
  if (!file?.filename) return;
  try { await cloudinary.uploader.destroy(file.filename, { resource_type: 'image', type: 'authenticated', invalidate: true }); }
  catch (error) { console.error('Return evidence cleanup failed:', error.name || 'unknown'); }
};

const sendError = (res, error) => {
  if (error.statusCode) return res.status(error.statusCode).json({ code: error.code, message: error.message });
  console.error('Order return operation failed:', error.name || 'unknown');
  return res.status(500).json({ code: 'RETURN_UNAVAILABLE', message: 'Return tracking is temporarily unavailable.' });
};

const getOrderReturns = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.orderId)) throw problem(400, 'INVALID_ORDER_ID', 'Invalid order reference.');
    const order = await Order.findById(req.params.orderId);
    if (!order || order.isDeleted) throw problem(404, 'ORDER_NOT_FOUND', 'Order not found.');
    const customer = req.user.role === 'customer' && idsEqual(order.customer, req.user._id);
    const operator = await canOperateStore(req.user, order.store, ['sales.manage']);
    const riderScope = !customer && !operator && normalizeRole(req.user) === 'delivery_rider'
      && req.user.store && idsEqual(req.user.store, order.store);
    if (!customer && !operator && !riderScope) throw problem(403, 'RETURN_FORBIDDEN', 'Return access denied.');
    const query = { order: order._id, ...(riderScope ? { assignedRider: req.user._id } : {}) };
    const returns = await OrderReturn.find(query).sort({ createdAt: -1 }).lean();
    if (riderScope && returns.length === 0) throw problem(403, 'RETURN_FORBIDDEN', 'Return access denied.');
    return res.json({
      returns: returns.map(presentReturn),
      eligibleItems: customer && ['delivered', 'completed'].includes(order.status) && order.paymentStatus === 'paid'
        ? order.items.filter(item => !returns.some(row => idsEqual(row.orderItem, item._id)))
          .map(item => ({ _id: item._id, name: item.name, quantity: item.quantity }))
        : []
    });
  } catch (error) { return sendError(res, error); }
};

const getMyRiderReturns = async (req, res) => {
  try {
    if (normalizeRole(req.user) !== 'delivery_rider') {
      throw problem(403, 'RETURN_FORBIDDEN', 'Assigned Rider access required.');
    }
    const returns = await OrderReturn.find({ assignedRider: req.user._id, store: req.user.store })
      .sort({ updatedAt: -1 }).limit(50).lean();
    return res.json({ returns: returns.map(presentReturn) });
  } catch (error) { return sendError(res, error); }
};

const getStoreReturns = async (req, res) => {
  try {
    if (!(isStoreAdmin(req.user) || isOperationalStaff(req.user)) || !hasPermission(req.user, 'sales.manage')) {
      throw problem(403, 'RETURN_FORBIDDEN', 'Store return-management permission is required.');
    }
    const storeIds = await getAuthorizedStoreIds(req.user);
    if (!Array.isArray(storeIds) || !storeIds.length) throw problem(403, 'RETURN_FORBIDDEN', 'No authorized Store is available.');
    const returns = await OrderReturn.find({ store: { $in: storeIds } }).sort({ updatedAt: -1 }).limit(100).lean();
    const riders = await User.find(buildActiveRiderAccountFilter({ store: { $in: storeIds } }))
      .select('_id store firstName lastName username').lean();
    return res.json({ returns: returns.map(presentReturn), riders });
  } catch (error) { return sendError(res, error); }
};

const getReturnRiders = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.orderId)) throw problem(400, 'INVALID_ORDER_ID', 'Invalid order reference.');
    const order = await Order.findById(req.params.orderId).select('store');
    if (!order || !(await isSeller(req.user, order.store))) throw problem(403, 'RETURN_FORBIDDEN', 'Store return-management permission is required.');
    const riders = await User.find(buildActiveRiderAccountFilter({ store: order.store }))
      .select('_id firstName lastName username').lean();
    return res.json({ riders });
  } catch (error) { return sendError(res, error); }
};

const createReturn = async (req, res) => {
  try {
    const result = await requestReturn({
      user: req.user, orderId: req.params.orderId, itemId: req.body.itemId, reason: req.body.reason
    });
    return res.status(result.created ? 201 : 200).json({ return: presentReturn(result.record), created: result.created });
  } catch (error) { return sendError(res, error); }
};

const updateReturn = async (req, res) => {
  try {
    const record = await transitionReturn({
      user: req.user, returnId: req.params.id, action: req.body.action,
      note: req.body.note, riderId: req.body.riderId
    });
    return res.json({ return: presentReturn(record) });
  } catch (error) { return sendError(res, error); }
};

const authorizeReturnEvidenceUpload = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw problem(400, 'INVALID_RETURN_ID', 'Invalid return reference.');
    const record = await OrderReturn.findById(req.params.id);
    if (!record) throw problem(404, 'RETURN_NOT_FOUND', 'Return not found.');
    const participant = (req.user.role === 'customer' && idsEqual(req.user._id, record.customer))
      || isRider(req.user, record) || await isSeller(req.user, record.store);
    if (!participant) throw problem(403, 'RETURN_FORBIDDEN', 'Return evidence access denied.');
    if (['completed', 'cancelled', 'rejected'].includes(record.status)) {
      throw problem(409, 'RETURN_CLOSED', 'Evidence cannot be added after the return closes.');
    }
    req.orderReturnForEvidence = record;
    return next();
  } catch (error) { return sendError(res, error); }
};

const uploadReturnEvidence = async (req, res) => {
  try {
    if (!req.file) throw problem(400, 'RETURN_EVIDENCE_REQUIRED', 'Choose an image to attach.');
    const record = req.orderReturnForEvidence;
    const format = inferEvidenceFormat({ url: req.file.path, originalName: req.file.originalname });
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(format)) {
      throw problem(400, 'INVALID_RETURN_EVIDENCE', 'Use a JPG, PNG, or WebP image.');
    }
    const at = new Date();
    const updated = await OrderReturn.findOneAndUpdate(
      { _id: record._id, status: record.status, revision: record.revision },
      { $inc: { revision: 1 }, $push: {
        evidence: { publicId: req.file.filename, deliveryType: 'authenticated', format,
          originalName: req.file.originalname, size: req.file.size, uploadedBy: req.user._id, uploadedAt: at },
        history: { action: 'add_evidence', fromStatus: record.status, toStatus: record.status,
          actor: req.user._id, at }
      } },
      { new: true, runValidators: true }
    );
    if (!updated) throw problem(409, 'RETURN_CONFLICT', 'The return changed. Refresh and try the attachment again.');
    return res.json({ return: presentReturn(updated) });
  } catch (error) {
    await destroyUnattachedEvidence(req.file);
    return sendError(res, error);
  }
};

const getReturnEvidenceAccess = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.evidenceId)) {
      throw problem(400, 'INVALID_RETURN_EVIDENCE', 'Invalid return evidence reference.');
    }
    const record = await OrderReturn.findById(req.params.id);
    if (!record) throw problem(404, 'RETURN_NOT_FOUND', 'Return not found.');
    if (!(await canView(req.user, record))) throw problem(403, 'RETURN_FORBIDDEN', 'Return evidence access denied.');
    const evidence = (record.evidence || []).find(item => idsEqual(item._id, req.params.evidenceId));
    if (!evidence) throw problem(404, 'RETURN_EVIDENCE_NOT_FOUND', 'Return evidence not found.');
    const access = createTemporaryEvidenceUrl({ cloudinary, evidence });
    res.set('Cache-Control', 'no-store, private');
    return res.json({ ...access, evidenceId: evidence._id, originalName: evidence.originalName });
  } catch (error) { return sendError(res, error); }
};

module.exports = { getOrderReturns, getMyRiderReturns, getStoreReturns, getReturnRiders, createReturn, updateReturn,
  authorizeReturnEvidenceUpload, uploadReturnEvidence, getReturnEvidenceAccess, presentReturn };
