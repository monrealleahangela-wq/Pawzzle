const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const SupplierProduct = require('../models/SupplierProduct');
const Store = require('../models/Store');
const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const SupplyChainLog = require('../models/SupplyChainLog');
const { createNotification } = require('./notificationController');

// ═══════════════════════════════════════════════════════════════
// SELLER - Create & Manage Purchase Orders
// ═══════════════════════════════════════════════════════════════

const createPurchaseOrder = async (req, res) => {
  try {
    const { supplierId, items, shippingAddress, sellerNotes, paymentMethod } = req.body;

    if (!supplierId || !items || items.length === 0) {
      return res.status(400).json({ message: 'Supplier and at least one item are required.' });
    }

    // Verify supplier
    const supplier = await Supplier.findById(supplierId);
    if (!supplier || supplier.status !== 'verified') {
      return res.status(400).json({ message: 'Only verified suppliers can receive orders.' });
    }

    // Resolve store
    let store = null;
    if (req.user.store) {
      store = req.user.store;
    } else {
      const ownedStore = await Store.findOne({ owner: req.user._id });
      if (ownedStore) store = ownedStore._id;
    }
    if (!store) return res.status(400).json({ message: 'You must have a store to create purchase orders.' });

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

      resolvedItems.push({
        supplierProduct: product._id,
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
    let filter = { seller: req.user._id, isDeleted: false };
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
      ['admin', 'super_admin'].includes(req.user.role);

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
    const order = await PurchaseOrder.findOne({ _id: req.params.id, seller: req.user._id });
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
    const order = await PurchaseOrder.findOne({ _id: req.params.id, seller: req.user._id })
      .populate('items.supplierProduct');
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    if (order.status !== 'delivered') {
      return res.status(400).json({ message: 'Order must be in "delivered" status.' });
    }

    // Update store inventory from delivered items
    for (const item of order.items) {
      const received = req.body.receivedQuantities?.[item._id.toString()] || item.quantity;
      item.receivedQuantity = received;

      // Find matching inventory item or product
      if (item.supplierProduct) {
        // Try to find existing inventory for this product
        let inventoryItem = await Inventory.findOne({
          store: order.store,
          'supplier.email': item.supplierProduct.supplier?.toString()
        });

        // Create or update inventory
        const existingInv = await Inventory.findOne({
          store: order.store,
          notes: { $regex: item.sku || item.productName, $options: 'i' }
        });

        if (existingInv) {
          existingInv.quantity += received;
          existingInv.lastRestocked = new Date();
          await existingInv.save();
        }
      }
    }

    order.paymentStatus = 'paid';
    order.statusHistory.push({
      status: 'delivery_confirmed',
      changedBy: req.user._id,
      notes: 'Delivery confirmed and inventory updated',
      timestamp: new Date()
    });

    await order.save();

    await SupplyChainLog.create({
      action: 'purchase_order_delivered',
      performedBy: req.user._id,
      userRole: req.user.role,
      relatedEntity: { type: 'PurchaseOrder', id: order._id },
      description: `Delivery confirmed for PO ${order.orderNumber}. Inventory updated.`,
      store: order.store
    });

    res.json({ message: 'Delivery confirmed and inventory updated.', order });
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
  createPurchaseOrder,
  getSellerOrders,
  getOrderById,
  cancelOrder,
  confirmDelivery,
  adminGetAllOrders
};
