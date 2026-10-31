const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const Store = require('../models/Store');
const { canOperateStore } = require('../utils/authorizationPolicy');
const { normalizeVariantAttributes, normalizeVariantSku } = require('../utils/variantIdentity');
const { claimSku, replaceSkuClaim } = require('../services/skuClaimService');
const { assertSellerVariantWritesEnabled, getSellerVariantReadiness } = require('../services/sellerVariantReadinessService');
const { normalizeCatalogImages, normalizeProductPackaging, normalizeProductWeight } = require('../utils/catalogListing');
const { requireProductCategory } = require('../utils/productCategories');

const mutableFields = ['attributes', 'sku', 'price', 'compareAtPrice', 'images', 'unit', 'weight',
  'weightUnit', 'weightIncludesPackaging', 'packagingWeight', 'packagingWeightUnit', 'isActive'];
const httpError = (message, statusCode = 400, code) => Object.assign(new Error(message), { statusCode, code });

const assertOperationalStore = async (storeId, session) => {
  const query = Store.findById(storeId).select('_id verificationStatus isActive');
  if (session) query.session(session);
  const store = await query.lean();
  if (!store || store.isActive === false || store.verificationStatus !== 'verified') {
    throw httpError('A verified and active store is required to manage product variants.', 403);
  }
  return store;
};

const validateInput = input => {
  const attributes = normalizeVariantAttributes(input.attributes);
  const sku = String(input.sku || '').trim();
  normalizeVariantSku(sku);
  const price = Number(input.price);
  if (!Number.isFinite(price) || price <= 0) throw httpError('Retail price must be greater than zero.');
  const compareAtPrice = input.compareAtPrice === '' || input.compareAtPrice === undefined || input.compareAtPrice === null
    ? undefined : Number(input.compareAtPrice);
  if (compareAtPrice !== undefined && compareAtPrice < price) throw httpError('Compare-at price cannot be lower than the retail price.');
  const normalizedWeight = normalizeProductWeight(input.weight, input.weightUnit);
  const normalizedPackaging = normalizeProductPackaging(
    input.packagingWeight,
    input.packagingWeightUnit,
    input.weightIncludesPackaging
  );
  return {
    attributes,
    sku,
    price,
    compareAtPrice,
    images: Array.isArray(input.images) ? input.images : [],
    unit: input.unit || 'piece',
    ...normalizedWeight,
    ...normalizedPackaging,
    isActive: input.isActive !== false
  };
};

const ownedParent = async ({ user, productId, session }) => {
  const query = Product.findOne({ _id: productId, isDeleted: { $ne: true } });
  if (session) query.session(session);
  const product = await query;
  if (!product) throw httpError('Product not found.', 404);
  if (!(await canOperateStore(user, product.store, ['products.manage', 'inventory.adjust']))) {
    throw httpError('This product belongs to another store.', 403);
  }
  await assertOperationalStore(product.store, session);
  if (product.productMode !== 'variant') throw httpError('The product must use Product With Variants mode.', 409);
  return product;
};

const capabilities = async (_req, res) => {
  const readiness = await getSellerVariantReadiness();
  res.json({ enabled: readiness.enabled, requested: readiness.requested, reasons: readiness.reasons, skuRegistryReady: Boolean(readiness.coverage?.ready) });
};

const list = async (req, res) => {
  try {
    const product = await ownedParent({ user: req.user, productId: req.params.productId });
    const variants = await ProductVariant.find({ product: product._id }).sort({ createdAt: 1 });
    res.json({ productMode: product.productMode, variants });
  } catch (error) {
    res.status(error.statusCode || 500).json({ code: error.code, message: error.message });
  }
};

const create = async (req, res) => {
  try {
    await assertSellerVariantWritesEnabled();
    const input = validateInput(req.body);
    let variant;
    await mongoose.connection.transaction(async session => {
      const product = await ownedParent({ user: req.user, productId: req.params.productId, session });
      variant = new ProductVariant({
        _id: new mongoose.Types.ObjectId(), product: product._id, store: product.store, ...input
      });
      variant.$session(session);
      await variant.validate();
      await claimSku({ namespaceType: 'store', owner: product.store, sku: variant.sku,
        entityType: 'product_variant', entity: variant._id, session });
      await variant.save({ session });
    });
    res.status(201).json(variant);
  } catch (error) {
    res.status(error.statusCode || (error.code === 11000 ? 409 : 500)).json({
      code: error.code, message: error.message, readiness: error.readiness
    });
  }
};

