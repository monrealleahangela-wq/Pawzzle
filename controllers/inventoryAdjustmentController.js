const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const Inventory = require('../models/Inventory');
const InventoryAdjustmentRequest = require('../models/InventoryAdjustmentRequest');
const InventoryTransaction = require('../models/InventoryTransaction');
const Store = require('../models/Store');
const StockSyncService = require('../services/stockSyncService');
const { canOperateStore } = require('../utils/authorizationPolicy');
const { isPlatformAdmin, normalizeRole } = require('../config/permissions');

const toId = value => String(value?._id || value || '');

const resolveStore = async (user) => {
  if (user?.store) return user.store;
  const owned = await Store.findOne({ owner: user?._id }).select('_id');
  return owned?._id || null;
};

const getStoreAuthority = async (user, storeId) => {
  if (isPlatformAdmin(user)) return { canReview: true, isOwner: false };
  const store = await Store.findById(storeId).select('owner');
  const isOwner = toId(store?.owner) === toId(user?._id);
  const isAssignedManager = normalizeRole(user) === 'manager' && toId(user?.store) === toId(storeId);
  const canReview = isOwner || isAssignedManager;
  return { canReview, isOwner };
};

const emitInventoryUpdate = (req, inventory, oldQuantity, operation = 'subtract') => {
  const io = req.app.get('socketio');
  if (!io) return;
  const updateData = {
    storeId: inventory.store,
    inventoryId: inventory._id,
    productId: inventory.product,
    productVariantId: inventory.productVariant,
    quantity: inventory.quantity,
    oldQuantity,
    operation
  };
  io.to(`store_${inventory.store}`).emit('inventoryUpdate', updateData);
  io.to('admin_global').emit('inventoryUpdate', updateData);
};

const applyApprovedReduction = async ({ requestId, reviewer, reviewNotes, allowOwnerSelfApproval = false }) => {
  const session = await mongoose.startSession();
  let applied;

  try {
    await session.withTransaction(async () => {
      const request = await InventoryAdjustmentRequest.findOne({ _id: requestId, status: 'pending' }).session(session);
      if (!request) {
        const error = new Error('This stock request has already been reviewed.');
        error.status = 409;
        throw error;
      }
      if (!allowOwnerSelfApproval && toId(request.requestedBy) === toId(reviewer._id)) {
        const error = new Error('You cannot approve your own stock reduction request.');
        error.status = 403;
        throw error;
      }

      const inventory = await Inventory.findOneAndUpdate(
        {
          _id: request.inventory,
          store: request.store,
          product: request.product,
          quantity: { $gte: request.quantity },
          $expr: { $gte: [{ $subtract: ['$quantity', { $ifNull: ['$reservedQuantity', 0] }] }, request.quantity] }
        },
        { $inc: { quantity: -request.quantity } },
        { new: true, session }
      );
      if (!inventory) {
        const error = new Error('There is not enough unreserved stock to approve this request.');
        error.status = 409;
        throw error;
      }

      const [transaction] = await InventoryTransaction.create([{
        store: request.store,
        product: request.product,
        productVariant: request.productVariant,
        type: request.adjustmentType === 'damage' ? 'damage'
          : request.adjustmentType === 'expired' ? 'expiry'
            : request.adjustmentType === 'internal_use' ? 'service_use'
              : 'adjustment_out',
        quantity: request.quantity,
        signedQuantity: -request.quantity,
        referenceType: 'InventoryAdjustmentRequest',
        referenceId: request._id,
        idempotencyKey: `inventory-adjustment:${request._id}`,
        reason: request.reason,
        performedBy: reviewer._id
      }], { session });

      request.status = 'approved';
      request.reviewedBy = reviewer._id;
      request.reviewedAt = new Date();
      request.reviewNotes = reviewNotes || '';
      request.appliedTransaction = transaction._id;
      request.appliedAt = new Date();
      request.stockAfter = inventory.quantity;
      await request.save({ session });
      applied = { request, inventory, oldQuantity: inventory.quantity + request.quantity };
    });
  } finally {
    await session.endSession();
  }

  await StockSyncService.updateProductStockFromInventory(applied.request.product);
  return applied;
};

const listAdjustmentRequests = async (req, res) => {
  try {
    const storeId = await resolveStore(req.user);
    if (!storeId) return res.status(403).json({ message: 'A store assignment is required.' });
    const authority = await getStoreAuthority(req.user, storeId);
    const filter = { store: storeId };
    if (!authority.canReview) filter.requestedBy = req.user._id;
    if (req.query.status) filter.status = req.query.status;

    const requests = await InventoryAdjustmentRequest.find(filter)
      .populate('product', 'name sku images')
      .populate('productVariant', 'sku attributes images')
      .populate('requestedBy', 'firstName lastName username email role staffType')
      .populate('reviewedBy', 'firstName lastName username email role staffType')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ requests, canReview: authority.canReview, isOwner: authority.isOwner });
  } catch (error) {
    console.error('List inventory adjustment requests error:', error);
    res.status(500).json({ message: 'Unable to load stock reduction requests.' });
  }
};

