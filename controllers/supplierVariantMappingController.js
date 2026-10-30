const mongoose = require('mongoose');
const Store = require('../models/Store');
const Supplier = require('../models/Supplier');
const SupplierVariantMapping = require('../models/SupplierVariantMapping');
const { canOperateStore } = require('../utils/authorizationPolicy');
const { isSupplierSelectableForStore } = require('../utils/supplierLifecycle');
const { assertVariantMappingWritesEnabled } = require('../services/variantProcurementReadinessService');
const { validateMappingReferences } = require('../services/supplierVariantMappingService');

const resolveUserStore = async user => {
  if (user.store) return user.store._id || user.store;
  const store = await Store.findOne({ owner: user._id, isDeleted: { $ne: true } }).select('_id');
  return store?._id || null;
};

const listVariantMappings = async (req, res) => {
  try {
    const store = await resolveUserStore(req.user);
    if (!store || !(await canOperateStore(req.user, store, ['procurement.view', 'procurement.manage', 'inventory.receive']))) {
      return res.status(403).json({ message: 'Authorized store not found.' });
    }
    const mappings = await SupplierVariantMapping.find({ store })
      .populate('sellerProduct', 'name sku productMode')
      .populate('sellerVariant', 'sku attributes isActive isDiscontinued')
      .populate('supplier', 'businessName')
      .populate('supplierProduct', 'name sku productMode category')
      .populate('supplierVariant', 'sku attributes wholesalePrice availableStock minimumOrderQuantity isActive isDiscontinued regulatoryReview')
      .sort({ status: 1, sourcePriority: 1, createdAt: -1 });
    return res.json({ mappings });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to load variant mappings.' });
  }
};

const createVariantMapping = async (req, res) => {
  try {
    await assertVariantMappingWritesEnabled();
    const store = await resolveUserStore(req.user);
    if (!store || !(await canOperateStore(req.user, store, ['procurement.manage', 'inventory.receive']))) {
      return res.status(403).json({ message: 'Authorized store not found.' });
    }
    const references = await validateMappingReferences({
      storeId: store,
      sellerVariantId: req.body.sellerVariantId,
      supplierVariantId: req.body.supplierVariantId
    });
    const supplier = await Supplier.findById(references.supplierProduct.supplier);
    if (!isSupplierSelectableForStore(supplier, store)) {
      return res.status(409).json({ message: 'This supplier is not eligible for the authorized store.' });
    }
    const confirmed = req.body.confirm === true;
    const mapping = await SupplierVariantMapping.create({
      store,
      sellerProduct: references.sellerProduct._id,
      sellerVariant: references.sellerVariant._id,
      supplier: references.supplierProduct.supplier,
      supplierProduct: references.supplierProduct._id,
      supplierVariant: references.supplierVariant._id,
      status: confirmed ? 'confirmed' : 'pending',
      sourcePriority: Number(req.body.sourcePriority || 1),
      confirmedBy: confirmed ? req.user._id : undefined,
      confirmedAt: confirmed ? new Date() : undefined,
      notes: req.body.notes,
      statusHistory: [{ status: confirmed ? 'confirmed' : 'pending', actor: req.user._id, notes: req.body.notes }]
    });
    return res.status(201).json({ mapping });
  } catch (error) {
    const status = error.code === 11000 ? 409 : (error.statusCode || (error.name === 'ValidationError' ? 400 : 500));
    return res.status(status).json({
      code: error.code === 11000 ? 'VARIANT_MAPPING_EXISTS' : error.code,
      message: error.code === 11000 ? 'This supplier variant is already mapped to that seller variant.' : (error.message || 'Unable to create variant mapping.')
    });
  }
};

const updateVariantMappingStatus = async (req, res) => {
  try {
    await assertVariantMappingWritesEnabled();
    const store = await resolveUserStore(req.user);
    if (!store || !(await canOperateStore(req.user, store, ['procurement.manage', 'inventory.receive']))) {
      return res.status(403).json({ message: 'Authorized store not found.' });
    }
    if (!mongoose.isValidObjectId(req.params.id) || !['confirmed', 'rejected', 'inactive'].includes(req.body.status)) {
      return res.status(400).json({ message: 'Select a valid mapping status.' });
    }
    const mapping = await SupplierVariantMapping.findOne({ _id: req.params.id, store });
    if (!mapping) return res.status(404).json({ message: 'Variant mapping not found.' });
    if (req.body.status === 'confirmed') {
      await validateMappingReferences({
        storeId: store,
        sellerVariantId: mapping.sellerVariant,
        supplierVariantId: mapping.supplierVariant
      });
      mapping.confirmedBy = req.user._id;
      mapping.confirmedAt = new Date();
    } else {
      mapping.deactivatedBy = req.user._id;
      mapping.deactivatedAt = new Date();
    }
    mapping.status = req.body.status;
    if (req.body.sourcePriority !== undefined) mapping.sourcePriority = Number(req.body.sourcePriority);
    if (req.body.notes !== undefined) mapping.notes = req.body.notes;
    mapping.statusHistory.push({ status: mapping.status, actor: req.user._id, notes: req.body.notes });
    await mapping.save();
    return res.json({ mapping });
  } catch (error) {
    return res.status(error.statusCode || (error.name === 'ValidationError' ? 400 : 500)).json({
      code: error.code,
      message: error.message || 'Unable to update variant mapping.'
    });
  }
};

module.exports = { createVariantMapping, listVariantMappings, updateVariantMappingStatus };
