const mongoose = require('mongoose');
const Supplier = require('../models/Supplier');
const SupplierProduct = require('../models/SupplierProduct');
const SupplierProductVariant = require('../models/SupplierProductVariant');
const { isSupplierAvailable } = require('../utils/supplierLifecycle');
const {
  buildSupplierProductApprovalState,
  requiresFdaComplianceReview
} = require('../utils/supplierProductApproval');
const { normalizeVariantAttributes, normalizeVariantSku, variantError } = require('../utils/variantIdentity');
const { claimSku, replaceSkuClaim } = require('../services/skuClaimService');
const {
  assertSupplierVariantWritesEnabled,
  getSupplierVariantReadiness
} = require('../services/supplierVariantReadinessService');

const REGULATORY_FIELDS = new Set([
  'regulatoryReview', 'approvalStatus', 'reviewedAt', 'reviewedBy',
  'reviewReason', 'publishedAt', 'requiresPlatformReview'
]);
const VARIANT_MUTABLE_FIELDS = [
  'attributes', 'sku', 'wholesalePrice', 'availableStock',
  'minimumOrderQuantity', 'unitOfMeasure', 'weight', 'weightUnit',
  'images', 'isActive'
];

const httpError = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code });
const responseStatus = error => error.statusCode
  || (error.code === 11000 ? 409 : undefined)
  || (error.name === 'ValidationError' ? 400 : 500);

const ensureNoRegulatoryOverride = body => {
  const attempted = Object.keys(body || {}).find(field => REGULATORY_FIELDS.has(field));
  if (attempted) throw httpError('Regulatory review fields can only be changed by an authorized platform review workflow.', 403, 'REGULATORY_FIELDS_READ_ONLY');
};

const normalizeDocuments = value => (Array.isArray(value) ? value : [])
  .filter(document => document && typeof document === 'object' && String(document.documentUrl || '').trim())
  .slice(0, 10)
  .map(document => ({
    documentType: String(document.documentType || 'supporting_document').trim().slice(0, 80),
    documentUrl: String(document.documentUrl).trim(),
    originalName: String(document.originalName || '').trim().slice(0, 160),
    uploadedAt: document.uploadedAt || new Date()
  }));

const normalizeStringList = value => (Array.isArray(value) ? value : [])
  .map(item => String(item || '').trim()).filter(Boolean).slice(0, 20);

const validateRegulatedParent = body => {
  if (!requiresFdaComplianceReview(body.category)) return;
  if (!String(body.fdaRegistrationNumber || '').trim()) {
    throw httpError('An FDA product registration number is required for food and medicine supplies.', 400);
  }
  if (!Array.isArray(body.regulatoryDocuments) || body.regulatoryDocuments.length === 0) {
    throw httpError('Upload at least one FDA registration or product compliance document.', 400);
  }
};

const variantRegulatoryState = category => requiresFdaComplianceReview(category)
  ? { scope: 'variant', status: 'pending_review', submittedAt: new Date() }
  : { scope: 'variant', status: 'approved', submittedAt: undefined };

const validateVariantInput = input => {
  ensureNoRegulatoryOverride(input);
  const attributes = normalizeVariantAttributes(input.attributes);
  const sku = String(input.sku || '').trim();
  normalizeVariantSku(sku);
  const wholesalePrice = Number(input.wholesalePrice);
  const availableStock = Number(input.availableStock ?? 0);
  const minimumOrderQuantity = Number(input.minimumOrderQuantity ?? 1);
  const weight = input.weight === '' || input.weight === null || input.weight === undefined
    ? undefined : Number(input.weight);
  if (!Number.isFinite(wholesalePrice) || wholesalePrice < 0) throw variantError('Wholesale price must be zero or greater.');
  if (!Number.isInteger(availableStock) || availableStock < 0) throw variantError('Supplier stock must be a whole number of zero or greater.');
  if (!Number.isInteger(minimumOrderQuantity) || minimumOrderQuantity < 1) throw variantError('Minimum order quantity must be a whole number of at least one.');
  if (weight !== undefined && (!Number.isFinite(weight) || weight <= 0)) throw variantError('Variant weight must be greater than zero.');
  return {
    attributes,
    sku,
    wholesalePrice,
    availableStock,
    minimumOrderQuantity,
    unitOfMeasure: input.unitOfMeasure || 'piece',
    weight,
    weightUnit: input.weightUnit || 'g',
    images: Array.isArray(input.images) ? input.images : [],
    isActive: input.isActive !== false
  };
};