const createAdjustmentRequest = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
    const { inventoryId, quantity, adjustmentType, reason, evidence = [] } = req.body;
    const inventory = await Inventory.findById(inventoryId);
    if (!inventory || !inventory.isActive) return res.status(404).json({ message: 'Inventory item not found.' });
    if (!(await canOperateStore(req.user, inventory.store, ['inventory.adjust']))) {
      return res.status(403).json({ message: 'You cannot adjust inventory for this store.' });
    }
    const authority = await getStoreAuthority(req.user, inventory.store);
    const amount = Number(quantity);
    const cleanReason = String(reason || '').trim();
    const cleanEvidence = Array.isArray(evidence)
      ? evidence.filter(item => item && typeof item.url === 'string' && item.url.trim()).slice(0, 5)
      : [];
    const available = Math.max(0, Number(inventory.quantity) - Number(inventory.reservedQuantity || 0));

    if (!Number.isInteger(amount) || amount < 1) return res.status(400).json({ message: 'Enter a whole number greater than 0.' });
    if (amount > available) return res.status(409).json({ message: `Only ${available} unreserved item${available === 1 ? '' : 's'} can be reduced.` });
    if (cleanReason.length < 8) return res.status(400).json({ message: 'Provide a clear reason of at least 8 characters.' });
    if (!authority.isOwner && cleanEvidence.length === 0) {
      return res.status(400).json({ message: 'Inventory staff and managers must attach evidence.' });
    }

    const request = await InventoryAdjustmentRequest.create({
      store: inventory.store,
      inventory: inventory._id,
      product: inventory.product,
      productVariant: inventory.productVariant,
      adjustmentType,
      quantity: amount,
      stockBefore: inventory.quantity,
      stockAfter: inventory.quantity - amount,
      reason: cleanReason,
      evidence: cleanEvidence,
      requestedBy: req.user._id
    });

    if (authority.isOwner) {
      const applied = await applyApprovedReduction({
        requestId: request._id,
        reviewer: req.user,
        reviewNotes: 'Applied directly by the store owner.',
        allowOwnerSelfApproval: true
      });
      emitInventoryUpdate(req, applied.inventory, applied.oldQuantity);
      const populated = await InventoryAdjustmentRequest.findById(request._id)
        .populate('product', 'name sku images')
        .populate('requestedBy', 'firstName lastName username role staffType')
        .populate('reviewedBy', 'firstName lastName username role staffType');
      return res.status(201).json({
        message: 'Stock reduced and recorded in the inventory audit trail.',
        request: populated,
        appliedImmediately: true
      });
    }

    const populated = await InventoryAdjustmentRequest.findById(request._id)
      .populate('product', 'name sku images')
      .populate('requestedBy', 'firstName lastName username role staffType');
    res.status(201).json({
      message: 'Reduction request submitted for owner or manager approval. Stock has not changed yet.',
      request: populated,
      appliedImmediately: false
    });
  } catch (error) {
    console.error('Create inventory adjustment request error:', error);
    res.status(error.status || 500).json({ message: error.message || 'Unable to submit the stock reduction request.' });
  }
};

const reviewAdjustmentRequest = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
    const request = await InventoryAdjustmentRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Stock reduction request not found.' });
    const authority = await getStoreAuthority(req.user, request.store);
    if (!authority.canReview) return res.status(403).json({ message: 'Only the store owner or a manager may review stock reductions.' });
    if (toId(request.requestedBy) === toId(req.user._id)) {
      return res.status(403).json({ message: 'You cannot review your own stock reduction request.' });
    }
    if (request.status !== 'pending') return res.status(409).json({ message: 'This request has already been reviewed.' });

    const decision = req.body.decision;
    const reviewNotes = String(req.body.reviewNotes || '').trim();
    if (decision === 'reject') {
      if (reviewNotes.length < 3) return res.status(400).json({ message: 'Add a short explanation for the rejection.' });
      const rejected = await InventoryAdjustmentRequest.findOneAndUpdate(
        { _id: request._id, status: 'pending' },
        { $set: { status: 'rejected', reviewedBy: req.user._id, reviewedAt: new Date(), reviewNotes } },
        { new: true }
      );
      if (!rejected) return res.status(409).json({ message: 'This request has already been reviewed.' });
      return res.json({ message: 'Stock reduction request rejected. No stock was changed.', request: rejected });
    }
    if (decision !== 'approve') return res.status(400).json({ message: 'Choose approve or reject.' });

    const applied = await applyApprovedReduction({ requestId: request._id, reviewer: req.user, reviewNotes });
    emitInventoryUpdate(req, applied.inventory, applied.oldQuantity);
    const populated = await InventoryAdjustmentRequest.findById(request._id)
      .populate('product', 'name sku images')
      .populate('requestedBy', 'firstName lastName username role staffType')
      .populate('reviewedBy', 'firstName lastName username role staffType');
    res.json({ message: 'Stock reduction approved and applied.', request: populated });
  } catch (error) {
    console.error('Review inventory adjustment request error:', error);
    res.status(error.status || 500).json({ message: error.message || 'Unable to review the stock reduction request.' });
  }
};

module.exports = {
  listAdjustmentRequests,
  createAdjustmentRequest,
  reviewAdjustmentRequest
};
