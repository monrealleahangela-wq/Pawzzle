const crypto = require('crypto');
const mongoose = require('mongoose');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProcurementCart = require('../models/ProcurementCart');
const ProcurementReceivingReport = require('../models/ProcurementReceivingReport');
const { isPlatformAdmin } = require('../config/permissions');
const { canOperateStore } = require('../utils/authorizationPolicy');
const Supplier = require('../models/Supplier');
const SupplierProduct = require('../models/SupplierProduct');
const Store = require('../models/Store');
const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const ServiceSupply = require('../models/ServiceSupply');
const Pet = require('../models/Pet');
const InventoryLot = require('../models/InventoryLot');
const SupplyChainLog = require('../models/SupplyChainLog');
const InventoryLedgerService = require('../services/inventoryLedgerService');
const { applyServiceSupplyReceipt } = require('../services/serviceSupplyReceivingService');
const { partnershipSnapshotForOrder } = require('../services/supplierPartnershipService');
const {
  commitPurchaseOrderStock,
  releasePurchaseOrderStock
} = require('../services/procurementStockCommitmentService');
const { createNotification } = require('./notificationController');
const { isSupplierSelectableForStore, getSelectableSupplierFilterForStore } = require('../utils/supplierLifecycle');
const {
  getReceivingProcessingCutoff,
  validateProcurementQuantity,
  groupProcurementItemsBySupplier,
  normalizeInspectionItem,
  determineInspectionOutcome
} = require('../utils/procurementCart');
const { getResolutionQuantities, hasUnresolvedQuantities } = require('../utils/procurementResolution');
const {
  getStoreProductCompatibilityIssue,
  getOfferMatchType,
  getOfferReviewIssue,
  mapSupplierCategoryToStoreCategory,
  assertStoreProductCompatible,
  buildDraftStoreProduct,
  getDraftProductSuggestions
} = require('../utils/procurementProductLinking');
const { SUPPLY_CATEGORIES, getSupplyOfferMatchType, getSupplyOfferIssue } = require('../utils/procurementSupplyLinking');
const { cloudinary } = require('../middleware/upload');
const {
  evidenceFromUploadedFile,
  sanitizeReceivingReport,
  sanitizeOrderReceivingReport,
  findEvidenceById,
  createTemporaryEvidenceUrl
} = require('../utils/procurementEvidence');

const resolveUserStore = async user => {
  if (user.store) return user.store._id || user.store;
  const ownedStore = await Store.findOne({ owner: user._id, isDeleted: { $ne: true } }).select('_id');
  return ownedStore?._id || null;
};

const notifySupplierStockShortage = async ({ userId, storeId, product }) => {
  try {
  const day = new Date().toISOString().slice(0, 10);
  const linkedProducts = await Product.find({ store: storeId, isDeleted: { $ne: true },
    $or: [{ supplierProductRef: product._id }, { 'procurementOffers.supplierProduct': product._id }] })
    .select('supplierProductRef procurementOffers');
  const linkedSupplies = await ServiceSupply.find({ store: storeId, isDeleted: { $ne: true },
    $or: [{ supplierProduct: product._id }, { 'supplierOffers.supplierProduct': product._id }] })
    .select('supplierProduct supplierOffers');
  const alternativeIds = [...new Set([...linkedProducts.flatMap(storeProduct => [
    storeProduct.supplierProductRef,
    ...(storeProduct.procurementOffers || []).map(offer => offer.supplierProduct)
  ]), ...linkedSupplies.flatMap(supply => [supply.supplierProduct,
    ...(supply.supplierOffers || []).map(offer => offer.supplierProduct)])]
    .filter(id => id && String(id) !== String(product._id)).map(String))];
  const alternativeProducts = alternativeIds.length ? await SupplierProduct.find({
    _id: { $in: alternativeIds }, isActive: true, isDeleted: false,
    $expr: { $gte: ['$availableStock', '$minimumOrderQuantity'] }
  }).select('supplier') : [];
  const alternativeSuppliers = alternativeProducts.length ? await Supplier.find({
    _id: { $in: alternativeProducts.map(item => item.supplier) }
  }) : [];
  const hasAlternative = alternativeSuppliers.some(supplier => isSupplierSelectableForStore(supplier, storeId));
  await createNotification({
    recipient: userId,
    type: 'supply_alert',
    title: 'Supplier stock is insufficient',
    message: `The requested quantity of ${product.name} exceeds this supplier's available stock.${hasAlternative ? ' Another eligible supplier offer is available for review.' : ' Reduce the quantity or check later.'}`,
    relatedId: storeId,
    relatedModel: 'Store',
    targetUrl: '/admin/purchase-orders?tab=suppliers',
    dedupeKey: `procurement-shortage:${userId}:${product._id}:${day}`
  });
  } catch (error) {
    console.error('Procurement shortage notification failed:', error);
  }
};

const populateProcurementCart = cart => cart.populate([
  {
    path: 'items.supplierProduct',
    select: 'supplier itemType pet name sku category images wholesalePrice availableStock minimumOrderQuantity unitOfMeasure deliveryLeadTimeDays isActive isDeleted',
    populate: { path: 'pet', select: 'name species breed age ageUnit gender size color healthCondition vaccinationStatus healthNotes images listingContext' }
  },
  { path: 'items.supplier', select: 'businessName supplierType status isActive isDeleted storeAssociations' },
  { path: 'items.storeProduct', select: 'name sku category unit stockQuantity store supplierProductRef procurementOffers visibility isActive isDeleted' },
  { path: 'items.serviceSupply', select: 'name sku category unitOfMeasure currentStock store supplierProduct supplierOffers isActive isDeleted' }
]);

const getOrCreateProcurementCart = async (userId, storeId) => {
  let cart = await ProcurementCart.findOne({ user: userId, store: storeId });
  if (!cart) {
    try {
      cart = await ProcurementCart.create({ user: userId, store: storeId, items: [] });
    } catch (error) {
      if (error.code !== 11000) throw error;
      cart = await ProcurementCart.findOne({ user: userId, store: storeId });
    }
  }
  return cart;
};

const serializeProcurementCart = (cart, storeId) => {
  const items = (cart?.items || []).map(item => {
    const product = item.supplierProduct;
    const supplier = item.supplier;
    const currentUnitPrice = Number(product?.wholesalePrice || 0);
    const quantity = Number(item.quantity || 0);
    const supplierEligible = isSupplierSelectableForStore(supplier, storeId);
    const available = Boolean(product && product.isActive && !product.isDeleted && supplierEligible);
    return {
      _id: item._id,
      cartItemId: item._id,
      supplierProductId: product?._id || item.supplierProduct,
      supplierId: supplier?._id || item.supplier,
      supplier: supplier ? { _id: supplier._id, businessName: supplier.businessName } : null,
      itemType: product?.itemType || item.itemType || 'pet_supply',
      product: product ? {
        _id: product._id,
        name: product.name,
        sku: product.sku,
        category: product.category,
        images: product.images,
        wholesalePrice: currentUnitPrice,
        availableStock: product.availableStock,
        minimumOrderQuantity: product.minimumOrderQuantity,
        unitOfMeasure: product.unitOfMeasure,
        deliveryLeadTimeDays: product.deliveryLeadTimeDays
      } : null,
      pet: product?.pet || null,
      storeProduct: item.storeProduct || null,
      serviceSupply: item.serviceSupply || null,
      selectionMatchType: item.selectionMatchType || (item.storeProduct && product
        ? getOfferMatchType({ storeProduct: item.storeProduct, supplierProduct: product })
        : item.serviceSupply && product
          ? getSupplyOfferMatchType({ serviceSupply: item.serviceSupply, supplierProduct: product })
          : 'unmapped'),
      quantity,
      addedUnitPrice: Number(item.addedUnitPrice),
      priceChanged: Boolean(product && Number(item.addedUnitPrice) !== currentUnitPrice),
      available,
      lineTotal: currentUnitPrice * quantity,
      addedAt: item.addedAt,
      updatedAt: item.updatedAt
    };
  });
  return {
    _id: cart?._id,
    items,
    itemCount: items.length,
    totalQuantity: items.reduce((total, item) => total + item.quantity, 0),
    subtotal: items.reduce((total, item) => total + item.lineTotal, 0),
    supplierCount: new Set(items.map(item => String(item.supplierId))).size,
    updatedAt: cart?.updatedAt
  };
};

const loadPopulatedProcurementCart = async (userId, storeId) => {
  const cart = await getOrCreateProcurementCart(userId, storeId);
  await populateProcurementCart(cart);
  return serializeProcurementCart(cart, storeId);
};

// ═══════════════════════════════════════════════════════════════
// SELLER - Create & Manage Purchase Orders
// ═══════════════════════════════════════════════════════════════

const getProcurementCart = async (req, res) => {
  try {
    const store = await resolveUserStore(req.user);
    if (!store) return res.status(403).json({ message: 'Authorized store not found.' });
    res.json(await loadPopulatedProcurementCart(req.user._id, store));
  } catch (error) {
    console.error('Get procurement cart error:', error);
    res.status(500).json({ message: 'Unable to load the procurement cart.' });
  }
};

