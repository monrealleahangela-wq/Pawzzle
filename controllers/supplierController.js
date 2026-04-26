const Supplier = require('../models/Supplier');
const SupplierProduct = require('../models/SupplierProduct');
const PurchaseOrder = require('../models/PurchaseOrder');
const User = require('../models/User');
const SupplyChainLog = require('../models/SupplyChainLog');
const { createNotification } = require('./notificationController');

// ═══════════════════════════════════════════════════════════════
// SUPPLIER ACCOUNT MANAGEMENT
// ═══════════════════════════════════════════════════════════════

// Register as supplier
const registerSupplier = async (req, res) => {
  try {
    const existing = await Supplier.findOne({ user: req.user._id });
    if (existing) return res.status(400).json({ message: 'You already have a supplier account.' });

    const { businessName, contactPerson, email, phone, address, description,
      productCategories, businessPermit, taxId, verificationDocuments } = req.body;

    if (!businessName || !contactPerson || !email || !phone || !address?.street || !address?.city || !address?.province) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    const supplier = new Supplier({
      user: req.user._id,
      businessName, contactPerson, email, phone, address, description,
      productCategories: productCategories || [],
      businessPermit, taxId,
      verificationDocuments: verificationDocuments || [],
      status: 'pending_verification'
    });

    await supplier.save();

    // Update user role
    await User.findByIdAndUpdate(req.user._id, { role: 'supplier' });

    // Log
    await SupplyChainLog.create({
      action: 'supplier_registered',
      performedBy: req.user._id,
      userRole: 'supplier',
      relatedEntity: { type: 'Supplier', id: supplier._id },
      description: `Supplier "${businessName}" registered`,
      supplier: supplier._id
    });

    // Notify admins
    const admins = await User.find({ role: { $in: ['super_admin'] } }).select('_id');
    for (const admin of admins) {
      await createNotification({
        recipient: admin._id,
        sender: req.user._id,
        type: 'supplier_verification',
        title: 'New Supplier Registration',
        message: `${businessName} has registered as a supplier and requires verification.`,
        relatedId: supplier._id,
        relatedModel: 'Supplier'
      });
    }

    res.status(201).json(supplier);
  } catch (error) {
    console.error('Register supplier error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get own supplier profile
const getMySupplierProfile = async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id }).populate('user', 'firstName lastName email avatar');
    if (!supplier) return res.status(404).json({ message: 'Supplier profile not found.' });
    res.json(supplier);
  } catch (error) {
    console.error('Get supplier profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update own supplier profile
const updateSupplierProfile = async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) return res.status(404).json({ message: 'Supplier profile not found.' });

    const allowed = ['businessName', 'contactPerson', 'email', 'phone', 'address',
      'description', 'logo', 'productCategories', 'payoutAccount'];
    allowed.forEach(key => { if (req.body[key] !== undefined) supplier[key] = req.body[key]; });

    await supplier.save();
    res.json(supplier);
  } catch (error) {
    console.error('Update supplier error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get supplier dashboard stats
const getSupplierDashboard = async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });

    const products = await SupplierProduct.countDocuments({ supplier: supplier._id, isActive: true, isDeleted: false });
    const totalStock = await SupplierProduct.aggregate([
      { $match: { supplier: supplier._id, isActive: true, isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$availableStock' } } }
    ]);

    const orders = await PurchaseOrder.aggregate([
      { $match: { supplier: supplier._id, isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$totalCost' } } }
    ]);

    const recentOrders = await PurchaseOrder.find({ supplier: supplier._id, isDeleted: false })
      .populate('seller', 'firstName lastName')
      .populate('store', 'name')
      .sort({ createdAt: -1 }).limit(10);

    res.json({
      supplier,
      stats: {
        activeProducts: products,
        totalStock: totalStock[0]?.total || 0,
        ordersByStatus: orders,
        performance: supplier.performance,
        ratings: supplier.ratings
      },
      recentOrders
    });
  } catch (error) {
    console.error('Supplier dashboard error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ═══════════════════════════════════════════════════════════════
// SUPPLIER PRODUCT MANAGEMENT
// ═══════════════════════════════════════════════════════════════

const addProduct = async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });
    if (supplier.status !== 'verified') return res.status(403).json({ message: 'Only verified suppliers can add products.' });

    const { name, sku, description, category, images, wholesalePrice, retailPrice,
      availableStock, minimumOrderQuantity, unitOfMeasure, deliveryLeadTimeDays,
      brand, specifications, weight, dimensions, expirationDate } = req.body;

    if (!name || !sku || !category || wholesalePrice === undefined) {
      return res.status(400).json({ message: 'Name, SKU, category, and wholesale price are required.' });
    }

    const product = new SupplierProduct({
      supplier: supplier._id,
      name, sku, description, category, images: images || [],
      wholesalePrice, retailPrice: retailPrice || 0,
      availableStock: availableStock || 0,
      minimumOrderQuantity: minimumOrderQuantity || 1,
      unitOfMeasure: unitOfMeasure || 'piece',
      deliveryLeadTimeDays: deliveryLeadTimeDays || 3,
      brand, specifications, weight, dimensions, expirationDate
    });

    await product.save();

    await SupplyChainLog.create({
      action: 'supplier_product_added',
      performedBy: req.user._id,
      userRole: 'supplier',
      relatedEntity: { type: 'SupplierProduct', id: product._id },
      description: `Product "${name}" (SKU: ${sku}) added to catalog`,
      supplier: supplier._id
    });

    res.status(201).json(product);
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'A product with this SKU already exists.' });
    console.error('Add supplier product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getMyProducts = async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });

    const { category, search, page = 1, limit = 20 } = req.query;
    let filter = { supplier: supplier._id, isDeleted: false };
    if (category) filter.category = category;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const skip = (page - 1) * limit;
    const products = await SupplierProduct.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await SupplierProduct.countDocuments(filter);

    res.json({ products, pagination: { page: parseInt(page), totalPages: Math.ceil(total / limit), total } });
  } catch (error) {
    console.error('Get supplier products error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateProduct = async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });

    const product = await SupplierProduct.findOne({ _id: req.params.id, supplier: supplier._id });
    if (!product) return res.status(404).json({ message: 'Product not found.' });

    const updates = req.body;
    const prev = { ...product.toObject() };
    Object.assign(product, updates);
    await product.save();

    await SupplyChainLog.create({
      action: 'supplier_product_updated',
      performedBy: req.user._id,
      userRole: 'supplier',
      relatedEntity: { type: 'SupplierProduct', id: product._id },
      description: `Product "${product.name}" updated`,
      supplier: supplier._id,
      previousValue: { price: prev.wholesalePrice, stock: prev.availableStock },
      newValue: { price: product.wholesalePrice, stock: product.availableStock }
    });

    res.json(product);
  } catch (error) {
    console.error('Update supplier product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });

    const product = await SupplierProduct.findOne({ _id: req.params.id, supplier: supplier._id });
    if (!product) return res.status(404).json({ message: 'Product not found.' });

    product.isDeleted = true;
    product.isActive = false;
    await product.save();

    await SupplyChainLog.create({
      action: 'supplier_product_removed',
      performedBy: req.user._id,
      userRole: 'supplier',
      relatedEntity: { type: 'SupplierProduct', id: product._id },
      description: `Product "${product.name}" removed from catalog`,
      supplier: supplier._id
    });

    res.json({ message: 'Product removed.' });
  } catch (error) {
    console.error('Delete supplier product error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ═══════════════════════════════════════════════════════════════
// SUPPLIER ORDER MANAGEMENT
// ═══════════════════════════════════════════════════════════════

const getSupplierOrders = async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });

    const { status, page = 1, limit = 20 } = req.query;
    let filter = { supplier: supplier._id, isDeleted: false };
    if (status) filter.status = status;

    const skip = (page - 1) * limit;
    const orders = await PurchaseOrder.find(filter)
      .populate('seller', 'firstName lastName email')
      .populate('store', 'name')
      .populate('items.supplierProduct', 'name sku images')
      .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await PurchaseOrder.countDocuments(filter);

    res.json({ orders, pagination: { page: parseInt(page), totalPages: Math.ceil(total / limit), total } });
  } catch (error) {
    console.error('Get supplier orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });

    const order = await PurchaseOrder.findOne({ _id: req.params.id, supplier: supplier._id });
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    const { status, supplierNotes, trackingNumber, carrier, estimatedDeliveryDate } = req.body;

    const validTransitions = {
      submitted: ['confirmed', 'cancelled'],
      confirmed: ['processing', 'cancelled'],
      processing: ['shipped', 'cancelled'],
      shipped: ['delivered'],
      delivered: ['returned']
    };

    if (!validTransitions[order.status]?.includes(status)) {
      return res.status(400).json({ message: `Cannot transition from "${order.status}" to "${status}".` });
    }

    const prevStatus = order.status;
    order.status = status;
    if (supplierNotes) order.supplierNotes = supplierNotes;
    if (trackingNumber) order.trackingNumber = trackingNumber;
    if (carrier) order.carrier = carrier;
    if (estimatedDeliveryDate) order.estimatedDeliveryDate = estimatedDeliveryDate;
    if (status === 'delivered') order.actualDeliveryDate = new Date();

    order.statusHistory.push({
      status, changedBy: req.user._id,
      notes: supplierNotes || `Status changed to ${status}`,
      timestamp: new Date()
    });

    await order.save();

    // Update supplier performance
    if (status === 'delivered') {
      supplier.performance.completedOrders += 1;
      supplier.performance.totalRevenue += order.totalCost;
      const deliveryDays = Math.ceil((order.actualDeliveryDate - order.createdAt) / (1000 * 60 * 60 * 24));
      const totalCompleted = supplier.performance.completedOrders;
      supplier.performance.averageDeliveryDays = Math.round(
        ((supplier.performance.averageDeliveryDays * (totalCompleted - 1)) + deliveryDays) / totalCompleted
      );
      await supplier.save();
    }
    if (status === 'cancelled') {
      supplier.performance.cancelledOrders += 1;
      const total = supplier.performance.totalOrders || 1;
      supplier.performance.reliabilityScore = Math.round(
        ((total - supplier.performance.cancelledOrders) / total) * 100
      );
      await supplier.save();
    }

    // Notify seller
    await createNotification({
      recipient: order.seller,
      sender: req.user._id,
      type: 'purchase_order',
      title: `Purchase Order ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      message: `Your purchase order ${order.orderNumber} has been ${status}.`,
      relatedId: order._id,
      relatedModel: 'PurchaseOrder'
    });

    await SupplyChainLog.create({
      action: `purchase_order_${status}`,
      performedBy: req.user._id,
      userRole: 'supplier',
      relatedEntity: { type: 'PurchaseOrder', id: order._id },
      description: `Purchase order ${order.orderNumber} status: ${prevStatus} → ${status}`,
      supplier: supplier._id,
      previousValue: { status: prevStatus },
      newValue: { status }
    });

    res.json(order);
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ═══════════════════════════════════════════════════════════════
// PUBLIC - Browse Suppliers (for sellers)
// ═══════════════════════════════════════════════════════════════

const browseSuppliers = async (req, res) => {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;
    let filter = { status: 'verified', isActive: true, isDeleted: false };
    if (category) filter.productCategories = category;
    if (search) filter.businessName = { $regex: search, $options: 'i' };

    const skip = (page - 1) * limit;
    const suppliers = await Supplier.find(filter)
      .select('businessName contactPerson email phone address description logo productCategories ratings performance.averageDeliveryDays performance.reliabilityScore performance.completedOrders')
      .sort({ 'ratings.average': -1 }).skip(skip).limit(parseInt(limit));
    const total = await Supplier.countDocuments(filter);

    res.json({ suppliers, pagination: { page: parseInt(page), totalPages: Math.ceil(total / limit), total } });
  } catch (error) {
    console.error('Browse suppliers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getSupplierCatalog = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.supplierId);
    if (!supplier || supplier.status !== 'verified') {
      return res.status(404).json({ message: 'Supplier not found or not verified.' });
    }

    const { category, search, page = 1, limit = 20 } = req.query;
    let filter = { supplier: supplier._id, isActive: true, isDeleted: false };
    if (category) filter.category = category;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const skip = (page - 1) * limit;
    const products = await SupplierProduct.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await SupplierProduct.countDocuments(filter);

    res.json({ supplier: { _id: supplier._id, businessName: supplier.businessName, logo: supplier.logo, ratings: supplier.ratings }, products, pagination: { page: parseInt(page), totalPages: Math.ceil(total / limit), total } });
  } catch (error) {
    console.error('Get supplier catalog error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ═══════════════════════════════════════════════════════════════
// ADMIN - Supplier Verification & Management
// ═══════════════════════════════════════════════════════════════

const adminGetAllSuppliers = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    let filter = { isDeleted: false };
    if (status) filter.status = status;
    if (search) filter.businessName = { $regex: search, $options: 'i' };

    const skip = (page - 1) * limit;
    const suppliers = await Supplier.find(filter)
      .populate('user', 'firstName lastName email avatar')
      .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await Supplier.countDocuments(filter);

    res.json({ suppliers, pagination: { page: parseInt(page), totalPages: Math.ceil(total / limit), total } });
  } catch (error) {
    console.error('Admin get suppliers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const adminVerifySupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });

    const { action, reason } = req.body; // action: 'verify', 'reject', 'suspend'

    if (action === 'verify') {
      supplier.status = 'verified';
      supplier.verifiedAt = new Date();
      supplier.verifiedBy = req.user._id;
    } else if (action === 'reject') {
      supplier.status = 'rejected';
      supplier.rejectionReason = reason || 'Application rejected.';
    } else if (action === 'suspend') {
      supplier.status = 'suspended';
      supplier.suspensionReason = reason || 'Account suspended.';
    } else {
      return res.status(400).json({ message: 'Invalid action. Use verify, reject, or suspend.' });
    }

    await supplier.save();

    // Notify supplier
    await createNotification({
      recipient: supplier.user,
      sender: req.user._id,
      type: 'supplier_verification',
      title: `Supplier Account ${action === 'verify' ? 'Verified' : action === 'reject' ? 'Rejected' : 'Suspended'}`,
      message: action === 'verify'
        ? 'Your supplier account has been verified. You can now list products and receive orders.'
        : `Your supplier account has been ${action}ed. Reason: ${reason || 'N/A'}`,
      relatedId: supplier._id,
      relatedModel: 'Supplier'
    });

    await SupplyChainLog.create({
      action: `supplier_${action === 'verify' ? 'verified' : action === 'reject' ? 'rejected' : 'suspended'}`,
      performedBy: req.user._id,
      userRole: req.user.role,
      relatedEntity: { type: 'Supplier', id: supplier._id },
      description: `Supplier "${supplier.businessName}" ${action}ed ${reason ? `(${reason})` : ''}`,
      supplier: supplier._id
    });

    res.json(supplier);
  } catch (error) {
    console.error('Admin verify supplier error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const adminGetSupplierDetails = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id)
      .populate('user', 'firstName lastName email avatar')
      .populate('verifiedBy', 'firstName lastName');
    if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });

    const productCount = await SupplierProduct.countDocuments({ supplier: supplier._id, isDeleted: false });
    const orderCount = await PurchaseOrder.countDocuments({ supplier: supplier._id, isDeleted: false });
    const recentLogs = await SupplyChainLog.find({ supplier: supplier._id })
      .populate('performedBy', 'firstName lastName')
      .sort({ createdAt: -1 }).limit(20);

    res.json({ supplier, productCount, orderCount, recentLogs });
  } catch (error) {
    console.error('Admin supplier details error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  registerSupplier,
  getMySupplierProfile,
  updateSupplierProfile,
  getSupplierDashboard,
  addProduct, getMyProducts, updateProduct, deleteProduct,
  getSupplierOrders, updateOrderStatus,
  browseSuppliers, getSupplierCatalog,
  adminGetAllSuppliers, adminVerifySupplier, adminGetSupplierDetails
};
