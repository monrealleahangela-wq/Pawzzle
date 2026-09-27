const crypto = require('crypto');
const mongoose = require('mongoose');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProcurementCart = require('../models/ProcurementCart');
const { isPlatformAdmin } = require('../config/permissions');
const { canOperateStore } = require('../utils/authorizationPolicy');
const Supplier = require('../models/Supplier');
const SupplierProduct = require('../models/SupplierProduct');
const Store = require('../models/Store');
const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const InventoryLot = require('../models/InventoryLot');
const SupplyChainLog = require('../models/SupplyChainLog');
const InventoryLedgerService = require('../services/inventoryLedgerService');
const { createNotification } = require('./notificationController');
const { isSupplierSelectableForStore } = require('../utils/supplierLifecycle');
const { validateProcurementQuantity, groupProcurementItemsBySupplier } = require('../utils/procurementCart');

const resolveUserStore = async user => {
  if (user.store) return user.store._id || user.store;
  const ownedStore = await Store.findOne({ owner: user._id, isDeleted: { $ne: true } }).select('_id');
  return ownedStore?._id || null;
};

const populateProcurementCart = cart => cart.populate([
  {
    path: 'items.supplierProduct',
    select: 'supplier name sku category images wholesalePrice availableStock minimumOrderQuantity unitOfMeasure deliveryLeadTimeDays isActive isDeleted'
  },
  { path: 'items.supplier', select: 'businessName supplierType status isActive isDeleted storeAssociations' },
  { path: 'items.storeProduct', select: 'name sku stockQuantity store isDeleted' }
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
      storeProduct: item.storeProduct || null,
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
    const supplier = await Supplier.findById(product.supplier);
    if (!isSupplierSelectableForStore(supplier, store)) {
      return res.status(403).json({ message: 'This supplier is not eligible for your store.' });
    }
    const requested = req.body.quantity === undefined
      ? Number(product.minimumOrderQuantity)
      : Number(req.body.quantity);
    const requestedQuantity = validateProcurementQuantity({
      quantity: requested,
      minimumOrderQuantity: product.minimumOrderQuantity,
      availableStock: product.availableStock
    });
    if (!requestedQuantity.valid) {
      if (requestedQuantity.reason === 'insufficient_stock') {
        return res.status(409).json({ message: `Only ${product.availableStock} ${product.unitOfMeasure}(s) of "${product.name}" are available.` });
      }
      return res.status(400).json({ message: `Minimum order for "${product.name}" is ${product.minimumOrderQuantity} ${product.unitOfMeasure}(s).` });
    }
    const cart = await getOrCreateProcurementCart(req.user._id, store);
    const existing = cart.items.find(item => String(item.supplierProduct) === String(product._id));
    const nextQuantity = existing ? existing.quantity + requested : requested;
    if (nextQuantity > product.availableStock) {
      return res.status(409).json({ message: `Only ${product.availableStock} ${product.unitOfMeasure}(s) of "${product.name}" are available.` });
    }
    if (existing) {
      existing.quantity = nextQuantity;
      existing.supplier = product.supplier;
      existing.addedUnitPrice = product.wholesalePrice;
      existing.updatedAt = new Date();
    } else {
      cart.items.push({
        supplierProduct: product._id,
        supplier: product.supplier,
        quantity: requested,
        addedUnitPrice: product.wholesalePrice
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
        availableStock: product.availableStock
      });
      if (!quantityValidation.valid) {
        if (quantityValidation.reason === 'insufficient_stock') {
          return res.status(409).json({ message: `Only ${product.availableStock} ${product.unitOfMeasure}(s) are available.` });
        }
        return res.status(400).json({ message: `Minimum order for "${product.name}" is ${product.minimumOrderQuantity} ${product.unitOfMeasure}(s).` });
      }
      item.quantity = quantity;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'storeProductId')) {
      if (req.body.storeProductId) {
        const storeProduct = await Product.exists({ _id: req.body.storeProductId, store, isDeleted: { $ne: true } });
        if (!storeProduct) return res.status(400).json({ message: 'The selected inventory product does not belong to this store.' });
        item.storeProduct = req.body.storeProductId;
      } else {
        item.storeProduct = null;
      }
    }
    if (req.body.acceptCurrentPrice === true) item.addedUnitPrice = product.wholesalePrice;
    item.supplier = product.supplier;
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
      const mappedProductSet = new Set(mappedProducts.map(product => String(product._id)));
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
        const supplier = supplierMap.get(String(product.supplier));
        if (!isSupplierSelectableForStore(supplier, store)) {
          issues.push({ supplierProductId: product._id, message: `Supplier for "${product.name}" is no longer eligible for this store.` });
          continue;
        }
        const quantity = Number(item.quantity);
        const quantityValidation = validateProcurementQuantity({
          quantity,
          minimumOrderQuantity: product.minimumOrderQuantity,
          availableStock: product.availableStock
        });
        if (!quantityValidation.valid) {
          issues.push({ supplierProductId: product._id, message: `Quantity for "${product.name}" must be ${product.minimumOrderQuantity}-${product.availableStock}.` });
          continue;
        }
        if (item.storeProduct && !mappedProductSet.has(String(item.storeProduct))) {
          issues.push({ supplierProductId: product._id, message: `Inventory mapping for "${product.name}" does not belong to this store.` });
          continue;
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
        resolvedCartItems.push({
          supplier,
          orderItem: {
            supplierProduct: product._id,
            storeProduct: item.storeProduct || null,
            productName: product.name,
            sku: product.sku,
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

      const groups = groupProcurementItemsBySupplier(resolvedCartItems);
      const batchId = crypto.randomBytes(5).toString('hex').toUpperCase();
      let sequence = 0;
      for (const { supplier, items } of groups.values()) {
        sequence += 1;
        const subtotal = items.reduce((total, item) => total + item.totalPrice, 0);
        const order = new PurchaseOrder({
          orderNumber: `PO-${Date.now()}-${batchId}-${String(sequence).padStart(2, '0')}`,
          seller: req.user._id,
          store,
          supplier: supplier._id,
          items,
          subtotal,
          shippingCost: 0,
          tax: 0,
          totalCost: subtotal,
          shippingAddress: req.body.shippingAddress || {},
          sellerNotes: req.body.sellerNotes,
          paymentMethod: req.body.paymentMethod || 'bank_transfer',
          status: 'submitted',
          statusHistory: [{ status: 'submitted', changedBy: req.user._id, notes: 'Created from procurement cart', timestamp: new Date() }]
        });
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
    console.error('Submit procurement cart error:', error);
    if (committed && !res.headersSent) {
      return res.status(201).json({
        message: `${createdOrders.length} supplier-specific purchase order${createdOrders.length === 1 ? '' : 's'} submitted. A non-critical response step could not be completed.`,
        orders: createdOrders.map(entry => entry.order),
        supplierCount: createdOrders.length
      });
    }
    if (res.headersSent) return undefined;
    res.status(500).json({ message: 'No purchase orders were created. Your procurement cart was preserved.' });
  }
};

const createPurchaseOrder = async (req, res) => {
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

      if (!Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0) return res.status(400).json({ message: `Quantity for "${product.name}" must be a positive whole number.` });
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
        storeProduct: item.storeProductId || null,
        productName: product.name,
        sku: product.sku,
        quantity: item.quantity,
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
      shippingCost: req.body.shippingCost || 0,
      tax: req.body.tax || 0,
      totalCost: subtotal + (req.body.shippingCost || 0) + (req.body.tax || 0),
      shippingAddress: shippingAddress || {},
      sellerNotes,
      paymentMethod: paymentMethod || 'bank_transfer',
      status: 'submitted'
    });

    order.statusHistory.push({
      status: 'submitted',
      changedBy: req.user._id,
      notes: 'Purchase order submitted',
      timestamp: new Date()
    });

    await order.save();

    // Update supplier total orders
    supplier.performance.totalOrders += 1;
    await supplier.save();

    // Notify supplier
    await createNotification({
      recipient: supplier.user,
      sender: req.user._id,
      type: 'purchase_order',
      title: 'New Purchase Order',
      message: `New purchase order ${order.orderNumber} received. Total: ₱${order.totalCost.toLocaleString()}.`,
      relatedId: order._id,
      relatedModel: 'PurchaseOrder'
    });

    await SupplyChainLog.create({
      action: 'purchase_order_created',
      performedBy: req.user._id,
      userRole: req.user.role,
      relatedEntity: { type: 'PurchaseOrder', id: order._id },
      description: `PO ${order.orderNumber} created for supplier "${supplier.businessName}" (₱${order.totalCost})`,
      store, supplier: supplierId
    });

    await order.populate([
      { path: 'supplier', select: 'businessName' },
      { path: 'items.supplierProduct', select: 'name sku images' }
    ]);

    res.status(201).json(order);
  } catch (error) {
    console.error('Create purchase order error:', error);
    res.status(500).json({ message: 'Server error' });
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
      .populate('items.supplierProduct', 'name sku images')
      .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await PurchaseOrder.countDocuments(filter);

    res.json({ orders, pagination: { page: parseInt(page), totalPages: Math.ceil(total / limit), total } });
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
      .populate('items.supplierProduct', 'name sku images wholesalePrice')
      .populate('statusHistory.changedBy', 'firstName lastName');

    if (!order) return res.status(404).json({ message: 'Order not found.' });

    // Verify access: seller, supplier, or admin
    const supplier = await Supplier.findById(order.supplier);
    const isParty = order.seller.toString() === req.user._id.toString() ||
      (supplier && supplier.user.toString() === req.user._id.toString()) ||
      isPlatformAdmin(req.user) ||
      await canOperateStore(req.user, order.store?._id || order.store, ['procurement.view', 'procurement.manage', 'purchase_orders.own']);

    if (!isParty) return res.status(403).json({ message: 'Access denied.' });

    res.json(order);
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Cancel order (by seller, only if not yet shipped)
const cancelOrder = async (req, res) => {
  try {
    const store = await resolveUserStore(req.user);
    const order = await PurchaseOrder.findOne({ _id: req.params.id, store });
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    if (['shipped', 'delivered', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ message: `Cannot cancel order in "${order.status}" status.` });
    }

    order.status = 'cancelled';
    order.cancellationReason = req.body.reason || 'Cancelled by seller';
    order.statusHistory.push({
      status: 'cancelled', changedBy: req.user._id,
      notes: order.cancellationReason, timestamp: new Date()
    });

    await order.save();

    // Notify supplier
    const supplier = await Supplier.findById(order.supplier);
    if (supplier) {
      await createNotification({
        recipient: supplier.user,
        sender: req.user._id,
        type: 'purchase_order',
        title: 'Purchase Order Cancelled',
        message: `Purchase order ${order.orderNumber} has been cancelled.`,
        relatedId: order._id,
        relatedModel: 'PurchaseOrder'
      });
    }

    res.json(order);
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Confirm delivery received & update inventory
const confirmDelivery = async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id)
      .populate('items.supplierProduct');
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    const orderStore = await Store.findById(order.store).select('owner');
    const isSeller = order.seller.toString() === req.user._id.toString();
    const isStoreMember = req.user.store && order.store.toString() === req.user.store.toString();
    const isStoreOwner = orderStore?.owner?.toString() === req.user._id.toString();
    const isPlatformAdmin = ['super_admin', 'platform_admin'].includes(req.user.role);
    if (!isSeller && !isStoreMember && !isStoreOwner && !isPlatformAdmin) {
      return res.status(403).json({ message: 'Purchase order belongs to another store.' });
    }
      if (order.status !== 'delivered') {
        return res.status(400).json({ message: 'Order must be in "delivered" status.' });
      }
      if (order.statusHistory?.some(entry => entry.status === 'delivery_confirmed')) {
        return res.status(409).json({ message: 'This delivery has already been confirmed.' });
      }

    const supplier = await Supplier.findById(order.supplier);
    const updatedProducts = [];
    const updatedInventory = [];

    // Process each delivered item
    for (const item of order.items) {
      const suppliedQuantity = req.body.receivedQuantities?.[item._id.toString()];
      const received = suppliedQuantity === undefined ? item.quantity : Number(suppliedQuantity);
      if (!Number.isInteger(received) || received < 0 || received > item.quantity) {
        return res.status(400).json({ message: `Received quantity for "${item.productName}" must be a whole number from 0 to ${item.quantity}.` });
      }
      item.receivedQuantity = received;

      if (received <= 0) continue;

      // ─── 1. Update the linked store Product ───────────────
      let storeProduct = null;
      if (item.storeProduct) {
        storeProduct = await Product.findById(item.storeProduct);
      }

      // Try matching by SKU if no direct link
      if (!storeProduct && item.sku) {
        storeProduct = await Product.findOne({ store: order.store, sku: item.sku, isDeleted: { $ne: true } });
      }

      if (storeProduct) {
        const prevQty = storeProduct.stockQuantity;
        storeProduct.stockQuantity += received;
        storeProduct.stockStatus = storeProduct.stockQuantity > 0 ? 'in_stock' : 'out_of_stock';

        // Link supplier traceability if not already set
        if (!storeProduct.supplierRef && supplier) {
          storeProduct.supplierRef = supplier._id;
        }
        if (!storeProduct.supplierProductRef && item.supplierProduct) {
          storeProduct.supplierProductRef = item.supplierProduct._id;
        }

        await storeProduct.save();
        updatedProducts.push({
          name: storeProduct.name,
          sku: storeProduct.sku,
          prev: prevQty,
          added: received,
          now: storeProduct.stockQuantity
        });

        // ─── 2. Update or create Inventory record ─────────
        let invRecord = await Inventory.findOne({ store: order.store, product: storeProduct._id });

        if (invRecord) {
          invRecord.quantity += received;
          invRecord.lastRestocked = new Date();
          invRecord.costPrice = item.unitPrice;
          invRecord.supplierRef = supplier?._id;
          invRecord.supplierProductRef = item.supplierProduct?._id;
          invRecord.lastPurchaseOrderRef = order._id;
          if (supplier) {
            invRecord.supplier = {
              name: supplier.businessName,
              contact: supplier.contactPerson,
              email: supplier.email,
              phone: supplier.phone
            };
          }
          await invRecord.save();
        } else {
          invRecord = await Inventory.create({
            store: order.store,
            product: storeProduct._id,
            quantity: received,
            costPrice: item.unitPrice,
            lastRestocked: new Date(),
            supplierRef: supplier?._id,
            supplierProductRef: item.supplierProduct?._id,
            lastPurchaseOrderRef: order._id,
            supplier: supplier ? {
              name: supplier.businessName,
              contact: supplier.contactPerson,
              email: supplier.email,
              phone: supplier.phone
            } : {}
          });
        }

          updatedInventory.push(invRecord._id);

          // Record the physical batch and immutable receipt movement. Existing
          // pre-lot stock is represented once as an opening lot so the ledger
          // remains equal to the legacy Product/Inventory balance.
          const existingLotCount = await InventoryLot.countDocuments({
            store: order.store, product: storeProduct._id
          });
          if (existingLotCount === 0 && prevQty > 0) {
            await InventoryLedgerService.receiveLot({
              store: order.store,
              product: storeProduct._id,
              lotNumber: `LEGACY-OPENING-${storeProduct.sku || storeProduct._id}`,
              quantity: prevQty,
              unitCost: invRecord.costPrice || item.unitPrice,
              performedBy: req.user._id,
              idempotencyKey: `legacy-opening:${order.store}:${storeProduct._id}`
            });
          }

          const lotDetails = req.body.lotDetails?.[item._id.toString()] || {};
          await InventoryLedgerService.receiveLot({
            store: order.store,
            product: storeProduct._id,
            lotNumber: lotDetails.lotNumber || `PO-${order.orderNumber}-${item._id}`,
            quantity: received,
            unitCost: item.unitPrice,
            expiresAt: lotDetails.expiresAt || item.supplierProduct?.expirationDate,
            manufacturer: lotDetails.manufacturer,
            supplier: supplier?._id,
            purchaseOrder: order._id,
            purchaseOrderItem: item._id,
            isVaccine: Boolean(lotDetails.isVaccine),
            vaccineType: lotDetails.vaccineType,
            storageNotes: lotDetails.storageNotes,
            performedBy: req.user._id,
            idempotencyKey: `po-receipt:${order._id}:${item._id}`
          });

        // ─── 3. Log each stock update ─────────────────────
        await SupplyChainLog.create({
          action: 'stock_added',
          performedBy: req.user._id,
          userRole: req.user.role,
          relatedEntity: { type: 'Product', id: storeProduct._id },
          description: `"${storeProduct.name}" restocked: +${received} (${prevQty} → ${storeProduct.stockQuantity}) from PO ${order.orderNumber}`,
          store: order.store,
          supplier: supplier?._id,
          previousValue: { stock: prevQty },
          newValue: { stock: storeProduct.stockQuantity }
        });

        // ─── 4. Send low-stock notification if needed ─────
        if (invRecord.needsReorder && invRecord.needsReorder()) {
          await createNotification({
            recipient: order.seller,
            type: 'restock_alert',
            title: 'Stock Still Low',
            message: `"${storeProduct.name}" is at ${storeProduct.stockQuantity} units (reorder level: ${invRecord.reorderLevel}). Consider ordering more.`,
            relatedId: storeProduct._id,
            relatedModel: 'Inventory'
          });
        }
      } else {
        // No matching store product — log for manual resolution
        await SupplyChainLog.create({
          action: 'stock_added',
          performedBy: req.user._id,
          userRole: req.user.role,
          relatedEntity: { type: 'PurchaseOrder', id: order._id },
          description: `Received ${received}x "${item.productName}" (SKU: ${item.sku || 'N/A'}) but no matching store product found. Manual inventory update needed.`,
          store: order.store,
          supplier: supplier?._id
        });
      }
    }

    // Update supplier stock (deduct from available)
    for (const item of order.items) {
      if (item.supplierProduct && item.receivedQuantity > 0) {
        await SupplierProduct.findByIdAndUpdate(item.supplierProduct._id || item.supplierProduct, {
          $inc: { availableStock: -item.receivedQuantity }
        });
      }
    }

    order.statusHistory.push({
      status: 'delivery_confirmed',
      changedBy: req.user._id,
      notes: `Delivery confirmed. ${updatedProducts.length} product(s) updated in inventory.`,
      timestamp: new Date()
    });

    await order.save();

    await SupplyChainLog.create({
      action: 'purchase_order_delivered',
      performedBy: req.user._id,
      userRole: req.user.role,
      relatedEntity: { type: 'PurchaseOrder', id: order._id },
      description: `Delivery confirmed for PO ${order.orderNumber}. ${updatedProducts.length} products restocked.`,
      store: order.store,
      supplier: supplier?._id,
      metadata: { updatedProducts }
    });

    res.json({
      message: 'Delivery confirmed and inventory updated.',
      order,
      inventoryUpdates: updatedProducts
    });
  } catch (error) {
    console.error('Confirm delivery error:', error);
    res.status(500).json({ message: 'Server error' });
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
  confirmDelivery,
  adminGetAllOrders
};