const getProcurementStoreProducts = async (req, res) => {
  try {
    const store = await resolveUserStore(req.user);
    if (!store || !(await canOperateStore(req.user, store, ['procurement.manage']))) {
      return res.status(403).json({ message: 'Authorized Store procurement access is required.' });
    }
    const search = String(req.query.search || '').trim().slice(0, 80);
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
    const limit = 30;
    const supplyTarget = req.query.targetType === 'service_supply';
    const Target = supplyTarget ? ServiceSupply : Product;
    const filter = { store, isActive: true, isDeleted: { $ne: true } };
    if (search) filter.$or = [
      { name: { $regex: escapedSearch, $options: 'i' } },
      { sku: { $regex: escapedSearch, $options: 'i' } }
    ];
    const [products, total] = await Promise.all([
      Target.find(filter).select(supplyTarget ? 'name sku unitOfMeasure supplierProduct' : 'name sku unit supplierProductRef').sort({ name: 1, _id: 1 })
        .skip((page - 1) * limit).limit(limit),
      Target.countDocuments(filter)
    ]);
    return res.json({ products: products.map(product => ({
      _id: product._id, name: product.name, sku: product.sku,
      unit: supplyTarget ? product.unitOfMeasure : product.unit,
      supplierProductRef: supplyTarget ? product.supplierProduct : product.supplierProductRef
    })), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Get procurement Store products error:', error);
    return res.status(500).json({ message: 'Unable to load Store products.' });
  }
};

const getComparableSupplierOffers = async (req, res) => {
  try {
    const store = await resolveUserStore(req.user);
    if (!store || !(await canOperateStore(req.user, store, ['procurement.manage']))) {
      return res.status(403).json({ message: 'Authorized Store procurement access is required.' });
    }
    if (!mongoose.isValidObjectId(req.params.storeProductId)) return res.status(400).json({ message: 'Invalid Store product.' });
    const supplyTarget = req.query.targetType === 'service_supply';
    const storeProduct = supplyTarget
      ? await ServiceSupply.findOne({ _id: req.params.storeProductId, store, isActive: true, isDeleted: { $ne: true } })
        .select('name sku category unitOfMeasure store supplierProduct supplierOffers isActive isDeleted')
      : await Product.findOne({ _id: req.params.storeProductId, store, isActive: true, isDeleted: { $ne: true } })
        .select('name sku category unit store supplierProductRef procurementOffers isActive isDeleted');
    if (!storeProduct) return res.status(404).json({ message: 'Store product not found.' });
    const suppliers = await Supplier.find(getSelectableSupplierFilterForStore(store))
      .select('businessName supplierType status isActive isDeleted storeAssociations');
    const supplierMap = new Map(suppliers.map(supplier => [String(supplier._id), supplier]));
    const search = String(req.query.search || '').trim().slice(0, 80);
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
    const limit = 30;
    const categories = supplyTarget
      ? (SUPPLY_CATEGORIES.includes(storeProduct.category) ? [storeProduct.category] : [])
      : SupplierProduct.schema.path('category').enumValues
        .filter(category => mapSupplierCategoryToStoreCategory(category) === storeProduct.category);
    const filter = {
      supplier: { $in: suppliers.map(supplier => supplier._id) },
      itemType: { $ne: 'live_pet' },
      category: { $in: categories },
      unitOfMeasure: supplyTarget ? storeProduct.unitOfMeasure : storeProduct.unit,
      isDeleted: false
    };
    if (search) filter.name = { $regex: escapedSearch, $options: 'i' };
    const [products, total] = await Promise.all([SupplierProduct.find(filter)
      .select('supplier name sku category brand wholesalePrice availableStock minimumOrderQuantity unitOfMeasure deliveryLeadTimeDays isActive isDeleted')
      .sort({ wholesalePrice: 1, _id: 1 }).skip((page - 1) * limit).limit(limit),
    SupplierProduct.countDocuments(filter)]);
    const offers = products.map(product => ({
        supplierProductId: product._id,
        supplier: { _id: product.supplier, businessName: supplierMap.get(String(product.supplier))?.businessName },
        name: product.name,
        sku: product.sku,
        brand: product.brand,
        category: product.category,
        unitOfMeasure: product.unitOfMeasure,
        unitPrice: product.wholesalePrice,
        availableStock: product.availableStock,
        minimumOrderQuantity: product.minimumOrderQuantity,
        deliveryLeadTimeDays: product.deliveryLeadTimeDays,
        available: product.isActive && product.availableStock >= product.minimumOrderQuantity,
        matchType: supplyTarget
          ? getSupplyOfferMatchType({ serviceSupply: storeProduct, supplierProduct: product }) || 'unverified_candidate'
          : getOfferMatchType({ storeProduct, supplierProduct: product }) || 'unverified_candidate'
      }));
    return res.json({ storeProduct: { _id: storeProduct._id, name: storeProduct.name, sku: storeProduct.sku,
      unit: supplyTarget ? storeProduct.unitOfMeasure : storeProduct.unit },
      offers, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Compare supplier offers error:', error);
    return res.status(500).json({ message: 'Unable to compare supplier offers.' });
  }
};

const confirmSupplierOfferMatch = async (req, res) => {
  try {
    const store = await resolveUserStore(req.user);
    if (!store || !(await canOperateStore(req.user, store, ['procurement.manage']))) {
      return res.status(403).json({ message: 'Authorized Store procurement access is required.' });
    }
    const supplyTarget = req.body.targetType === 'service_supply';
    const storeProductId = supplyTarget ? req.body.serviceSupplyId : req.body.storeProductId;
    const { supplierProductId, matchType, confirmMatch } = req.body;
    if (!confirmMatch || !mongoose.isValidObjectId(storeProductId) || !mongoose.isValidObjectId(supplierProductId)) {
      return res.status(400).json({ message: 'Explicit confirmation and valid product identifiers are required.' });
    }
    const [storeProduct, supplierProduct] = await Promise.all([
      (supplyTarget ? ServiceSupply : Product).findOne({ _id: storeProductId, store, isDeleted: { $ne: true } }),
      SupplierProduct.findOne({ _id: supplierProductId, isActive: true, isDeleted: false })
    ]);
    if (!supplierProduct) return res.status(404).json({ message: 'Supplier offer is unavailable.' });
    const supplier = await Supplier.findById(supplierProduct.supplier);
    if (!isSupplierSelectableForStore(supplier, store)) return res.status(403).json({ message: 'Supplier is not eligible for this Store.' });
    const issue = supplyTarget
      ? getSupplyOfferIssue({ serviceSupply: storeProduct, supplierProduct, storeId: store, matchType })
      : getOfferReviewIssue({ storeProduct, supplierProduct, storeId: store, matchType });
    if (issue) return res.status(409).json({ message: issue });
    let alreadyConfirmed = false;
    await mongoose.connection.transaction(async session => {
      const currentProduct = await (supplyTarget ? ServiceSupply : Product)
        .findOne({ _id: storeProduct._id, store, isDeleted: { $ne: true } }).session(session);
      const currentIssue = supplyTarget
        ? getSupplyOfferIssue({ serviceSupply: currentProduct, supplierProduct, storeId: store, matchType })
        : getOfferReviewIssue({ storeProduct: currentProduct, supplierProduct, storeId: store, matchType });
      if (currentIssue) throw Object.assign(new Error(currentIssue), { statusCode: 409 });
      if (!supplyTarget && String(currentProduct.supplierProductRef || '') === String(supplierProduct._id)) {
        if (matchType !== 'exact') throw Object.assign(new Error('The primary supplier item is already an exact match.'), { statusCode: 409 });
        alreadyConfirmed = true;
        return;
      }
      const offerList = supplyTarget ? currentProduct.supplierOffers : currentProduct.procurementOffers;
      const current = (offerList || []).find(offer =>
        String(offer.supplierProduct) === String(supplierProduct._id));
      if (current) {
        if (current.matchType !== matchType) throw Object.assign(new Error('This offer has a different reviewed match classification.'), { statusCode: 409 });
        alreadyConfirmed = true;
        return;
      }
      offerList.push({
        supplierProduct: supplierProduct._id, matchType, confirmedBy: req.user._id, confirmedAt: new Date()
      });
      await currentProduct.save({ session });
      await SupplyChainLog.create([{
        action: 'admin_action', performedBy: req.user._id, userRole: req.user.role,
        relatedEntity: { type: supplyTarget ? 'ServiceSupply' : 'Product', id: currentProduct._id },
        description: `Supplier offer classified as ${matchType} for Store procurement`,
        store, supplier: supplier._id,
        metadata: { supplierProduct: supplierProduct._id, matchType }
      }], { session });
    });
    return res.status(alreadyConfirmed ? 200 : 201).json({ matchType, alreadyConfirmed });
  } catch (error) {
    console.error('Confirm supplier offer error:', error);
    return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Unable to confirm supplier offer.' });
  }
};

const addProcurementCartItem = async (req, res) => {
  try {
    const store = await resolveUserStore(req.user);
    if (!store) return res.status(403).json({ message: 'Authorized store not found.' });
    const product = await SupplierProduct.findOne({
      _id: req.body.supplierProductId,
      isActive: true,
      isDeleted: false
    });
    if (!product) return res.status(404).json({ message: 'Supplier product is unavailable.' });
    if (product.itemType === 'live_pet') {
      const pet = await Pet.findOne({
        _id: product.pet,
        sourceSupplier: product.supplier,
        listingContext: 'supplier_catalog',
        status: 'available',
        isDeleted: { $ne: true }
      });
      if (!pet || product.availableStock !== 1) return res.status(409).json({ message: 'This live pet is no longer available for procurement.' });
    }
    const supplier = await Supplier.findById(product.supplier);
    if (!isSupplierSelectableForStore(supplier, store)) {
      return res.status(403).json({ message: 'This supplier is not eligible for your store.' });
    }
    if (req.body.storeProductId && req.body.serviceSupplyId) {
      return res.status(400).json({ message: 'Select one Store inventory target per supplier offer.' });
    }
    let selectedStoreProduct = null;
    let selectedServiceSupply = null;
    let matchType = null;
    if (req.body.storeProductId) {
      if (req.body.confirmSelection !== true || !mongoose.isValidObjectId(req.body.storeProductId)) {
        return res.status(400).json({ message: 'Confirm the supplier offer and Store product before adding it.' });
      }
      selectedStoreProduct = await Product.findOne({ _id: req.body.storeProductId, store, isDeleted: { $ne: true } });
      if (!selectedStoreProduct) return res.status(404).json({ message: 'Store product not found.' });
      matchType = getOfferMatchType({ storeProduct: selectedStoreProduct, supplierProduct: product });
      if (!matchType) return res.status(409).json({ message: 'Review this supplier offer as an exact or equivalent match first.' });
      const issue = getStoreProductCompatibilityIssue({ storeProduct: selectedStoreProduct, supplierProduct: product, storeId: store });
      if (issue) return res.status(409).json({ message: issue });
    }
    if (req.body.serviceSupplyId) {
      if (req.body.confirmSelection !== true || !mongoose.isValidObjectId(req.body.serviceSupplyId)) {
        return res.status(400).json({ message: 'Explicitly confirm the supplier offer and service supply.' });
      }
      selectedServiceSupply = await ServiceSupply.findOne({ _id: req.body.serviceSupplyId, store, isDeleted: { $ne: true } });
      if (!selectedServiceSupply) return res.status(404).json({ message: 'Service supply not found.' });
      matchType = getSupplyOfferMatchType({ serviceSupply: selectedServiceSupply, supplierProduct: product });
      const issue = getSupplyOfferIssue({ serviceSupply: selectedServiceSupply, supplierProduct: product, storeId: store });
      if (issue) return res.status(409).json({ message: issue });
    }
    const requested = req.body.quantity === undefined
      ? Number(product.minimumOrderQuantity)
      : Number(req.body.quantity);
    const requestedQuantity = validateProcurementQuantity({
      quantity: requested,
      minimumOrderQuantity: product.minimumOrderQuantity,
      availableStock: product.availableStock,
      itemType: product.itemType
    });
    if (!requestedQuantity.valid) {
      if (requestedQuantity.reason === 'insufficient_stock') {
        await notifySupplierStockShortage({ userId: req.user._id, storeId: store, product });
        return res.status(409).json({ message: `Only ${product.availableStock} ${product.unitOfMeasure}(s) of "${product.name}" are available.` });
      }
      return res.status(400).json({ message: `Minimum order for "${product.name}" is ${product.minimumOrderQuantity} ${product.unitOfMeasure}(s).` });
    }
    const cart = await getOrCreateProcurementCart(req.user._id, store);
    const existing = cart.items.find(item => String(item.supplierProduct) === String(product._id));
    const nextQuantity = existing ? existing.quantity + requested : requested;
    if (nextQuantity > product.availableStock) {
      await notifySupplierStockShortage({ userId: req.user._id, storeId: store, product });
      return res.status(409).json({ message: `Only ${product.availableStock} ${product.unitOfMeasure}(s) of "${product.name}" are available.` });
    }
    if (existing) {
      existing.quantity = nextQuantity;
      existing.supplier = product.supplier;
      existing.itemType = product.itemType;
      existing.addedUnitPrice = product.wholesalePrice;
      existing.updatedAt = new Date();
      if (selectedStoreProduct) {
        existing.storeProduct = selectedStoreProduct._id;
        existing.serviceSupply = null;
        existing.selectionMatchType = matchType;
        existing.selectionConfirmedBy = req.user._id;
        existing.selectionConfirmedAt = new Date();
      } else if (selectedServiceSupply) {
        existing.storeProduct = null;
        existing.serviceSupply = selectedServiceSupply._id;
        existing.selectionMatchType = matchType;
        existing.selectionConfirmedBy = req.user._id;
        existing.selectionConfirmedAt = new Date();
      }
    } else {
      cart.items.push({
        supplierProduct: product._id,
        supplier: product.supplier,
        itemType: product.itemType,
        quantity: requested,
        addedUnitPrice: product.wholesalePrice,
        storeProduct: selectedStoreProduct?._id || null,
        serviceSupply: selectedServiceSupply?._id || null,
        selectionMatchType: matchType || undefined,
        selectionConfirmedBy: selectedStoreProduct || selectedServiceSupply ? req.user._id : null,
        selectionConfirmedAt: selectedStoreProduct || selectedServiceSupply ? new Date() : undefined
      });
    }
    await cart.save();
    await populateProcurementCart(cart);
    res.status(201).json(serializeProcurementCart(cart, store));
  } catch (error) {
    console.error('Add procurement cart item error:', error);
    res.status(error.name === 'CastError' ? 400 : 500).json({ message: error.name === 'CastError' ? 'Invalid supplier product.' : 'Unable to add this supply.' });
  }
};

const updateProcurementCartItem = async (req, res) => {
  try {
    const store = await resolveUserStore(req.user);
    if (!store) return res.status(403).json({ message: 'Authorized store not found.' });
    const cart = await ProcurementCart.findOne({ user: req.user._id, store });
    if (!cart) return res.status(404).json({ message: 'Procurement cart not found.' });
    const item = cart.items.find(entry => String(entry._id) === String(req.params.itemId)
      || String(entry.supplierProduct) === String(req.params.itemId));
    if (!item) return res.status(404).json({ message: 'Supply is not in your procurement cart.' });
    const product = await SupplierProduct.findOne({ _id: item.supplierProduct, isActive: true, isDeleted: false });
    if (!product) return res.status(409).json({ message: 'This supplier product is no longer available.' });
    const supplier = await Supplier.findById(product.supplier);
    if (!isSupplierSelectableForStore(supplier, store)) return res.status(409).json({ message: 'This supplier is no longer eligible for your store.' });

    if (Object.prototype.hasOwnProperty.call(req.body, 'quantity')) {
      const quantity = Number(req.body.quantity);
      const quantityValidation = validateProcurementQuantity({
        quantity,
        minimumOrderQuantity: product.minimumOrderQuantity,
        availableStock: product.availableStock,
        itemType: product.itemType
      });
      if (!quantityValidation.valid) {
        if (quantityValidation.reason === 'insufficient_stock') {
          await notifySupplierStockShortage({ userId: req.user._id, storeId: store, product });
          return res.status(409).json({ message: `Only ${product.availableStock} ${product.unitOfMeasure}(s) are available.` });
        }
        return res.status(400).json({ message: `Minimum order for "${product.name}" is ${product.minimumOrderQuantity} ${product.unitOfMeasure}(s).` });
      }
      item.quantity = quantity;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'storeProductId')
        && Object.prototype.hasOwnProperty.call(req.body, 'serviceSupplyId')) {
      return res.status(400).json({ message: 'Select one Store inventory target per supplier offer.' });
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'storeProductId')) {
      if (req.body.storeProductId) {
        const storeProduct = await Product.findOne({ _id: req.body.storeProductId, store, isDeleted: { $ne: true } });
        if (!storeProduct) return res.status(400).json({ message: 'The selected inventory product does not belong to this store.' });
        const compatibilityIssue = getStoreProductCompatibilityIssue({ storeProduct, supplierProduct: product, storeId: store });
        if (compatibilityIssue) return res.status(409).json({ message: compatibilityIssue });
        const selectedMatchType = getOfferMatchType({ storeProduct, supplierProduct: product });
        if (selectedMatchType && req.body.confirmSelection !== true
            && String(storeProduct.supplierProductRef || '') !== String(product._id)) {
          return res.status(400).json({ message: 'Explicitly confirm the alternative supplier selection.' });
        }
        item.storeProduct = req.body.storeProductId;
        item.serviceSupply = null;
        item.selectionMatchType = selectedMatchType || undefined;
        item.selectionConfirmedBy = item.selectionMatchType && req.body.confirmSelection === true ? req.user._id : null;
        item.selectionConfirmedAt = item.selectionConfirmedBy ? new Date() : undefined;
      } else {
        item.storeProduct = null;
        item.selectionMatchType = undefined;
        item.selectionConfirmedBy = null;
        item.selectionConfirmedAt = undefined;
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'serviceSupplyId')) {
      if (req.body.serviceSupplyId) {
        if (req.body.confirmSelection !== true || !mongoose.isValidObjectId(req.body.serviceSupplyId)) {
          return res.status(400).json({ message: 'Explicitly confirm the service supply selection.' });
        }
        const serviceSupply = await ServiceSupply.findOne({ _id: req.body.serviceSupplyId, store, isDeleted: { $ne: true } });
        if (!serviceSupply) return res.status(404).json({ message: 'Service supply not found.' });
        const issue = getSupplyOfferIssue({ serviceSupply, supplierProduct: product, storeId: store });
        if (issue) return res.status(409).json({ message: issue });
        item.serviceSupply = serviceSupply._id;
        item.storeProduct = null;
        item.selectionMatchType = getSupplyOfferMatchType({ serviceSupply, supplierProduct: product });
        item.selectionConfirmedBy = req.user._id;
        item.selectionConfirmedAt = new Date();
      } else {
        item.serviceSupply = null;
        item.selectionMatchType = undefined;
        item.selectionConfirmedBy = null;
        item.selectionConfirmedAt = undefined;
      }
    }
    if (req.body.acceptCurrentPrice === true) item.addedUnitPrice = product.wholesalePrice;
    item.supplier = product.supplier;
    item.itemType = product.itemType;
    item.updatedAt = new Date();
    await cart.save();
    await populateProcurementCart(cart);
    res.json(serializeProcurementCart(cart, store));
  } catch (error) {
    console.error('Update procurement cart item error:', error);
    res.status(error.name === 'CastError' ? 400 : 500).json({ message: error.name === 'CastError' ? 'Invalid cart item.' : 'Unable to update this supply.' });
  }
};

const removeProcurementCartItem = async (req, res) => {
  try {
    const store = await resolveUserStore(req.user);
    if (!store) return res.status(403).json({ message: 'Authorized store not found.' });
    const cart = await ProcurementCart.findOne({ user: req.user._id, store });
    if (!cart) return res.status(404).json({ message: 'Procurement cart not found.' });
    const before = cart.items.length;
    cart.items = cart.items.filter(item => String(item._id) !== String(req.params.itemId)
      && String(item.supplierProduct) !== String(req.params.itemId));
    if (cart.items.length === before) return res.status(404).json({ message: 'Supply is not in your procurement cart.' });
    await cart.save();
    await populateProcurementCart(cart);
    res.json(serializeProcurementCart(cart, store));
  } catch (error) {
    console.error('Remove procurement cart item error:', error);
    res.status(error.name === 'CastError' ? 400 : 500).json({ message: error.name === 'CastError' ? 'Invalid cart item.' : 'Unable to remove this supply.' });
  }
};

const clearProcurementCart = async (req, res) => {
  try {
    const store = await resolveUserStore(req.user);
    if (!store) return res.status(403).json({ message: 'Authorized store not found.' });
    const cart = await getOrCreateProcurementCart(req.user._id, store);
    cart.items = [];
    await cart.save();
    res.json(serializeProcurementCart(cart, store));
  } catch (error) {
    console.error('Clear procurement cart error:', error);
    res.status(500).json({ message: 'Unable to clear the procurement cart.' });
  }
};

const submitProcurementCart = async (req, res) => {
  let createdOrders = [];
  let submissionIssue = null;
  let committed = false;
  try {
    const store = await resolveUserStore(req.user);
    if (!store) return res.status(403).json({ message: 'Authorized store not found.' });

    await mongoose.connection.transaction(async session => {
      const cart = await ProcurementCart.findOne({ user: req.user._id, store }).session(session);
      if (!cart?.items?.length) {
        submissionIssue = { status: 400, body: { code: 'PROCUREMENT_CART_EMPTY', message: 'Your procurement cart is empty.' } };
        return;
      }

      const productIds = cart.items.map(item => item.supplierProduct);
      const products = await SupplierProduct.find({ _id: { $in: productIds } }).session(session);
      const productMap = new Map(products.map(product => [String(product._id), product]));
      const supplierIds = [...new Set(products.map(product => String(product.supplier)))];
      const suppliers = await Supplier.find({ _id: { $in: supplierIds } }).session(session);
      const supplierMap = new Map(suppliers.map(supplier => [String(supplier._id), supplier]));
      const mappedProductIds = cart.items.filter(item => item.storeProduct).map(item => item.storeProduct);
      const mappedProducts = mappedProductIds.length
        ? await Product.find({ _id: { $in: mappedProductIds }, store, isDeleted: { $ne: true } }).session(session)
        : [];
      const mappedProductMap = new Map(mappedProducts.map(product => [String(product._id), product]));
      const mappedSupplyIds = cart.items.filter(item => item.serviceSupply).map(item => item.serviceSupply);
      const mappedSupplies = mappedSupplyIds.length
        ? await ServiceSupply.find({ _id: { $in: mappedSupplyIds }, store, isDeleted: { $ne: true } }).session(session)
        : [];
      const mappedSupplyMap = new Map(mappedSupplies.map(supply => [String(supply._id), supply]));
      const issues = [];
      const priceChanges = [];
      const transactionOrders = [];
      const resolvedCartItems = [];

      for (const item of cart.items) {
        const product = productMap.get(String(item.supplierProduct));
        if (!product || !product.isActive || product.isDeleted) {
          issues.push({ supplierProductId: item.supplierProduct, message: 'A supply in your cart is no longer available.' });
          continue;
        }
        let exactPet = null;
        if (product.itemType === 'live_pet') {
          exactPet = await Pet.findOne({
            _id: product.pet,
            sourceSupplier: product.supplier,
            listingContext: 'supplier_catalog',
            status: 'available',
            isDeleted: { $ne: true },
            acquiredThroughPurchaseOrder: null
          }).session(session);
          if (!exactPet || Number(product.availableStock) !== 1) {
            issues.push({ supplierProductId: product._id, message: `Live pet "${product.name}" is no longer available.` });
            continue;
          }
        }
        const supplier = supplierMap.get(String(product.supplier));
        if (!isSupplierSelectableForStore(supplier, store)) {
          issues.push({ supplierProductId: product._id, message: `Supplier for "${product.name}" is no longer eligible for this store.` });
          continue;
        }
        const quantity = Number(item.quantity);
        const quantityValidation = validateProcurementQuantity({
          quantity,
          minimumOrderQuantity: product.minimumOrderQuantity,
          availableStock: product.availableStock,
          itemType: product.itemType
        });
        if (!quantityValidation.valid) {
          issues.push({ supplierProductId: product._id, message: `Quantity for "${product.name}" must be ${product.minimumOrderQuantity}-${product.availableStock}.` });
          continue;
        }
        if (item.storeProduct) {
          const mappedProduct = mappedProductMap.get(String(item.storeProduct));
          if (!mappedProduct) {
            issues.push({ supplierProductId: product._id, message: `Inventory mapping for "${product.name}" does not belong to this store.` });
            continue;
          }
          const compatibilityIssue = getStoreProductCompatibilityIssue({ storeProduct: mappedProduct, supplierProduct: product, storeId: store });
          if (compatibilityIssue) {
            issues.push({ supplierProductId: product._id, message: compatibilityIssue });
            continue;
          }
          const currentMatchType = getOfferMatchType({ storeProduct: mappedProduct, supplierProduct: product });
          if ((item.selectionMatchType && (currentMatchType !== item.selectionMatchType || !item.selectionConfirmedBy))
              || (currentMatchType && String(mappedProduct.supplierProductRef || '') !== String(product._id)
                && !item.selectionConfirmedBy)) {
            issues.push({ supplierProductId: product._id, message: 'Supplier offer selection changed. Review the Store product match again.' });
            continue;
          }
        }
        if (item.storeProduct && item.serviceSupply) {
          issues.push({ supplierProductId: product._id, message: 'One supplier offer cannot target both product and service supply inventory.' });
          continue;
        }
        if (item.serviceSupply) {
          const mappedSupply = mappedSupplyMap.get(String(item.serviceSupply));
          const supplyIssue = getSupplyOfferIssue({ serviceSupply: mappedSupply, supplierProduct: product, storeId: store });
          if (supplyIssue || !item.selectionConfirmedBy || getSupplyOfferMatchType({ serviceSupply: mappedSupply, supplierProduct: product }) !== item.selectionMatchType) {
            issues.push({ supplierProductId: product._id, message: supplyIssue || 'Service supply selection changed. Review the supplier offer again.' });
            continue;
          }
        }
        if (Number(item.addedUnitPrice) !== Number(product.wholesalePrice)) {
          priceChanges.push({
            supplierProductId: product._id,
            name: product.name,
            previousUnitPrice: Number(item.addedUnitPrice),
            currentUnitPrice: Number(product.wholesalePrice)
          });
          item.addedUnitPrice = product.wholesalePrice;
          item.updatedAt = new Date();
        }
        item.supplier = product.supplier;
        item.itemType = product.itemType;
        resolvedCartItems.push({
          supplier,
          partnershipRequired: product.partnershipRequired === true || supplier.partnershipRequired === true,
          orderItem: {
            supplierProduct: product._id,
            itemType: product.itemType || 'pet_supply',
            pet: product.pet || null,
            petSnapshot: exactPet ? {
              petId: exactPet._id,
              name: exactPet.name,
              species: exactPet.species,
              breed: exactPet.breed,
              age: exactPet.age,
              ageUnit: exactPet.ageUnit,
              gender: exactPet.gender,
              size: exactPet.size,
              color: exactPet.color,
              healthCondition: exactPet.healthCondition,
              vaccinationStatus: exactPet.vaccinationStatus,
              images: exactPet.images
            } : undefined,
            storeProduct: item.storeProduct || null,
            serviceSupply: item.serviceSupply || null,
            productName: product.name,
            sku: product.sku,
            supplierNameSnapshot: supplier.businessName,
            unitOfMeasureSnapshot: product.unitOfMeasure,
            selectionMatchType: item.selectionMatchType || (item.storeProduct
              ? getOfferMatchType({ storeProduct: mappedProductMap.get(String(item.storeProduct)), supplierProduct: product }) || 'unmapped'
              : 'unmapped'),
            selectionConfirmedBy: item.selectionConfirmedBy || null,
            selectionConfirmedAt: item.selectionConfirmedAt || undefined,
            quantity,
            unitPrice: product.wholesalePrice,
            totalPrice: product.wholesalePrice * quantity
          }
        });
      }

      if (issues.length) {
        submissionIssue = { status: 409, body: { code: 'PROCUREMENT_CART_INVALID', message: 'Some cart items need attention before submission.', issues } };
        return;
      }
      if (priceChanges.length) {
        await cart.save({ session });
        submissionIssue = {
          status: 409,
          body: {
            code: 'PROCUREMENT_CART_PRICE_CHANGED',
            message: 'Supplier prices changed. The cart has been refreshed; review the updated totals before submitting again.',
            priceChanges
          }
        };
        return;
      }

      const allocations = new Map();
      for (const item of cart.items.filter(entry => entry.storeProduct || entry.serviceSupply)) {
        const key = item.serviceSupply ? `supply:${item.serviceSupply}` : `product:${item.storeProduct}`;
        allocations.set(key, (allocations.get(key) || 0) + 1);
      }
      if ([...allocations.values()].some(count => count > 1) && req.body.confirmSplit !== true) {
        submissionIssue = { status: 409, body: {
          code: 'PROCUREMENT_SPLIT_CONFIRMATION_REQUIRED',
          message: 'Quantities for one Store product or service supply are split across suppliers. Review and explicitly confirm the split.'
        } };
        return;
      }

      const groups = groupProcurementItemsBySupplier(resolvedCartItems);
      const batchId = crypto.randomBytes(5).toString('hex').toUpperCase();
      let sequence = 0;
      for (const { supplier, items } of groups.values()) {
        sequence += 1;
        const requiredItems = resolvedCartItems.filter(entry =>
          String(entry.supplier._id) === String(supplier._id) && entry.partnershipRequired);
        const partnershipSnapshot = await partnershipSnapshotForOrder({
          store, supplier: supplier._id,
          requiredProducts: requiredItems.map(entry => entry.orderItem.supplierProduct), session
        });
        if (partnershipSnapshot && requiredItems.some(entry => entry.orderItem.quantity < partnershipSnapshot.terms.minimumOrderQuantity)) {
          throw Object.assign(new Error('Agreement minimum order quantity has not been met.'), {
            statusCode: 409, code: 'PARTNERSHIP_MINIMUM_NOT_MET'
          });
        }
        const subtotal = items.reduce((total, item) => total + item.totalPrice, 0);
        const order = new PurchaseOrder({
          orderNumber: `PO-${Date.now()}-${batchId}-${String(sequence).padStart(2, '0')}`,
          seller: req.user._id,
          store,
          supplier: supplier._id,
          items,
          partnershipSnapshot: partnershipSnapshot || undefined,
          subtotal,
          shippingCost: 0,
          tax: 0,
          totalCost: subtotal,
          shippingAddress: req.body.shippingAddress || {},
          sellerNotes: req.body.sellerNotes,
          paymentMethod: req.body.paymentMethod || 'bank_transfer',
          paymentTiming: req.body.paymentTiming === 'after_inspection' ? 'after_inspection' : 'pay_now',
          paymentStatus: req.body.paymentTiming === 'after_inspection' ? 'awaiting_inspection' : 'unpaid',
          inspectionStatus: 'awaiting_delivery',
          status: 'submitted',
          statusHistory: [{ status: 'submitted', changedBy: req.user._id, notes: 'Created from procurement cart', timestamp: new Date() }]
        });
        await order.save({ session });
        await commitPurchaseOrderStock({ order, session });
        await order.save({ session });
        await Supplier.updateOne({ _id: supplier._id }, { $inc: { 'performance.totalOrders': 1 } }, { session });
        transactionOrders.push({ order, supplier });
      }
      cart.items = [];
      await cart.save({ session });
      createdOrders = transactionOrders;
    });

    if (submissionIssue) return res.status(submissionIssue.status).json(submissionIssue.body);
    committed = true;

    await Promise.allSettled(createdOrders.flatMap(({ order, supplier }) => [
      createNotification({
        recipient: supplier.user,
        sender: req.user._id,
        type: 'purchase_order',
        title: 'New Purchase Order',
        message: `New purchase order ${order.orderNumber} received. Total: ₱${order.totalCost.toLocaleString()}.`,
        relatedId: order._id,
        relatedModel: 'PurchaseOrder'
      }),
      SupplyChainLog.create({
        action: 'purchase_order_created',
        performedBy: req.user._id,
        userRole: req.user.role,
        relatedEntity: { type: 'PurchaseOrder', id: order._id },
        description: `PO ${order.orderNumber} created for supplier "${supplier.businessName}" (₱${order.totalCost})`,
        store,
        supplier: supplier._id,
        metadata: { source: 'procurement_cart' }
      })
    ]));

    const orderDocuments = createdOrders.map(entry => entry.order);
    await Promise.all(orderDocuments.map(order => order.populate([
      { path: 'supplier', select: 'businessName' },
      { path: 'items.supplierProduct', select: 'name sku images' }
    ]).catch(() => order)));
    res.status(201).json({
      message: `${orderDocuments.length} supplier-specific purchase order${orderDocuments.length === 1 ? '' : 's'} submitted.`,
      orders: orderDocuments,
      supplierCount: orderDocuments.length
    });
  } catch (error) {
    if (!error.statusCode) console.error('Submit procurement cart error:', error);
    if (committed && !res.headersSent) {
      return res.status(201).json({
        message: `${createdOrders.length} supplier-specific purchase order${createdOrders.length === 1 ? '' : 's'} submitted. A non-critical response step could not be completed.`,
        orders: createdOrders.map(entry => entry.order),
        supplierCount: createdOrders.length
      });
    }
    if (res.headersSent) return undefined;
    res.status(error.statusCode || 500).json({
      code: error.statusCode ? error.code : 'PROCUREMENT_SUBMISSION_FAILED',
      message: error.statusCode ? error.message : 'No purchase orders were created. Your procurement cart was preserved.'
    });
  }
};

const createPurchaseOrder = async (_req, res) => res.status(410).json({
  code: 'PROCUREMENT_CART_REQUIRED',
  message: 'Direct purchase-order creation is retired. Add authoritative supplier items to the procurement cart and submit the cart.'
});

// Retained temporarily as implementation history for compatibility review.
// It is intentionally not routed or exported because it predates the
// authoritative transactional procurement-cart workflow.
const retiredDirectPurchaseOrderImplementation = async (req, res) => {
  try {
    const { supplierId, items, shippingAddress, sellerNotes, paymentMethod } = req.body;

    if (!supplierId || !items || items.length === 0) {
      return res.status(400).json({ message: 'Supplier and at least one item are required.' });
    }
    if (!Array.isArray(items) || items.length > 100) return res.status(400).json({ message: 'Items must be a list containing no more than 100 entries.' });
    const productIds = items.map(item => String(item.supplierProductId || ''));
    if (new Set(productIds).size !== productIds.length) return res.status(400).json({ message: 'Duplicate products are not allowed in one purchase order.' });

    // Resolve the caller's authoritative store before checking supplier scope.
    const store = await resolveUserStore(req.user);
    if (!store) return res.status(400).json({ message: 'You must have a store to create purchase orders.' });

    const supplier = await Supplier.findById(supplierId);
    if (!isSupplierSelectableForStore(supplier, store)) {
      return res.status(400).json({ message: 'The selected supplier is not active or eligible for this store.' });
    }

    // Validate items
    let subtotal = 0;
    const resolvedItems = [];

    for (const item of items) {
      const product = await SupplierProduct.findOne({
        _id: item.supplierProductId,
        supplier: supplierId,
        isActive: true,
        isDeleted: false
      });

      if (!product) {
        return res.status(400).json({ message: `Product not found: ${item.supplierProductId}` });
      }
      if (product.itemType === 'live_pet') {
        const pet = await Pet.findOne({
          _id: product.pet,
          sourceSupplier: supplier._id,
          listingContext: 'supplier_catalog',
          status: 'available',
          isDeleted: { $ne: true },
          acquiredThroughPurchaseOrder: null
        });
        if (!pet || Number(product.availableStock) !== 1) return res.status(409).json({ message: `Live pet "${product.name}" is no longer available.` });
      }

      const quantityValidation = validateProcurementQuantity({
        quantity: item.quantity,
        minimumOrderQuantity: product.minimumOrderQuantity,
        availableStock: product.availableStock,
        itemType: product.itemType
      });
      if (!quantityValidation.valid) return res.status(400).json({ message: product.itemType === 'live_pet' ? 'A live-pet quantity must be exactly one.' : `Quantity for "${product.name}" is invalid.` });
      if (item.quantity < product.minimumOrderQuantity) {
        return res.status(400).json({
          message: `Minimum order for "${product.name}" is ${product.minimumOrderQuantity} ${product.unitOfMeasure}(s).`
        });
      }

      if (item.quantity > product.availableStock) {
        return res.status(400).json({
          message: `Insufficient stock for "${product.name}". Available: ${product.availableStock}.`
        });
      }

      const totalPrice = product.wholesalePrice * item.quantity;
      subtotal += totalPrice;

      if (item.storeProductId) {
        const mappedProduct = await Product.exists({ _id: item.storeProductId, store, isDeleted: { $ne: true } });
        if (!mappedProduct) return res.status(400).json({ message: `Selected inventory product for "${product.name}" does not belong to this store.` });
      }
      resolvedItems.push({
        supplierProduct: product._id,
        itemType: product.itemType || 'pet_supply',
        pet: product.pet || null,
        storeProduct: item.storeProductId || null,
        productName: product.name,
        sku: product.sku,
        quantity: Number(item.quantity),
        unitPrice: product.wholesalePrice,
        totalPrice
      });
    }

    const order = new PurchaseOrder({
      seller: req.user._id,
      store,
      supplier: supplierId,
      items: resolvedItems,
      subtotal,
      // No authoritative procurement shipping/tax calculator exists yet. Keep
      // these at zero instead of accepting customer-controlled totals.
      shippingCost: 0,
      tax: 0,
      totalCost: subtotal,
      shippingAddress: shippingAddress || {},
      sellerNotes,
      paymentMethod: paymentMethod || 'bank_transfer',
      paymentTiming: req.body.paymentTiming === 'after_inspection' ? 'after_inspection' : 'pay_now',
      paymentStatus: req.body.paymentTiming === 'after_inspection' ? 'awaiting_inspection' : 'unpaid',
      inspectionStatus: 'awaiting_delivery',
      status: 'submitted'
    });

    order.statusHistory.push({
      status: 'submitted',
      changedBy: req.user._id,
      notes: 'Purchase order submitted',
      timestamp: new Date()
    });

    await order.save();

    const reservedLivePetItems = [];
    try {
      for (const orderItem of order.items.filter(item => item.itemType === 'live_pet')) {
        const reservedPet = await Pet.findOneAndUpdate({
          _id: orderItem.pet,
          sourceSupplier: supplier._id,
          listingContext: 'supplier_catalog',
          status: 'available',
          acquiredThroughPurchaseOrder: null,
          'procurementReservation.purchaseOrder': null
        }, {
          $set: {
            status: 'reserved',
            isAvailable: false,
            'procurementReservation.purchaseOrder': order._id,
            'procurementReservation.reservedAt': new Date()
          }
        }, { new: true });
        if (!reservedPet) {
          throw Object.assign(new Error(`Live pet "${orderItem.productName}" became unavailable during submission.`), { statusCode: 409 });
        }
        reservedLivePetItems.push(orderItem);
        await SupplierProduct.updateOne({ _id: orderItem.supplierProduct }, { $set: { availableStock: 0 } });
      }
    } catch (reservationError) {
      await Promise.allSettled(reservedLivePetItems.map(async item => {
        const released = await Pet.findOneAndUpdate({
          _id: item.pet,
          'procurementReservation.purchaseOrder': order._id,
          acquiredThroughPurchaseOrder: null
        }, {
          $set: { status: 'available', isAvailable: true },
          $unset: { procurementReservation: 1 }
        }, { new: true });
        if (released) await SupplierProduct.updateOne({ _id: item.supplierProduct }, { $set: { availableStock: 1 } });
      }));
      await PurchaseOrder.deleteOne({ _id: order._id });
      throw reservationError;
    }

    // Update supplier total orders
    supplier.performance.totalOrders += 1;
    await supplier.save();

    // The order and exact-pet reservation are already authoritative. Secondary
    // notification/audit failures must not return a false failure response.
    await Promise.allSettled([
      createNotification({
      recipient: supplier.user,
      sender: req.user._id,
      type: 'purchase_order',
      title: 'New Purchase Order',
      message: `New purchase order ${order.orderNumber} received. Total: ₱${order.totalCost.toLocaleString()}.`,
      relatedId: order._id,
      relatedModel: 'PurchaseOrder'
      }),

      SupplyChainLog.create({
      action: 'purchase_order_created',
      performedBy: req.user._id,
      userRole: req.user.role,
      relatedEntity: { type: 'PurchaseOrder', id: order._id },
      description: `PO ${order.orderNumber} created for supplier "${supplier.businessName}" (₱${order.totalCost})`,
      store, supplier: supplierId
      })
    ]);

    await order.populate([
      { path: 'supplier', select: 'businessName' },
      { path: 'items.supplierProduct', select: 'name sku images' }
    ]);

    res.status(201).json(order);
  } catch (error) {
    console.error('Create purchase order error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
  }
};

// Get seller's purchase orders
const getSellerOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const store = await resolveUserStore(req.user);
    if (!store) return res.status(403).json({ message: 'Authorized store not found.' });
    let filter = { store, isDeleted: false };
    if (status) filter.status = status;

    const skip = (page - 1) * limit;
    const orders = await PurchaseOrder.find(filter)
      .populate('supplier', 'businessName logo')
      .populate('store', 'name')
      .populate('items.supplierProduct', 'name sku category description images brand retailPrice unitOfMeasure itemType pet')
      .populate('items.storeProduct', 'name sku category unit stockQuantity visibility isActive store supplierProductRef procurementOffers')
      .populate('items.serviceSupply', 'name sku category unitOfMeasure currentStock store supplierProduct supplierOffers')
      .populate('items.pet', 'name species breed age ageUnit gender size images healthCondition vaccinationStatus')
      .populate('receivingReport')
      .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await PurchaseOrder.countDocuments(filter);

    res.json({
      orders: orders.map(sanitizeOrderReceivingReport),
      pagination: { page: parseInt(page), totalPages: Math.ceil(total / limit), total }
    });
  } catch (error) {
    console.error('Get seller orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get single order
const getOrderById = async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id)
      .populate('seller', 'firstName lastName email')
      .populate('supplier', 'businessName email phone')
      .populate('store', 'name')
      .populate('items.supplierProduct', 'name sku category description images brand wholesalePrice retailPrice unitOfMeasure itemType pet')
      .populate('items.storeProduct', 'name sku category unit stockQuantity visibility isActive store supplierProductRef procurementOffers')
      .populate('items.serviceSupply', 'name sku category unitOfMeasure currentStock store supplierProduct supplierOffers')
      .populate('items.pet', 'name species breed age ageUnit gender size images healthCondition vaccinationStatus')
      .populate('statusHistory.changedBy', 'firstName lastName');

    if (!order) return res.status(404).json({ message: 'Order not found.' });

    // Verify access: seller, supplier, or admin
    const supplier = await Supplier.findById(order.supplier);
    const isParty = order.seller.toString() === req.user._id.toString() ||
      (supplier && supplier.user.toString() === req.user._id.toString()) ||
      isPlatformAdmin(req.user) ||
      await canOperateStore(req.user, order.store?._id || order.store, ['procurement.view', 'procurement.manage', 'purchase_orders.own']);

    if (!isParty) return res.status(403).json({ message: 'Access denied.' });

    const receivingReport = await ProcurementReceivingReport.findOne({ purchaseOrder: order._id })
      .populate('receivedBy', 'firstName lastName')
      .lean();
    res.json({ ...order.toObject(), receivingReport: sanitizeReceivingReport(receivingReport) });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Cancel order (by seller, only if not yet shipped)
const cancelOrder = async (req, res) => {
  let order;
  try {
    const store = await resolveUserStore(req.user);
    if (!store) return res.status(403).json({ message: 'Authorized store not found.' });
    await mongoose.connection.transaction(async session => {
      order = await PurchaseOrder.findOne({ _id: req.params.id, store }).session(session);
      if (!order) throw Object.assign(new Error('Order not found.'), { statusCode: 404 });
      if (['shipped', 'delivered', 'issue_reported', 'pending_supplier_resolution', 'resolution_submitted', 'resolution_accepted', 'resolution_rejected', 'awaiting_replacement', 'reinspection', 'resolved', 'completed', 'returned', 'cancelled'].includes(order.status)) {
        throw Object.assign(new Error(`Cannot cancel order in "${order.status}" status.`), { statusCode: 409 });
      }
      if (order.paymentStatus === 'paid') {
        throw Object.assign(new Error('A paid purchase order requires an authorized refund process before cancellation.'), { statusCode: 409 });
      }
      if (order.paymentStatus === 'pending' || order.paymentDetails?.sessionStatus === 'active') {
        throw Object.assign(new Error('Cancel the active PayMongo payment session before cancelling this purchase order.'), { statusCode: 409 });
      }

      await releasePurchaseOrderStock({ order, session });
      order.status = 'cancelled';
      order.cancellationReason = req.body.reason || 'Cancelled by seller';
      order.statusHistory.push({
        status: 'cancelled', changedBy: req.user._id,
        notes: order.cancellationReason, timestamp: new Date()
      });
      await order.save({ session });
    });

    const supplier = await Supplier.findById(order.supplier);
    await Promise.allSettled([
      supplier && createNotification({
        recipient: supplier.user,
        sender: req.user._id,
        type: 'purchase_order',
        title: 'Purchase Order Cancelled',
        message: `Purchase order ${order.orderNumber} has been cancelled.`,
        relatedId: order._id,
        relatedModel: 'PurchaseOrder'
      })
    ].filter(Boolean));

    res.json(order);
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(error.statusCode || (error.name === 'CastError' ? 400 : 500)).json({
      message: error.message || 'Unable to cancel this purchase order.'
    });
  }
};

const RECEIVING_LINKABLE_STATUSES = ['delivered', 'issue_reported', 'reinspection'];

const assertReceivingProductLinkIsMutable = async ({ order, orderItem, session }) => {
  const query = ProcurementReceivingReport.findOne({ purchaseOrder: order._id });
  const report = await (session ? query.session(session) : query);
  const received = report?.items?.find(item => String(item.purchaseOrderItem) === String(orderItem._id));
  if (received?.inventoryApplied && Number(received.acceptedQuantity) > 0) {
    throw Object.assign(new Error('This purchase-order item already updated inventory and can no longer be relinked.'), { statusCode: 409 });
  }
};

const getReceivingProductLinks = async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id)
      .populate('items.supplierProduct').populate('items.serviceSupply', 'name sku category unitOfMeasure currentStock store');
    if (!order) return res.status(404).json({ message: 'Purchase order not found.' });
    if (!(await canOperateStore(req.user, order.store, ['procurement.view', 'procurement.manage', 'inventory.receive']))) {
      return res.status(403).json({ message: 'Purchase order belongs to another store.' });
    }
    if (!RECEIVING_LINKABLE_STATUSES.includes(order.status)) {
      return res.status(409).json({ message: 'Store product links can only be changed while a delivery is awaiting receiving.' });
    }

    const storeProducts = await Product.find({
      store: order.store,
      isActive: true,
      isDeleted: { $ne: true }
    }).select('name sku category unit stockQuantity store supplierProductRef procurementOffers visibility isActive isDeleted').sort({ name: 1 }).limit(500);
    const report = await ProcurementReceivingReport.findOne({ purchaseOrder: order._id }).select('items');

    const items = order.items.filter(item => item.itemType !== 'live_pet').map(orderItem => {
      const supplierProduct = orderItem.supplierProduct;
      if (orderItem.serviceSupply) {
        const received = report?.items?.find(item => String(item.purchaseOrderItem) === String(orderItem._id));
        return {
          purchaseOrderItem: orderItem._id, productName: orderItem.productName,
          serviceSupply: orderItem.serviceSupply, supplierProduct,
          linkedProduct: null, eligibleProducts: [], suggestions: null,
          linkSource: 'service_supply',
          linkLocked: Boolean(received?.inventoryApplied && Number(received.acceptedQuantity) > 0)
        };
      }
      const eligibleProducts = supplierProduct ? storeProducts.filter(storeProduct => !getStoreProductCompatibilityIssue({
        storeProduct,
        supplierProduct,
        storeId: order.store
      })) : [];
      let linkedProduct = orderItem.storeProduct
        ? eligibleProducts.find(product => String(product._id) === String(orderItem.storeProduct)) || null
        : null;
      let linkSource = linkedProduct ? 'explicit' : null;
      if (!linkedProduct && orderItem.sku) {
        linkedProduct = eligibleProducts.find(product => product.sku === orderItem.sku) || null;
        if (linkedProduct) linkSource = 'sku_match';
      }
      const received = report?.items?.find(item => String(item.purchaseOrderItem) === String(orderItem._id));
      return {
        purchaseOrderItem: orderItem._id,
        productName: orderItem.productName,
        supplierProduct: supplierProduct ? {
          _id: supplierProduct._id,
          name: supplierProduct.name,
          sku: supplierProduct.sku,
          category: supplierProduct.category,
          description: supplierProduct.description,
          images: supplierProduct.images,
          brand: supplierProduct.brand,
          retailPrice: supplierProduct.retailPrice,
          unitOfMeasure: supplierProduct.unitOfMeasure
        } : null,
        linkedProduct,
        linkSource,
        linkLocked: Boolean(received?.inventoryApplied && Number(received.acceptedQuantity) > 0),
        eligibleProducts,
        suggestions: getDraftProductSuggestions(supplierProduct)
      };
    });
    return res.json({ orderId: order._id, storeId: order.store, items });
  } catch (error) {
    return res.status(error.statusCode || (error.name === 'CastError' ? 400 : 500)).json({
      message: error.name === 'CastError' ? 'Invalid purchase order.' : (error.message || 'Unable to load receiving product links.')
    });
  }
};