const getActiveSupplier = async userId => {
  const supplier = await Supplier.findOne({ user: userId });
  if (!supplier) throw httpError('Supplier not found.', 404);
  if (!isSupplierAvailable(supplier)) throw httpError('Only active verified suppliers can manage variants.', 403);
  return supplier;
};

const getOwnedVariantParent = async ({ productId, supplierId, session }) => {
  const query = SupplierProduct.findOne({
    _id: productId,
    supplier: supplierId,
    isDeleted: { $ne: true }
  });
  if (session) query.session(session);
  const parent = await query;
  if (!parent) throw httpError('Supplier product not found.', 404);
  if (parent.productMode !== 'variant') throw httpError('This supplier product is not configured for variants.', 409);
  return parent;
};

const refreshParentProjection = async (supplierProduct, session) => {
  const variants = await SupplierProductVariant.find({
    supplierProduct,
    isActive: true,
    isDiscontinued: { $ne: true }
  }).select('wholesalePrice availableStock minimumOrderQuantity').session(session).lean();
  const update = {
    availableStock: variants.reduce((sum, variant) => sum + Number(variant.availableStock || 0), 0)
  };
  if (variants.length) {
    update.wholesalePrice = Math.min(...variants.map(variant => Number(variant.wholesalePrice)));
    update.minimumOrderQuantity = Math.min(...variants.map(variant => Number(variant.minimumOrderQuantity)));
  }
  await SupplierProduct.updateOne({ _id: supplierProduct }, { $set: update }, { session });
};

const serializeReadiness = readiness => ({
  enabled: readiness.enabled,
  requested: readiness.requested,
  reasons: readiness.reasons || [],
  replicaSetReady: Boolean(readiness.replicaSetReady),
  indexesReady: readiness.indexStatus
    ? Object.values(readiness.indexStatus).every(status => status.missing.length === 0 && status.invalid.length === 0)
    : false,
  skuRegistryReady: Boolean(readiness.coverage?.ready)
});

const getVariantCapabilities = async (_req, res) => {
  try {
    const readiness = await getSupplierVariantReadiness();
    res.json(serializeReadiness(readiness));
  } catch (error) {
    res.status(503).json({ enabled: false, reasons: ['Variant readiness could not be verified.'] });
  }
};

const listSupplierVariants = async (req, res) => {
  try {
    const supplier = await getActiveSupplier(req.user._id);
    const parent = await getOwnedVariantParent({ productId: req.params.productId, supplierId: supplier._id });
    const variants = await SupplierProductVariant.find({ supplierProduct: parent._id })
      .select('+normalizedSku +regulatoryReview.reviewedBy')
      .sort({ createdAt: 1 });
    res.json({ variants });
  } catch (error) {
    res.status(error.statusCode || 500).json({ code: error.code, message: error.message || 'Server error' });
  }
};

const createSupplierVariant = async (req, res) => {
  try {
    const supplier = await getActiveSupplier(req.user._id);
    await assertSupplierVariantWritesEnabled();
    const input = validateVariantInput(req.body);
    let variant;
    await mongoose.connection.transaction(async session => {
      const parent = await getOwnedVariantParent({ productId: req.params.productId, supplierId: supplier._id, session });
      variant = new SupplierProductVariant({
        _id: new mongoose.Types.ObjectId(),
        supplierProduct: parent._id,
        supplier: supplier._id,
        ...input,
        regulatoryReview: variantRegulatoryState(parent.category)
      });
      variant.$session(session);
      await variant.validate();
      await claimSku({
        namespaceType: 'supplier', owner: supplier._id, sku: variant.sku,
        entityType: 'supplier_product_variant', entity: variant._id, session
      });
      await variant.save({ session });
      await refreshParentProjection(parent._id, session);
    });
    res.status(201).json(variant);
  } catch (error) {
    res.status(responseStatus(error)).json({
      code: error.code,
      message: error.message || 'Server error',
      readiness: error.readiness ? serializeReadiness(error.readiness) : undefined
    });
  }
};