const createVariantProduct = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    await assertSellerVariantWritesEnabled();
    const variants = Array.isArray(req.body.normalizedVariants)
      ? req.body.normalizedVariants.map(validateInput) : [];
    if (!variants.length) throw httpError('Define at least one explicit sellable variant combination.');
    if (!String(req.body.name || '').trim() || !String(req.body.description || '').trim()) {
      throw httpError('Product name and description are required.');
    }
    const images = normalizeCatalogImages(req.body.images, { required: true });
    const weight = normalizeProductWeight(req.body.weight, req.body.weightUnit, { required: true });
    const packaging = normalizeProductPackaging(req.body.packagingWeight, req.body.packagingWeightUnit, req.body.weightIncludesPackaging);
    const productId = new mongoose.Types.ObjectId();
    const generatedSkuStem = String(req.body.name).trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toUpperCase();
    const parentSku = String(req.body.sku || '').trim() || `PZ-${generatedSkuStem}-${String(productId).slice(-8).toUpperCase()}`;
    normalizeVariantSku(parentSku);
    let product;
    let children;
    await mongoose.connection.transaction(async session => {
      // The route already enforces store catalog permission. The user store is
      // resolved by the same parent controller policy through a supplied store.
      const store = req.user.store || (await Store.findOne({ owner: req.user._id }).select('_id').session(session))?._id;
      if (!store || !(await canOperateStore(req.user, store, ['products.manage', 'inventory.adjust']))) {
        throw httpError('An approved store is required to create variant products.', 403);
      }
      await assertOperationalStore(store, session);
      product = new Product({
        _id: productId,
        productMode: 'variant',
        name: String(req.body.name).trim(),
        category: requireProductCategory(req.body.category),
        description: String(req.body.description).trim(),
        shortDescription: String(req.body.shortDescription || req.body.description).trim().slice(0, 160),
        brand: req.body.brand,
        sku: parentSku,
        barcode: req.body.barcode,
        price: Math.min(...variants.map(item => item.price)),
        stockQuantity: 0,
        stockStatus: 'out_of_stock',
        images,
        coverImage: images[0],
        variants: [],
        ...weight,
        ...packaging,
        unit: req.body.unit || 'piece',
        // Customer selection and checkout are intentionally deferred to a
        // later phase. Variant parents cannot be published by Phase 3.
        visibility: 'draft',
        isActive: req.body.isActive !== false,
        store,
        addedBy: req.user._id
      });
      await product.save({ session });
      await claimSku({ namespaceType: 'store', owner: store, sku: product.sku,
        entityType: 'product', entity: product._id, session });
      children = [];
      for (const input of variants) {
        const child = new ProductVariant({
          _id: new mongoose.Types.ObjectId(), product: product._id, store, ...input
        });
        child.$session(session);
        await child.validate();
        await claimSku({ namespaceType: 'store', owner: store, sku: child.sku,
          entityType: 'product_variant', entity: child._id, session });
        await child.save({ session });
        children.push(child);
      }
    });
    res.status(201).json({ product, variants: children });
  } catch (error) {
    res.status(error.statusCode || (error.code === 11000 ? 409 : 500)).json({ code: error.code, message: error.message, readiness: error.readiness });
  }
};

const update = async (req, res) => {
  try {
    await assertSellerVariantWritesEnabled();
    let variant;
    await mongoose.connection.transaction(async session => {
      const product = await ownedParent({ user: req.user, productId: req.params.productId, session });
      variant = await ProductVariant.findOne({ _id: req.params.variantId, product: product._id, store: product.store })
        .select('+store +normalizedSku').session(session);
      if (!variant) throw httpError('Variant not found under this product.', 404);
      if (variant.isDiscontinued) throw httpError('A discontinued variant remains historical and cannot be edited.', 409);
      const candidate = variant.toObject();
      mutableFields.forEach(field => {
        if (Object.prototype.hasOwnProperty.call(req.body, field)) candidate[field] = req.body[field];
      });
      const input = validateInput(candidate);
      if (normalizeVariantSku(variant.sku) !== normalizeVariantSku(input.sku)) {
        await replaceSkuClaim({ namespaceType: 'store', owner: product.store, previousSku: variant.sku,
          nextSku: input.sku, entityType: 'product_variant', entity: variant._id, session });
      }
      Object.assign(variant, input);
      await variant.save({ session });
    });
    res.json(variant);
  } catch (error) {
    res.status(error.statusCode || (error.code === 11000 ? 409 : 500)).json({ code: error.code, message: error.message, readiness: error.readiness });
  }
};

const discontinue = async (req, res) => {
  try {
    await assertSellerVariantWritesEnabled();
    let variant;
    await mongoose.connection.transaction(async session => {
      const product = await ownedParent({ user: req.user, productId: req.params.productId, session });
      variant = await ProductVariant.findOne({ _id: req.params.variantId, product: product._id, store: product.store }).session(session);
      if (!variant) throw httpError('Variant not found under this product.', 404);
      if (!variant.isDiscontinued) {
        variant.isDiscontinued = true;
        variant.isActive = false;
        variant.discontinuedAt = new Date();
        variant.discontinuedReason = String(req.body.reason || 'Discontinued by store').trim();
        await variant.save({ session });
      }
    });
    res.json(variant);
  } catch (error) {
    res.status(error.statusCode || 500).json({ code: error.code, message: error.message, readiness: error.readiness });
  }
};

module.exports = { capabilities, create, createVariantProduct, discontinue, list, update, __test: { validateInput } };