const linkReceivingStoreProduct = async (req, res) => {
  try {
    const inspectedOrder = await PurchaseOrder.findById(req.params.id).select('store status items');
    if (!inspectedOrder) return res.status(404).json({ message: 'Purchase order not found.' });
    if (!(await canOperateStore(req.user, inspectedOrder.store, ['procurement.manage', 'inventory.receive']))) {
      return res.status(403).json({ message: 'Purchase order belongs to another store.' });
    }
    if (!req.body.storeProductId) return res.status(400).json({ message: 'Select a Store product to link.' });

    let linkedProduct;
    await mongoose.connection.transaction(async session => {
      const order = await PurchaseOrder.findOne({
        _id: inspectedOrder._id,
        status: { $in: RECEIVING_LINKABLE_STATUSES }
      }).populate('items.supplierProduct').session(session);
      if (!order) throw Object.assign(new Error('This delivery is no longer available for product linking.'), { statusCode: 409 });
      const orderItem = order.items.id(req.params.itemId);
      if (!orderItem || orderItem.itemType === 'live_pet' || orderItem.serviceSupply) {
        throw Object.assign(new Error('Purchase-order item is not eligible for Store product linking.'), { statusCode: 404 });
      }
      if (!orderItem.supplierProduct) {
        throw Object.assign(new Error('Supplier product identity is unavailable; this item cannot be linked safely.'), { statusCode: 409 });
      }
      await assertReceivingProductLinkIsMutable({ order, orderItem, session });
      linkedProduct = await Product.findOne({
        _id: req.body.storeProductId,
        store: order.store,
        isDeleted: { $ne: true }
      }).session(session);
      if (!linkedProduct) {
        throw Object.assign(new Error('The selected Store product is unavailable or belongs to another Store.'), { statusCode: 403 });
      }
      assertStoreProductCompatible({ storeProduct: linkedProduct, supplierProduct: orderItem.supplierProduct, storeId: order.store });
      if (!linkedProduct.supplierProductRef) {
        linkedProduct.supplierRef = order.supplier;
        linkedProduct.supplierProductRef = orderItem.supplierProduct._id;
      }
      orderItem.storeProduct = linkedProduct._id;
      await linkedProduct.save({ session });
      await order.save({ session });
    });
    return res.json({ message: 'Store product linked for receiving.', product: linkedProduct });
  } catch (error) {
    return res.status(error.statusCode || (error.name === 'CastError' ? 400 : 500)).json({
      message: error.name === 'CastError' ? 'Invalid product link request.' : (error.message || 'Unable to link this Store product.')
    });
  }
};