const updateSupplierVariant = async (req, res) => {
  try {
    const supplier = await getActiveSupplier(req.user._id);
    await assertSupplierVariantWritesEnabled();
    ensureNoRegulatoryOverride(req.body);
    let variant;
    await mongoose.connection.transaction(async session => {
      const parent = await getOwnedVariantParent({ productId: req.params.productId, supplierId: supplier._id, session });
      variant = await SupplierProductVariant.findOne({
        _id: req.params.variantId,
        supplierProduct: parent._id,
        supplier: supplier._id
      }).select('+supplier +normalizedSku').session(session);
      if (!variant) throw httpError('Variant not found under this supplier product.', 404);
      if (variant.isDiscontinued) throw httpError('A discontinued variant remains historical and cannot be edited.', 409);

      const candidate = {};
      VARIANT_MUTABLE_FIELDS.forEach(field => {
        if (Object.prototype.hasOwnProperty.call(req.body, field)) candidate[field] = req.body[field];
      });
      const input = validateVariantInput({ ...variant.toObject(), ...candidate });
      if (normalizeVariantSku(variant.sku) !== normalizeVariantSku(input.sku)) {
        await replaceSkuClaim({
          namespaceType: 'supplier', owner: supplier._id,
          previousSku: variant.sku, nextSku: input.sku,
          entityType: 'supplier_product_variant', entity: variant._id, session
        });
      }
      Object.assign(variant, input);
      const regulatedContentChanged = [
        'attributes', 'sku', 'wholesalePrice', 'weight', 'weightUnit', 'images'
      ].some(field => Object.prototype.hasOwnProperty.call(req.body, field));
      if (requiresFdaComplianceReview(parent.category) && regulatedContentChanged) {
        variant.regulatoryReview = variantRegulatoryState(parent.category);
      }
      await variant.save({ session });
      await refreshParentProjection(parent._id, session);
    });
    res.json(variant);
  } catch (error) {
    res.status(responseStatus(error)).json({
      code: error.code, message: error.message || 'Server error',
      readiness: error.readiness ? serializeReadiness(error.readiness) : undefined
    });
  }
};

const discontinueSupplierVariant = async (req, res) => {
  try {
    const supplier = await getActiveSupplier(req.user._id);
    await assertSupplierVariantWritesEnabled();
    let variant;
    await mongoose.connection.transaction(async session => {
      const parent = await getOwnedVariantParent({ productId: req.params.productId, supplierId: supplier._id, session });
      variant = await SupplierProductVariant.findOne({
        _id: req.params.variantId,
        supplierProduct: parent._id,
        supplier: supplier._id
      }).session(session);
      if (!variant) throw httpError('Variant not found under this supplier product.', 404);
      if (!variant.isDiscontinued) {
        variant.isDiscontinued = true;
        variant.isActive = false;
        variant.discontinuedAt = new Date();
        variant.discontinuedReason = String(req.body.reason || 'Discontinued by supplier').trim();
        await variant.save({ session });
        await refreshParentProjection(parent._id, session);
      }
    });
    res.json(variant);
  } catch (error) {
    res.status(responseStatus(error)).json({
      code: error.code, message: error.message || 'Server error',
      readiness: error.readiness ? serializeReadiness(error.readiness) : undefined
    });
  }
};