const createReceivingStoreProduct = async (req, res) => {
  try {
    const inspectedOrder = await PurchaseOrder.findById(req.params.id).select('store status items supplier');
    if (!inspectedOrder) return res.status(404).json({ message: 'Purchase order not found.' });
    if (!(await canOperateStore(req.user, inspectedOrder.store, ['procurement.manage', 'inventory.receive']))) {
      return res.status(403).json({ message: 'Purchase order belongs to another store.' });
    }

    let product;
    let created = false;
    await mongoose.connection.transaction(async session => {
      const order = await PurchaseOrder.findOne({
        _id: inspectedOrder._id,
        status: { $in: RECEIVING_LINKABLE_STATUSES }
      }).populate('items.supplierProduct').session(session);
      if (!order) throw Object.assign(new Error('This delivery is no longer available for product creation.'), { statusCode: 409 });
      const orderItem = order.items.id(req.params.itemId);
      if (!orderItem || orderItem.itemType === 'live_pet' || orderItem.serviceSupply) {
        throw Object.assign(new Error('Purchase-order item is not eligible for Store product creation.'), { statusCode: 404 });
      }
      if (!orderItem.supplierProduct) {
        throw Object.assign(new Error('Supplier product identity is unavailable; a Store product cannot be created safely.'), { statusCode: 409 });
      }
      await assertReceivingProductLinkIsMutable({ order, orderItem, session });

      if (orderItem.storeProduct) {
        product = await Product.findOne({ _id: orderItem.storeProduct, store: order.store, isDeleted: { $ne: true } }).session(session);
        if (!product) throw Object.assign(new Error('The existing Store product link is no longer valid.'), { statusCode: 409 });
        assertStoreProductCompatible({ storeProduct: product, supplierProduct: orderItem.supplierProduct, storeId: order.store });
        return;
      }

      product = await Product.findOne({
        store: order.store,
        supplierProductRef: orderItem.supplierProduct._id,
        isDeleted: { $ne: true }
      }).session(session);
      if (product) {
        assertStoreProductCompatible({ storeProduct: product, supplierProduct: orderItem.supplierProduct, storeId: order.store });
      } else {
        const productData = buildDraftStoreProduct({
          supplierProduct: orderItem.supplierProduct,
          supplierId: order.supplier,
          storeId: order.store,
          userId: req.user._id,
          input: req.body
        });
        [product] = await Product.create([productData], { session });
        created = true;
      }
      orderItem.storeProduct = product._id;
      await order.save({ session });
    });
    return res.status(created ? 201 : 200).json({
      message: created ? 'Draft Store product created and linked for receiving.' : 'Existing Store product link reused for receiving.',
      created,
      product
    });
  } catch (error) {
    const duplicateSku = error.code === 11000 && (error.keyPattern?.sku || error.keyValue?.sku);
    return res.status(duplicateSku ? 409 : (error.statusCode || (error.name === 'ValidationError' || error.name === 'CastError' ? 400 : 500))).json({
      message: duplicateSku ? 'That Store SKU is already in use. Enter a different SKU.' : (error.message || 'Unable to create a Store product for receiving.')
    });
  }
};


const parseInspectionItems = value => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try { return JSON.parse(value); } catch (_error) { return []; }
};

const userCanAccessPurchaseOrder = async (user, order, permissions) => {
  if (isPlatformAdmin(user)) return true;
  const supplier = await Supplier.findById(order.supplier).select('user');
  if (supplier && String(supplier.user) === String(user._id)) return true;
  return canOperateStore(user, order.store?._id || order.store, permissions);
};

const authorizeReceivingInspectionUpload = async (req, res, next) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id).select('store status');
    if (!order) return res.status(404).json({ message: 'Purchase order not found.' });
    if (!(await canOperateStore(req.user, order.store, ['procurement.manage', 'inventory.receive']))) {
      return res.status(403).json({ message: 'Purchase order belongs to another store.' });
    }
    if (!['delivered', 'issue_reported'].includes(order.status)) {
      return res.status(409).json({ message: 'The supplier must mark this purchase order delivered before inspection.' });
    }
    const existing = await ProcurementReceivingReport.findOne({ purchaseOrder: order._id }).select('processingStatus updatedAt');
    if (existing?.processingStatus === 'completed') {
      return res.status(409).json({ message: 'This delivery has already been inspected.' });
    }
    const isFreshProcessing = existing?.processingStatus === 'processing'
      && existing.updatedAt > getReceivingProcessingCutoff();
    if (isFreshProcessing) return res.status(409).json({ message: 'This inspection is already being processed.' });
    req.receivingInspectionOrderId = order._id;
    return next();
  } catch (error) {
    return res.status(error.name === 'CastError' ? 400 : 500).json({
      message: error.name === 'CastError' ? 'Invalid purchase order.' : 'Unable to authorize receiving evidence.'
    });
  }
};