const createVariantProduct = async (req, res) => {
  try {
    const supplier = await getActiveSupplier(req.user._id);
    await assertSupplierVariantWritesEnabled();
    ensureNoRegulatoryOverride(req.body);
    const body = req.body || {};
    if (body.itemType === 'live_pet') throw httpError('Live-pet catalog records cannot use product variants.', 400);
    if (!body.name || !body.sku || !body.category) throw httpError('Name, parent SKU, and category are required.', 400);
    normalizeVariantSku(body.sku);
    const variants = Array.isArray(body.variants) ? body.variants.map(validateVariantInput) : [];
    if (!variants.length) throw httpError('Define at least one explicit variant combination.', 400);
    const documents = normalizeDocuments(body.regulatoryDocuments);
    validateRegulatedParent({ ...body, regulatoryDocuments: documents });
    if (['pet_food', 'pet_treats'].includes(body.category)
        && (!String(body.ingredients || '').trim() || !String(body.nutritionalInformation || '').trim())) {
      throw httpError('Ingredients and nutritional information are required for pet food and treats.', 400);
    }

    let parent;
    let createdVariants;
    await mongoose.connection.transaction(async session => {
      const approvalState = buildSupplierProductApprovalState({ category: body.category, actor: req.user._id });
      parent = new SupplierProduct({
        _id: new mongoose.Types.ObjectId(),
        productMode: 'variant',
        supplier: supplier._id,
        itemType: body.itemType === 'product' ? 'product' : 'pet_supply',
        name: body.name,
        sku: body.sku,
        description: body.description || '',
        category: body.category,
        images: Array.isArray(body.images) ? body.images : [],
        wholesalePrice: Math.min(...variants.map(item => item.wholesalePrice)),
        retailPrice: Number(body.retailPrice || 0),
        availableStock: variants.reduce((sum, item) => sum + item.availableStock, 0),
        minimumOrderQuantity: Math.min(...variants.map(item => item.minimumOrderQuantity)),
        unitOfMeasure: body.unitOfMeasure || 'piece',
        deliveryLeadTimeDays: Number(body.deliveryLeadTimeDays || 3),
        brand: body.brand,
        specifications: body.specifications,
        ingredients: body.ingredients,
        nutritionalInformation: body.nutritionalInformation,
        intendedSpecies: normalizeStringList(body.intendedSpecies),
        safetyNotes: body.safetyNotes,
        fdaRegistrationNumber: String(body.fdaRegistrationNumber || '').trim(),
        fdaRegistrationExpiry: body.fdaRegistrationExpiry || undefined,
        regulatoryDocuments: documents,
        ...approvalState
      });
      await parent.save({ session });
      await claimSku({
        namespaceType: 'supplier', owner: supplier._id, sku: parent.sku,
        entityType: 'supplier_product', entity: parent._id, session
      });

      createdVariants = [];
      for (const input of variants) {
        const child = new SupplierProductVariant({
          _id: new mongoose.Types.ObjectId(),
          supplierProduct: parent._id,
          supplier: supplier._id,
          ...input,
          regulatoryReview: variantRegulatoryState(parent.category)
        });
        child.$session(session);
        await child.validate();
        await claimSku({
          namespaceType: 'supplier', owner: supplier._id, sku: child.sku,
          entityType: 'supplier_product_variant', entity: child._id, session
        });
        await child.save({ session });
        createdVariants.push(child);
      }
      await Supplier.updateOne({ _id: supplier._id }, {
        $addToSet: { goodsTypes: body.itemType === 'product' ? 'general_products' : 'pet_supplies' }
      }, { session });
    });
    res.status(201).json({ ...parent.toObject(), variants: createdVariants });
  } catch (error) {
    res.status(responseStatus(error)).json({
      code: error.code, message: error.message || 'Server error',
      readiness: error.readiness ? serializeReadiness(error.readiness) : undefined
    });
  }
};

module.exports = {
  createSupplierVariant,
  createVariantProduct,
  discontinueSupplierVariant,
  getVariantCapabilities,
  listSupplierVariants,
  updateSupplierVariant,
  __test: {
    ensureNoRegulatoryOverride,
    serializeReadiness,
    validateVariantInput,
    variantRegulatoryState
  }
};