const recordReceivedSupplierQuantity = async ({ orderItem, acceptedQuantity, session }) => {
  if (!session) throw new Error('Receiving supplier quantity requires an active transaction.');
  const alreadyRecorded = Number(orderItem.receivedQuantity || 0);
  if (alreadyRecorded >= Number(acceptedQuantity)) return;
  const committedQuantity = Number(orderItem.supplierStockCommittedQuantity || 0);
  if (committedQuantity > 0) {
    if (orderItem.supplierStockCommitmentReleased) {
      throw Object.assign(new Error(`Supplier stock commitment for "${orderItem.productName}" was already released.`), { statusCode: 409 });
    }
    if (Number(acceptedQuantity) > committedQuantity) {
      throw Object.assign(new Error(`Accepted quantity exceeds the committed supplier stock for "${orderItem.productName}".`), { statusCode: 409 });
    }
    orderItem.receivedQuantity = Number(acceptedQuantity);
    return;
  }
  const increment = Number(acceptedQuantity) - alreadyRecorded;
  const stockUpdate = await SupplierProduct.findOneAndUpdate({
    _id: orderItem.supplierProduct,
    availableStock: { $gte: increment }
  }, { $inc: { availableStock: -increment } }, { new: true, session });
  if (!stockUpdate) {
    throw Object.assign(new Error(`Supplier availability changed for "${orderItem.productName}".`), { statusCode: 409 });
  }
  orderItem.receivedQuantity = Number(acceptedQuantity);
};

const applyReceivingItem = async ({
  order,
  orderItem,
  reportItem,
  supplier,
  userId,
  userRole,
  session,
  receivedQuantityTarget = reportItem.acceptedQuantity,
  idempotencyKey = `po-inspection-receipt:${order._id}:${orderItem._id}`
}) => {
  if (!session) throw new Error('Receiving inventory application requires an active transaction.');
  if (reportItem.inventoryApplied || reportItem.acceptedQuantity <= 0) {
    reportItem.inventoryApplied = true;
    return;
  }

  if (orderItem.itemType === 'live_pet') {
    const pet = await Pet.findOne({
      _id: orderItem.pet,
      sourceSupplier: order.supplier,
      isDeleted: { $ne: true },
      'procurementReservation.purchaseOrder': order._id
    }).session(session);
    if (!pet) throw Object.assign(new Error(`The exact live pet for "${orderItem.productName}" is unavailable.`), { statusCode: 409 });
    if (pet.acquiredThroughPurchaseOrder && String(pet.acquiredThroughPurchaseOrder) !== String(order._id)) {
      throw Object.assign(new Error(`The live pet "${orderItem.productName}" was already acquired through another request.`), { statusCode: 409 });
    }
    pet.store = order.store;
    pet.addedBy = order.seller;
    pet.acquiredThroughPurchaseOrder = order._id;
    pet.listingContext = 'marketplace';
    pet.status = 'unavailable';
    pet.isAvailable = false;
    pet.quantity = 1;
    pet.procurementReservation.completedAt = new Date();
    await pet.save({ session });
  } else {
    if (!orderItem.supplierProduct) {
      throw Object.assign(new Error(`Supplier product identity for "${orderItem.productName}" is unavailable.`), { statusCode: 409 });
    }
    const previouslyReceived = Number(orderItem.receivedQuantity || 0);
    await recordReceivedSupplierQuantity({
      orderItem,
      acceptedQuantity: receivedQuantityTarget,
      session
    });
    if (orderItem.serviceSupply) {
      await applyServiceSupplyReceipt({
        order, orderItem, supplierProduct: orderItem.supplierProduct,
        acceptedQuantity: reportItem.acceptedQuantity,
        previousQuantity: previouslyReceived, receivedQuantityTarget,
        userId, userRole, session, idempotencyKey
      });
      reportItem.inventoryApplied = true;
      return;
    }
    let storeProduct = orderItem.storeProduct
      ? await Product.findOne({ _id: orderItem.storeProduct, store: order.store, isActive: true, isDeleted: { $ne: true } }).session(session)
      : null;
    if (!storeProduct && orderItem.sku) {
      storeProduct = await Product.findOne({ store: order.store, sku: orderItem.sku, isActive: true, isDeleted: { $ne: true } }).session(session);
    }
    if (!storeProduct) {
      throw Object.assign(new Error(`Link "${orderItem.productName}" to a store product before accepting it into inventory.`), { statusCode: 409 });
    }
    assertStoreProductCompatible({ storeProduct, supplierProduct: orderItem.supplierProduct, storeId: order.store });
    orderItem.storeProduct = storeProduct._id;

    const currentInventory = await Inventory.findOne({ store: order.store, product: storeProduct._id }).session(session);
    const currentQuantity = Number(currentInventory?.quantity ?? storeProduct.stockQuantity ?? 0);
    const maximumQuantity = Number(currentInventory?.maxStock ?? 1000);
    if (currentQuantity + Number(reportItem.acceptedQuantity) > maximumQuantity) {
      throw Object.assign(new Error(
        `Receiving ${reportItem.acceptedQuantity} unit(s) of "${storeProduct.name}" would exceed its inventory capacity of ${maximumQuantity}.`
      ), { statusCode: 409 });
    }

    const existingLotCount = await InventoryLot.countDocuments({ store: order.store, product: storeProduct._id }).session(session);
    if (existingLotCount === 0 && Number(storeProduct.stockQuantity) > 0) {
      await InventoryLedgerService.receiveLot({
        store: order.store,
        product: storeProduct._id,
        lotNumber: `LEGACY-OPENING-${storeProduct.sku || storeProduct._id}`,
        quantity: Number(storeProduct.stockQuantity),
        unitCost: orderItem.unitPrice,
        performedBy: userId,
        idempotencyKey: `legacy-opening:${order.store}:${storeProduct._id}`
      }, { session });
    }
    const lot = reportItem.lotDetails || {};
    await InventoryLedgerService.receiveLot({
      store: order.store,
      product: storeProduct._id,
      lotNumber: lot.lotNumber || `PO-${order.orderNumber}-${orderItem._id}`,
      quantity: reportItem.acceptedQuantity,
      unitCost: orderItem.unitPrice,
      expiresAt: lot.expiresAt || orderItem.supplierProduct?.expirationDate,
      manufacturer: lot.manufacturer,
      supplier: supplier?._id,
      purchaseOrder: order._id,
      purchaseOrderItem: orderItem._id,
      isVaccine: Boolean(lot.isVaccine),
      vaccineType: lot.vaccineType,
      storageNotes: lot.storageNotes,
      performedBy: userId,
      idempotencyKey
    }, { session });
    // Inventory records the latest receiving source; the Store product keeps
    // its primary supplier identity when a reviewed alternative fulfills it.
    if (!storeProduct.supplierProductRef) {
      await Product.updateOne({ _id: storeProduct._id, store: order.store }, {
        $set: { supplierRef: supplier?._id, supplierProductRef: orderItem.supplierProduct?._id || orderItem.supplierProduct }
      }, { session });
    }
    await Inventory.updateOne({ store: order.store, product: storeProduct._id }, {
      $set: {
        supplierRef: supplier?._id,
        supplierProductRef: orderItem.supplierProduct?._id || orderItem.supplierProduct,
        lastPurchaseOrderRef: order._id,
        supplier: supplier ? { name: supplier.businessName, contact: supplier.contactPerson, email: supplier.email, phone: supplier.phone } : {}
      }
    }, { session });
  }

  if (orderItem.itemType === 'live_pet' && Number(orderItem.receivedQuantity || 0) < 1) {
    orderItem.receivedQuantity = 1;
  }
  reportItem.inventoryApplied = true;
};

const submitReceivingInspection = async (req, res) => {
  let report;
  let receivingCommitted = false;
  let receivingClaimTimestamp;
  try {
    const inspectedOrder = await PurchaseOrder.findById(req.params.id).populate('items.supplierProduct');
    if (!inspectedOrder) return res.status(404).json({ message: 'Purchase order not found.' });
    if (!(await canOperateStore(req.user, inspectedOrder.store, ['procurement.manage', 'inventory.receive']))) {
      return res.status(403).json({ message: 'Purchase order belongs to another store.' });
    }
    if (inspectedOrder.status !== 'delivered' && inspectedOrder.status !== 'issue_reported') {
      return res.status(409).json({ message: 'The supplier must mark this purchase order delivered before inspection.' });
    }

    const existing = await ProcurementReceivingReport.findOne({ purchaseOrder: inspectedOrder._id });
    const staleProcessingCutoff = getReceivingProcessingCutoff();
    if (existing?.processingStatus === 'completed') return res.status(409).json({ message: 'This delivery has already been inspected.' });
    if (existing?.processingStatus === 'processing' && existing.updatedAt > staleProcessingCutoff) {
      return res.status(409).json({ message: 'This inspection is already being processed.' });
    }

    const submittedRows = parseInspectionItems(req.body.items);
    const orderItemIds = new Set(inspectedOrder.items.map(item => String(item._id)));
    const submittedIds = submittedRows.map(item => String(item.purchaseOrderItem || item.itemId || ''));
    if (submittedRows.length !== inspectedOrder.items.length
        || new Set(submittedIds).size !== submittedIds.length
        || submittedIds.some(id => !orderItemIds.has(id))) {
      return res.status(400).json({ message: 'Inspection quantities must be supplied exactly once for every purchase-order item.' });
    }
    const submittedById = new Map(submittedRows.map(item => [String(item.purchaseOrderItem || item.itemId), item]));
    const normalizedItems = inspectedOrder.items.map(item => normalizeInspectionItem({
      orderItem: item,
      submitted: submittedById.get(String(item._id)) || {}
    }));
    const previouslyProcessed = new Map((existing?.items || []).map(item => [
      String(item.purchaseOrderItem),
      item.toObject ? item.toObject() : item
    ]));
    for (const row of normalizedItems) {
      const prior = previouslyProcessed.get(String(row.purchaseOrderItem));
      if (!prior?.inventoryApplied) continue;
      if (Number(prior.acceptedQuantity) !== Number(row.acceptedQuantity)) {
        return res.status(409).json({
          message: 'A previously received item cannot be changed while retrying an interrupted inspection.'
        });
      }
      row.inventoryApplied = true;
    }
    const outcome = determineInspectionOutcome(normalizedItems);
    if (req.body.outcome && req.body.outcome !== outcome) {
      return res.status(400).json({ message: `Inspection quantities require the outcome "${outcome}".` });
    }

    for (const row of normalizedItems) {
      const orderItem = inspectedOrder.items.id(row.purchaseOrderItem);
      if (row.acceptedQuantity > 0 && orderItem.itemType !== 'live_pet') {
        if (!orderItem.supplierProduct) {
          return res.status(409).json({ message: `Supplier product identity for "${orderItem.productName}" is unavailable.` });
        }
        if (orderItem.serviceSupply) {
          const linkedSupply = await ServiceSupply.findOne({
            _id: orderItem.serviceSupply, store: inspectedOrder.store, isActive: true, isDeleted: { $ne: true }
          });
          const issue = getSupplyOfferIssue({ serviceSupply: linkedSupply,
            supplierProduct: orderItem.supplierProduct, storeId: inspectedOrder.store });
          if (issue) return res.status(409).json({ code: 'RECEIVING_SUPPLY_LINK_INVALID', purchaseOrderItem: orderItem._id, message: issue });
          continue;
        }
        let linkedProduct = orderItem.storeProduct
          ? await Product.findOne({ _id: orderItem.storeProduct, store: inspectedOrder.store, isActive: true, isDeleted: { $ne: true } })
          : null;
        if (!linkedProduct && orderItem.sku) {
          linkedProduct = await Product.findOne({ store: inspectedOrder.store, sku: orderItem.sku, isActive: true, isDeleted: { $ne: true } });
        }
        if (!linkedProduct) {
          return res.status(409).json({
            code: 'RECEIVING_PRODUCT_LINK_REQUIRED',
            purchaseOrderItem: orderItem._id,
            message: `Link "${orderItem.productName}" to a Store product or create a new draft product before accepting it.`
          });
        }
        const compatibilityIssue = getStoreProductCompatibilityIssue({
          storeProduct: linkedProduct,
          supplierProduct: orderItem.supplierProduct,
          storeId: inspectedOrder.store
        });
        if (compatibilityIssue) {
          return res.status(409).json({
            code: 'RECEIVING_PRODUCT_LINK_INVALID',
            purchaseOrderItem: orderItem._id,
            message: compatibilityIssue
          });
        }
      }
    }

    let retryReport = existing;
    if (existing) {
      retryReport = await ProcurementReceivingReport.findOneAndUpdate({
        _id: existing._id,
        $or: [
          { processingStatus: 'failed' },
          { processingStatus: 'processing', updatedAt: { $lte: staleProcessingCutoff } }
        ]
      }, {
        $set: { processingStatus: 'processing', processingError: null }
      }, { new: true });
      if (!retryReport) {
        return res.status(409).json({ message: 'This inspection retry was already claimed by another request.' });
      }
    }

    const evidence = (req.files || []).map(file => evidenceFromUploadedFile(file, req.user._id));
    report = retryReport || new ProcurementReceivingReport({
      purchaseOrder: inspectedOrder._id,
      store: inspectedOrder.store,
      supplier: inspectedOrder.supplier,
      receivedBy: req.user._id
    });
    report.outcome = outcome;
    report.items = normalizedItems;
    report.evidence = [...(existing?.evidence || []), ...evidence];
    report.notes = req.body.notes;
    report.paymentReady = outcome === 'accepted';
    report.payableAmount = outcome === 'accepted' ? inspectedOrder.totalCost : 0;
    report.resolutionStatus = outcome === 'accepted' ? 'not_required' : 'pending_supplier_resolution';
    if (outcome !== 'accepted' && !(report.resolutionHistory || []).some(entry => entry.action === 'discrepancy_reported')) {
      report.resolutionHistory.push({
        status: 'pending_supplier_resolution',
        action: 'discrepancy_reported',
        actor: req.user._id,
        actorRole: req.user.role,
        notes: req.body.notes
      });
    }
    report.processingStatus = 'processing';
    report.processingError = undefined;
    if (retryReport) {
      report.$where = { processingStatus: 'processing', updatedAt: retryReport.updatedAt };
    }
    await report.save();
    receivingClaimTimestamp = report.updatedAt;

    let order;
    let supplier;
    await mongoose.connection.transaction(async session => {
      order = await PurchaseOrder.findOne({
        _id: inspectedOrder._id,
        status: { $in: ['delivered', 'issue_reported'] }
      }).populate('items.supplierProduct').session(session);
      if (!order) {
        throw Object.assign(new Error('This purchase order is no longer available for receiving.'), { statusCode: 409 });
      }
      report = await ProcurementReceivingReport.findOne({
        _id: report._id,
        purchaseOrder: order._id,
        store: order.store,
        processingStatus: 'processing',
        updatedAt: receivingClaimTimestamp
      }).session(session);
      if (!report) {
        throw Object.assign(new Error('This receiving inspection is no longer available for processing.'), { statusCode: 409 });
      }
      supplier = await Supplier.findById(order.supplier).session(session);

      for (const reportItem of report.items) {
        const orderItem = order.items.id(reportItem.purchaseOrderItem);
        if (!orderItem) throw Object.assign(new Error('Purchase order item no longer exists.'), { statusCode: 409 });
        await applyReceivingItem({
          order,
          orderItem,
          reportItem,
          supplier,
          userId: req.user._id,
          userRole: req.user.role,
          session
        });
        reportItem.processingError = undefined;
      }

      report.receivedAt = new Date();
      report.processingStatus = 'completed';
      report.processingError = undefined;
      order.receivingReport = report._id;
      order.inspectionStatus = outcome;
      if (outcome === 'accepted') {
        if (order.paymentStatus === 'paid') {
          order.status = 'completed';
          order.completedAt = new Date();
        } else {
          order.paymentStatus = 'awaiting_payment';
        }
      } else {
        order.status = 'issue_reported';
        if (order.paymentTiming === 'after_inspection') order.paymentStatus = 'awaiting_inspection';
      }
      order.statusHistory.push({
        status: outcome === 'accepted' ? 'inspection_completed' : 'issue_reported',
        changedBy: req.user._id,
        notes: req.body.notes || `Receiving inspection outcome: ${outcome}`,
        timestamp: new Date()
      });
      await report.save({ session });
      await order.save({ session });
    });
    receivingCommitted = true;

    await Promise.allSettled([
      supplier && createNotification({
        recipient: supplier.user,
        sender: req.user._id,
        type: 'purchase_order',
        title: outcome === 'accepted' ? 'Delivery Accepted' : 'Receiving Issue Reported',
        message: `Inspection for ${order.orderNumber}: ${outcome.replaceAll('_', ' ')}.`,
        relatedId: order._id,
        relatedModel: 'PurchaseOrder'
      }),
      SupplyChainLog.create({
        action: outcome === 'accepted' ? 'purchase_order_delivered' : 'system_alert',
        performedBy: req.user._id,
        userRole: req.user.role,
        relatedEntity: { type: 'PurchaseOrder', id: order._id },
        description: `Receiving inspection for ${order.orderNumber}: ${outcome}`,
        store: order.store,
        supplier: order.supplier,
        metadata: { receivingReport: report._id, outcome }
      })
    ].filter(Boolean));

    res.status(201).json({ message: 'Receiving inspection recorded.', order, receivingReport: sanitizeReceivingReport(report) });
  } catch (error) {
    if (report && receivingClaimTimestamp && !receivingCommitted) {
      await ProcurementReceivingReport.updateOne(
        { _id: report._id, processingStatus: 'processing', updatedAt: receivingClaimTimestamp },
        { $set: { processingStatus: 'failed', processingError: error.message } }
      ).catch(() => {});
    }
    console.error('Submit procurement inspection error:', error);
    const statusCode = error.code === 11000 ? 409 : (error.statusCode || (error.name === 'CastError' ? 400 : 500));
    res.status(statusCode).json({
      message: error.code === 11000 ? 'This receiving inspection is already being processed.' : (error.message || 'Unable to record the receiving inspection.')
    });
  }
};

const reviewSupplierResolution = async (req, res) => {
  let result;
  try {
    const accessibleOrder = await PurchaseOrder.findById(req.params.id).select('store');
    if (!accessibleOrder) return res.status(404).json({ message: 'Purchase order not found.' });
    if (!(await canOperateStore(req.user, accessibleOrder.store, ['procurement.manage', 'inventory.receive']))) {
      return res.status(403).json({ message: 'Purchase order belongs to another store.' });
    }
    const decision = req.body.decision;
    if (!['accept', 'reject'].includes(decision)) {
      return res.status(400).json({ message: 'Decision must be accept or reject.' });
    }

    await mongoose.connection.transaction(async session => {
      const order = await PurchaseOrder.findOne({
        _id: req.params.id,
        store: accessibleOrder.store,
        isDeleted: false
      }).session(session);
      if (!order) throw Object.assign(new Error('Purchase order not found.'), { statusCode: 404 });
      const report = await ProcurementReceivingReport.findOne({
        purchaseOrder: order._id,
        store: order.store,
        supplier: order.supplier
      }).session(session);
      const submission = report?.resolutionSubmissions?.id(req.params.resolutionId);
      if (!submission) throw Object.assign(new Error('Supplier resolution not found.'), { statusCode: 404 });
      if (submission.status !== 'submitted' || report.resolutionStatus !== 'resolution_submitted') {
        throw Object.assign(new Error('This supplier resolution has already been decided or is no longer current.'), { statusCode: 409 });
      }

      submission.decisionBy = req.user._id;
      submission.decisionAt = new Date();
      submission.decisionNotes = req.body.notes;

      if (decision === 'reject') {
        submission.status = 'rejected';
        report.resolutionStatus = 'resolution_rejected';
        order.status = 'resolution_rejected';
      } else {
        report.resolutionHistory.push({
          status: 'resolution_accepted',
          action: 'store_resolution_accepted',
          actor: req.user._id,
          actorRole: req.user.role,
          resolutionSubmission: submission._id,
          notes: req.body.notes
        });
        order.statusHistory.push({
          status: 'resolution_accepted',
          changedBy: req.user._id,
          notes: req.body.notes || 'Store accepted supplier resolution.'
        });
      }
      if (decision === 'accept' && submission.type === 'refund_credit') {
        submission.status = 'accepted';
        submission.financialAdjustment.status = 'pending_finance_review';
        report.resolutionStatus = 'resolution_accepted';
        order.status = 'resolution_accepted';
      } else if (decision === 'accept') {
        submission.status = 'awaiting_replacement';
        report.resolutionStatus = 'awaiting_replacement';
        order.status = 'awaiting_replacement';
      }
      if (decision === 'reject' || report.resolutionStatus !== 'resolution_accepted') {
        report.resolutionHistory.push({
          status: report.resolutionStatus,
          action: decision === 'accept' ? 'resolution_workflow_started' : 'store_resolution_rejected',
          actor: req.user._id,
          actorRole: req.user.role,
          resolutionSubmission: submission._id,
          notes: req.body.notes
        });
      }
      if (decision === 'reject' || order.status !== 'resolution_accepted') {
        order.statusHistory.push({
          status: order.status,
          changedBy: req.user._id,
          notes: req.body.notes || `Store ${decision}ed supplier resolution.`
        });
      }
      await Promise.all([report.save({ session }), order.save({ session })]);
      result = { order, report, submission };
    });

    const supplier = await Supplier.findById(result.order.supplier).select('user');
    await Promise.allSettled([
      supplier && createNotification({
        recipient: supplier.user,
        sender: req.user._id,
        type: 'purchase_order',
        title: decision === 'accept' ? 'Resolution Accepted' : 'Resolution Rejected',
        message: decision === 'accept'
          ? `The Store accepted your resolution for ${result.order.orderNumber}.`
          : `The Store rejected your resolution for ${result.order.orderNumber}. You may submit a revised resolution.`,
        relatedId: result.order._id,
        relatedModel: 'PurchaseOrder'
      }),
      SupplyChainLog.create({
        action: decision === 'accept' ? 'purchase_order_resolution_accepted' : 'purchase_order_resolution_rejected',
        performedBy: req.user._id,
        userRole: req.user.role,
        relatedEntity: { type: 'PurchaseOrder', id: result.order._id },
        description: `Store ${decision}ed supplier resolution for ${result.order.orderNumber}.`,
        store: result.order.store,
        supplier: result.order.supplier,
        metadata: { receivingReport: result.report._id, resolutionSubmission: result.submission._id }
      })
    ].filter(Boolean));
    res.json({ order: result.order, receivingReport: sanitizeReceivingReport(result.report) });
  } catch (error) {
    console.error('Review supplier resolution error:', error);
    res.status(error.statusCode || (error.name === 'CastError' ? 400 : 500)).json({
      message: error.name === 'CastError' ? 'Invalid resolution.' : (error.message || 'Unable to review the supplier resolution.')
    });
  }
};

const authorizeResolutionReinspectionUpload = async (req, res, next) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id).select('store status receivingReport');
    if (!order) return res.status(404).json({ message: 'Purchase order not found.' });
    if (!(await canOperateStore(req.user, order.store, ['procurement.manage', 'inventory.receive']))) {
      return res.status(403).json({ message: 'Purchase order belongs to another store.' });
    }
    const report = await ProcurementReceivingReport.findOne({ purchaseOrder: order._id })
      .select('resolutionStatus resolutionSubmissions updatedAt');
    const submission = report?.resolutionSubmissions?.id(req.params.resolutionId);
    const reinspectionAvailable = report?.resolutionStatus === 'reinspection'
      || (report?.resolutionStatus === 'reinspection_processing'
        && report.updatedAt <= getReceivingProcessingCutoff());
    if (!submission || submission.status !== 'replacement_delivered' || !reinspectionAvailable) {
      return res.status(409).json({ message: 'The supplier must report the accepted replacement/correction as delivered before reinspection.' });
    }
    req.receivingInspectionOrderId = order._id;
    return next();
  } catch (error) {
    return res.status(error.name === 'CastError' ? 400 : 500).json({
      message: error.name === 'CastError' ? 'Invalid resolution.' : 'Unable to authorize reinspection evidence.'
    });
  }
};

const submitResolutionReinspection = async (req, res) => {
  let report;
  let attempt;
  let reinspectionCommitted = false;
  let reinspectionClaimTimestamp;
  try {
    const order = await PurchaseOrder.findById(req.params.id).populate('items.supplierProduct');
    if (!order) return res.status(404).json({ message: 'Purchase order not found.' });
    if (!(await canOperateStore(req.user, order.store, ['procurement.manage', 'inventory.receive']))) {
      return res.status(403).json({ message: 'Purchase order belongs to another store.' });
    }
    report = await ProcurementReceivingReport.findOne({ purchaseOrder: order._id, store: order.store });
    const submission = report?.resolutionSubmissions?.id(req.params.resolutionId);
    if (!submission || !['replacement', 'return_correction'].includes(submission.type)
        || submission.status !== 'replacement_delivered') {
      return res.status(409).json({ message: 'This resolution is not ready for Store reinspection.' });
    }
    if (submission.items.some(row => order.items.id(row.purchaseOrderItem)?.itemType === 'live_pet')) {
      return res.status(409).json({ message: 'Live-pet procurement cannot use quantity-based replacement reinspection.' });
    }
    const submittedRows = parseInspectionItems(req.body.items);
    const expectedIds = new Set(submission.items.map(row => String(row.purchaseOrderItem)));
    const submittedIds = submittedRows.map(row => String(row.purchaseOrderItem || row.itemId || ''));
    if (submittedRows.length !== expectedIds.size
        || new Set(submittedIds).size !== submittedIds.length
        || submittedIds.some(id => !expectedIds.has(id))) {
      return res.status(400).json({ message: 'Reinspection quantities must be supplied exactly once for every line in the accepted resolution.' });
    }
    const submittedById = new Map(submittedRows.map(row => [String(row.purchaseOrderItem || row.itemId), row]));
    const proposalById = new Map(submission.items.map(row => [String(row.purchaseOrderItem), row]));
    const normalizedItems = [...expectedIds].map(id => {
      const orderItem = order.items.id(id);
      const proposal = proposalById.get(id);
      const normalized = normalizeInspectionItem({
        orderItem: {
          _id: orderItem._id,
          itemType: orderItem.itemType,
          quantity: proposal.proposedQuantity
        },
        submitted: submittedById.get(id)
      });
      return {
        ...normalized,
        receivedQuantityTarget: Number(orderItem.receivedQuantity || 0) + Number(normalized.acceptedQuantity || 0)
      };
    });
    const outcome = determineInspectionOutcome(normalizedItems);
    if (req.body.outcome && req.body.outcome !== outcome) {
      return res.status(400).json({ message: `Reinspection quantities require the outcome "${outcome}".` });
    }

    const staleProcessingCutoff = getReceivingProcessingCutoff();
    const claimed = await ProcurementReceivingReport.findOneAndUpdate({
      _id: report._id,
      $or: [
        { resolutionStatus: 'reinspection' },
        { resolutionStatus: 'reinspection_processing', updatedAt: { $lte: staleProcessingCutoff } }
      ],
      'resolutionSubmissions._id': submission._id,
      'resolutionSubmissions.status': 'replacement_delivered'
    }, {
      $set: { resolutionStatus: 'reinspection_processing', updatedAt: new Date() }
    }, { new: true });
    if (!claimed) return res.status(409).json({ message: 'This reinspection is already being processed.' });
    report = claimed;
    reinspectionClaimTimestamp = claimed.updatedAt;
    const claimedSubmission = report.resolutionSubmissions.id(submission._id);
    const previousRetryable = [...report.reinspections].reverse().find(row =>
      String(row.resolutionSubmission) === String(submission._id)
        && ['processing', 'failed'].includes(row.processingStatus));
    if (previousRetryable) {
      const priorSignature = previousRetryable.items.map(row => [
        String(row.purchaseOrderItem), Number(row.receivedQuantity), Number(row.damagedQuantity), Number(row.incorrectQuantity)
      ]);
      const nextSignature = normalizedItems.map(row => [
        String(row.purchaseOrderItem), Number(row.receivedQuantity), Number(row.damagedQuantity), Number(row.incorrectQuantity)
      ]);
      if (JSON.stringify(priorSignature) !== JSON.stringify(nextSignature)) {
        previousRetryable.processingStatus = 'failed';
        previousRetryable.processingError = 'A retry attempted to change the claimed reinspection quantities.';
        report.resolutionStatus = 'reinspection';
        await report.save();
        return res.status(409).json({ message: 'A failed reinspection retry must use the same quantities. Submit a new supplier resolution for changed quantities.' });
      }
      attempt = previousRetryable;
      attempt.processingStatus = 'processing';
      attempt.processingError = undefined;
      for (const item of attempt.items) item.processingError = undefined;
    } else {
      report.reinspections.push({
        resolutionSubmission: claimedSubmission._id,
        inspectedBy: req.user._id,
        items: normalizedItems,
        notes: req.body.notes,
        outcome,
        processingStatus: 'processing'
      });
      attempt = report.reinspections[report.reinspections.length - 1];
    }
    const evidence = (req.files || []).map(file => evidenceFromUploadedFile(file, req.user._id));
    if (evidence.length) attempt.evidence.push(...evidence);
    report.$where = { resolutionStatus: 'reinspection_processing', updatedAt: claimed.updatedAt };
    await report.save();
    reinspectionClaimTimestamp = report.updatedAt;

    const attemptId = attempt._id;
    const submissionId = claimedSubmission._id;
    let committedOrder;
    let supplier;
    let unresolved;
    await mongoose.connection.transaction(async session => {
      committedOrder = await PurchaseOrder.findById(order._id)
        .populate('items.supplierProduct')
        .session(session);
      if (!committedOrder) {
        throw Object.assign(new Error('Purchase order not found during reinspection.'), { statusCode: 409 });
      }
      report = await ProcurementReceivingReport.findOne({
        _id: report._id,
        purchaseOrder: committedOrder._id,
        store: committedOrder.store,
        resolutionStatus: 'reinspection_processing',
        updatedAt: reinspectionClaimTimestamp,
        'resolutionSubmissions._id': submissionId,
        'resolutionSubmissions.status': 'replacement_delivered'
      }).session(session);
      if (!report) {
        throw Object.assign(new Error('This reinspection claim is no longer active.'), { statusCode: 409 });
      }
      const transactionSubmission = report.resolutionSubmissions.id(submissionId);
      const transactionAttempt = report.reinspections.id(attemptId);
      if (!transactionAttempt || transactionAttempt.processingStatus !== 'processing') {
        throw Object.assign(new Error('This reinspection attempt is no longer available for processing.'), { statusCode: 409 });
      }
      supplier = await Supplier.findById(committedOrder.supplier).session(session);

      for (const reportItem of transactionAttempt.items) {
        const orderItem = committedOrder.items.id(reportItem.purchaseOrderItem);
        if (!orderItem) throw Object.assign(new Error('Purchase order item no longer exists.'), { statusCode: 409 });
        await applyReceivingItem({
          order: committedOrder,
          orderItem,
          reportItem,
          supplier,
          userId: req.user._id,
          userRole: req.user.role,
          session,
          receivedQuantityTarget: reportItem.receivedQuantityTarget,
          idempotencyKey: `po-resolution-receipt:${committedOrder._id}:${transactionSubmission._id}:${orderItem._id}`
        });
        reportItem.processingError = undefined;
      }

      transactionAttempt.inspectedAt = new Date();
      transactionAttempt.processingStatus = 'completed';
      transactionAttempt.processingError = undefined;
      transactionSubmission.status = 'resolved';
      report.resolutionStatus = 'resolved';
      unresolved = hasUnresolvedQuantities(report);
      if (unresolved) {
        report.resolutionStatus = 'pending_supplier_resolution';
        report.paymentReady = false;
        report.payableAmount = 0;
        committedOrder.status = 'issue_reported';
        committedOrder.inspectionStatus = 'issue_reported';
        if (committedOrder.paymentTiming === 'after_inspection'
            && !['paid', 'settled'].includes(committedOrder.paymentStatus)) {
          committedOrder.paymentStatus = 'awaiting_inspection';
        }
      } else {
        report.resolutionStatus = 'resolved';
        report.paymentReady = true;
        report.payableAmount = Math.max(
          0,
          Number(committedOrder.totalCost) - Number(committedOrder.approvedAdjustmentTotal || 0)
        );
        committedOrder.inspectionStatus = 'resolved';
        if (['paid', 'settled'].includes(committedOrder.paymentStatus)) {
          committedOrder.status = 'completed';
          committedOrder.completedAt = new Date();
        } else {
          committedOrder.status = 'resolved';
          if (committedOrder.paymentTiming === 'after_inspection') committedOrder.paymentStatus = 'awaiting_payment';
        }
      }
      report.resolutionHistory.push({
        status: report.resolutionStatus,
        action: unresolved ? 'reinspection_issue_reported' : 'discrepancy_resolved',
        actor: req.user._id,
        actorRole: req.user.role,
        resolutionSubmission: transactionSubmission._id,
        notes: req.body.notes
      });
      committedOrder.statusHistory.push({
        status: committedOrder.status,
        changedBy: req.user._id,
        notes: unresolved ? 'Reinspection completed with unresolved quantities.' : 'Reinspection resolved the delivery discrepancy.'
      });
      await report.save({ session });
      await committedOrder.save({ session });
    });
    reinspectionCommitted = true;
    await Promise.allSettled([
      supplier && createNotification({
        recipient: supplier.user,
        sender: req.user._id,
        type: 'purchase_order',
        title: unresolved ? 'Reinspection Still Has Issues' : 'Delivery Discrepancy Resolved',
        message: unresolved
          ? `Reinspection for ${committedOrder.orderNumber} still has unresolved quantities.`
          : `The Store accepted the resolution delivery for ${committedOrder.orderNumber}.`,
        relatedId: committedOrder._id,
        relatedModel: 'PurchaseOrder'
      }),
      SupplyChainLog.create({
        action: unresolved ? 'purchase_order_reinspection_issue' : 'purchase_order_discrepancy_resolved',
        performedBy: req.user._id,
        userRole: req.user.role,
        relatedEntity: { type: 'PurchaseOrder', id: committedOrder._id },
        description: `Resolution reinspection for ${committedOrder.orderNumber}: ${unresolved ? 'unresolved' : 'resolved'}.`,
        store: committedOrder.store,
        supplier: committedOrder.supplier,
        metadata: { receivingReport: report._id, resolutionSubmission: submissionId, reinspection: attemptId }
      })
    ].filter(Boolean));
    res.status(201).json({
      message: 'Resolution reinspection recorded.',
      order: committedOrder,
      receivingReport: sanitizeReceivingReport(report)
    });
  } catch (error) {
    if (report && attempt && reinspectionClaimTimestamp && !reinspectionCommitted) {
      const failedReport = await ProcurementReceivingReport.findOne({
        _id: report._id,
        resolutionStatus: 'reinspection_processing',
        updatedAt: reinspectionClaimTimestamp
      }).catch(() => null);
      const failedAttempt = failedReport?.reinspections?.id(attempt._id);
      if (failedAttempt?.processingStatus === 'processing') {
        failedAttempt.processingStatus = 'failed';
        failedAttempt.processingError = error.message;
        failedReport.resolutionStatus = 'reinspection';
        await failedReport.save().catch(() => {});
      }
    }
    console.error('Submit resolution reinspection error:', error);
    res.status(error.statusCode || (error.name === 'CastError' ? 400 : 500)).json({
      message: error.message || 'Unable to record the resolution reinspection.'
    });
  }
};

const getReceivingInspection = async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id).select('store supplier seller');
    if (!order) return res.status(404).json({ message: 'Purchase order not found.' });
    if (!(await userCanAccessPurchaseOrder(req.user, order, ['procurement.view', 'procurement.manage', 'inventory.receive']))) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    const report = await ProcurementReceivingReport.findOne({ purchaseOrder: order._id })
      .populate('receivedBy', 'firstName lastName')
      .populate('resolutionSubmissions.submittedBy resolutionSubmissions.decisionBy resolutionSubmissions.replacementDeliveredBy', 'firstName lastName')
      .populate('resolutionSubmissions.financialAdjustment.reviewedBy', 'firstName lastName')
      .populate('reinspections.inspectedBy resolutionHistory.actor', 'firstName lastName')
      .populate('supplier', 'businessName')
      .lean();
    if (!report) return res.status(404).json({ message: 'Receiving inspection not found.' });
    res.json(sanitizeReceivingReport(report));
  } catch (error) {
    res.status(error.name === 'CastError' ? 400 : 500).json({ message: error.name === 'CastError' ? 'Invalid purchase order.' : 'Unable to load the receiving inspection.' });
  }
};

const getReceivingEvidenceAccess = async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id).select('store supplier seller');
    if (!order) return res.status(404).json({ message: 'Purchase order not found.' });
    if (!(await userCanAccessPurchaseOrder(req.user, order, ['procurement.view', 'procurement.manage', 'inventory.receive', 'purchase_orders.own']))) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    const report = await ProcurementReceivingReport.findOne({
      purchaseOrder: order._id,
      store: order.store,
      supplier: order.supplier
    });
    if (!report) return res.status(404).json({ message: 'Receiving inspection not found.' });
    const evidence = findEvidenceById(report, req.params.evidenceId);
    if (!evidence) return res.status(404).json({ message: 'Receiving evidence not found.' });

    const access = createTemporaryEvidenceUrl({ cloudinary, evidence });
    res.set('Cache-Control', 'no-store, private');
    res.set('Pragma', 'no-cache');
    return res.json({
      ...access,
      evidenceId: evidence._id,
      originalName: evidence.originalName
    });
  } catch (error) {
    console.error('Get receiving evidence access error:', error);
    return res.status(error.statusCode || (error.name === 'CastError' ? 400 : 500)).json({
      message: error.name === 'CastError' ? 'Invalid receiving evidence request.' : (error.message || 'Unable to authorize receiving evidence.')
    });
  }
};

// ═══════════════════════════════════════════════════════════════
// ADMIN - All Orders
// ═══════════════════════════════════════════════════════════════

const adminGetAllOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let filter = { isDeleted: false };
    if (status) filter.status = status;

    const skip = (page - 1) * limit;
    const orders = await PurchaseOrder.find(filter)
      .populate('seller', 'firstName lastName')
      .populate('supplier', 'businessName')
      .populate('store', 'name')
      .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await PurchaseOrder.countDocuments(filter);

    res.json({ orders, pagination: { page: parseInt(page), totalPages: Math.ceil(total / limit), total } });
  } catch (error) {
    console.error('Admin get all orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getProcurementStoreProducts,
  getComparableSupplierOffers,
  confirmSupplierOfferMatch,
  getProcurementCart,
  addProcurementCartItem,
  updateProcurementCartItem,
  removeProcurementCartItem,
  clearProcurementCart,
  submitProcurementCart,
  createPurchaseOrder,
  getSellerOrders,
  getOrderById,
  cancelOrder,
  confirmDelivery: submitReceivingInspection,
  getReceivingProductLinks,
  linkReceivingStoreProduct,
  createReceivingStoreProduct,
  authorizeReceivingInspectionUpload,
  authorizeResolutionReinspectionUpload,
  submitReceivingInspection,
  reviewSupplierResolution,
  submitResolutionReinspection,
  getReceivingInspection,
  getReceivingEvidenceAccess,
  adminGetAllOrders
};
