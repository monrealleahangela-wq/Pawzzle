const crypto = require('crypto');
const Supplier = require('../models/Supplier');
const SupplierProduct = require('../models/SupplierProduct');
const PurchaseOrder = require('../models/PurchaseOrder');
const User = require('../models/User');
const Store = require('../models/Store');
const SupplyChainLog = require('../models/SupplyChainLog');
const { createNotification } = require('./notificationController');
const { sendSupplierInvitation, sendSupplierApplicationUpdate } = require('../utils/emailService');
const {
  getSelectableSupplierFilterForStore,
  isSupplierAvailable,
  isSupplierSelectableForStore,
  applySupplierLifecycleAction
} = require('../utils/supplierLifecycle');

const REQUIRED_PLATFORM_DOCUMENTS = ['business_registration', 'bir_certificate'];

const parseJsonField = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_error) { return fallback; }
};

const resolveAuthorizedStore = async user => {
  if (user.store) {
    return Store.findOne({ _id: user.store._id || user.store, isDeleted: { $ne: true } });
  }
  return Store.findOne({ owner: user._id, isDeleted: { $ne: true } });
};

const uploadedApplicationDocuments = files => {
  const definitions = [
    ['businessRegistration', 'business_registration'],
    ['birCertificate', 'bir_certificate']
  ];
  return definitions.flatMap(([field, documentType]) => {
    const file = files?.[field]?.[0];
    if (!file) return [];
    return [{
      documentType,
      documentUrl: file.path || file.secure_url,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      status: 'pending',
      submittedAt: new Date()
    }];
  });
};

const hasRequiredPlatformDocuments = supplier => {
  const currentTypes = new Set((supplier.applicationDocuments || [])
    .filter(document => !['superseded', 'rejected', 'needs_resubmission'].includes(document.status))
    .map(document => document.documentType));
  return REQUIRED_PLATFORM_DOCUMENTS.every(type => currentTypes.has(type))
    || (supplier.verificationDocuments || []).length >= REQUIRED_PLATFORM_DOCUMENTS.length;
};

const generateTemporaryPassword = () => `Pz!${crypto.randomBytes(9).toString('base64url')}7a`;

const generateUniqueUsername = async email => {
  const base = String(email).split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 32) || 'supplier';
  let username = base;
  while (await User.exists({ username, isDeleted: false })) {
    username = `${base.slice(0, 26)}${crypto.randomInt(100000, 999999)}`;
  }
  return username;
};

// ═══════════════════════════════════════════════════════════════
// SUPPLIER ACCOUNT MANAGEMENT
// ═══════════════════════════════════════════════════════════════

// Register as supplier
const registerSupplier = async (req, res) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ message: 'Only a customer account can submit a supplier application.' });
    }
    const existing = await Supplier.findOne({ user: req.user._id });
    if (existing) return res.status(400).json({ message: 'You already have a supplier account.' });

    const { businessName, contactPerson, email, phone, description, businessPermit, taxId } = req.body;
    const address = parseJsonField(req.body.address, req.body.address || {});
    const productCategories = parseJsonField(req.body.productCategories, []);
    const applicationDocuments = uploadedApplicationDocuments(req.files);

    if (!businessName || !contactPerson || !email || !phone || !address?.street || !address?.city || !address?.province) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }
    if (applicationDocuments.length !== REQUIRED_PLATFORM_DOCUMENTS.length) {
      return res.status(400).json({
        message: 'Business registration and BIR Certificate of Registration documents are required for a platform supplier application.'
      });
    }

    const supplier = new Supplier({
      user: req.user._id,
      businessName, contactPerson, email, phone, address, description,
      productCategories: productCategories || [],
      businessPermit, taxId,
      supplierType: 'platform',
      applicationDocuments,
      applicationHistory: [{ action: 'submitted', actor: req.user._id }],
      status: 'pending_verification',
      isActive: false
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
    const admins = await User.find({ role: { $in: ['super_admin', 'platform_admin'] } }).select('_id');
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

    await sendSupplierApplicationUpdate({
      email: supplier.email, contactPerson: supplier.contactPerson,
      businessName: supplier.businessName, status: 'submitted'
    }).catch(() => ({ success: false }));

    res.status(201).json(supplier);
  } catch (error) {
    console.error('Register supplier error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// A platform applicant replaces requested documents without creating another
// Supplier record or changing their own approval state.
const resubmitSupplierApplication = async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ user: req.user._id }).select('+applicationDocuments.documentUrl');
    if (!supplier) return res.status(404).json({ message: 'Supplier application not found.' });
    if ((supplier.supplierType || 'platform') !== 'platform') {
      return res.status(409).json({ message: 'Store-added suppliers do not use platform document review.' });
    }
    if (!['resubmission_required', 'rejected'].includes(supplier.status)) {
      return res.status(409).json({ message: 'This supplier application is not awaiting resubmission.' });
    }
    const replacements = uploadedApplicationDocuments(req.files);
    if (replacements.length !== REQUIRED_PLATFORM_DOCUMENTS.length) {
      return res.status(400).json({ message: 'Upload replacement business registration and BIR documents.' });
    }
    const replacementTypes = new Set(replacements.map(document => document.documentType));
    supplier.applicationDocuments.forEach(document => {
      if (replacementTypes.has(document.documentType) && document.status !== 'superseded') document.status = 'superseded';
    });
    supplier.applicationDocuments.push(...replacements);
    supplier.status = 'pending_verification';
    supplier.isActive = false;
    supplier.rejectionReason = undefined;
    supplier.applicationHistory.push({ action: 'resubmitted', actor: req.user._id });
    if (!hasRequiredPlatformDocuments(supplier)) {
      return res.status(400).json({ message: 'The application must contain current business registration and BIR documents.' });
    }
    await supplier.save();
    await SupplyChainLog.create({
      action: 'supplier_resubmitted', performedBy: req.user._id, userRole: 'supplier',
      relatedEntity: { type: 'Supplier', id: supplier._id },
      description: `Supplier "${supplier.businessName}" resubmitted verification documents`, supplier: supplier._id
    });
    res.json({ message: 'Documents resubmitted for Platform Admin review.', supplier });
  } catch (error) {
    console.error('Resubmit supplier application error:', error);
    res.status(error.name === 'ValidationError' ? 400 : 500).json({ message: error.message || 'Server error' });
  }
};

const createStoreSupplier = async (req, res) => {
  let user;
  let supplier;
  try {
    const store = await resolveAuthorizedStore(req.user);
    if (!store) return res.status(403).json({ message: 'An authorized store is required to add a supplier.' });
    const { businessName, contactPerson, email, phone, address = {}, description = '', productCategories = [] } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!businessName || !contactPerson || !cleanEmail || !phone || !address.street || !address.city || !address.province) {
      return res.status(400).json({ message: 'Business name, contact, email, phone, and complete address are required.' });
    }
    if (await User.exists({ email: cleanEmail, isDeleted: false })) {
      return res.status(409).json({ message: 'An active Pawzzle account already uses this email.' });
    }
    const temporaryPassword = generateTemporaryPassword();
    const activationToken = crypto.randomBytes(32).toString('hex');
    const names = String(contactPerson).trim().split(/\s+/);
    user = await User.create({
      username: await generateUniqueUsername(cleanEmail), email: cleanEmail, password: temporaryPassword,
      firstName: names[0], lastName: names.slice(1).join(' ') || 'Supplier', phone,
      role: 'supplier', isActive: false, requiresPasswordChange: true, createdBy: req.user._id
    });
    supplier = await Supplier.create({
      user: user._id, businessName, contactPerson, email: cleanEmail, phone, address, description,
      productCategories, supplierType: 'store_added', originStore: store._id,
      storeAssociations: [{ store: store._id, addedBy: req.user._id, status: 'pending_activation' }],
      status: 'verified', verifiedAt: new Date(), verifiedBy: req.user._id, isActive: false,
      invitation: {
        tokenHash: crypto.createHash('sha256').update(activationToken).digest('hex'),
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), sentAt: new Date(), invitedBy: req.user._id
      }
    });
    const delivery = await sendSupplierInvitation({
      email: cleanEmail, temporaryPassword, contactPerson, businessName, activationToken
    });
    await SupplyChainLog.create({
      action: 'supplier_invited', performedBy: req.user._id, userRole: req.user.role,
      relatedEntity: { type: 'Supplier', id: supplier._id },
      description: `Store invited supplier "${businessName}"`, store: store._id, supplier: supplier._id,
      metadata: { invitationDelivered: delivery.success }
    });
    res.status(201).json({
      message: delivery.success
        ? 'Supplier invited. The activation email was sent.'
        : 'Supplier invitation created, but email delivery failed. Use Resend invitation after email service is restored.',
      supplier, invitationDelivered: delivery.success
    });
  } catch (error) {
    if (!supplier && user?._id) await User.deleteOne({ _id: user._id }).catch(() => {});
    console.error('Create store supplier error:', error);
    res.status(error.code === 11000 ? 409 : 500).json({ message: error.code === 11000 ? 'Supplier email or username already exists.' : 'Unable to create supplier invitation.' });
  }
};

const getStoreManagedSuppliers = async (req, res) => {
  try {
    const store = await resolveAuthorizedStore(req.user);
    if (!store) return res.status(403).json({ message: 'Authorized store not found.' });
    const { search } = req.query;
    const filter = {
      isDeleted: false,
      ...(search ? { businessName: { $regex: search, $options: 'i' } } : {}),
      $or: [
        { supplierType: 'platform', status: 'verified', isActive: true },
        { supplierType: { $exists: false }, status: 'verified', isActive: true },
        { supplierType: 'store_added', storeAssociations: { $elemMatch: { store: store._id } } }
      ]
    };
    const records = await Supplier.find(filter)
      .select('businessName contactPerson email phone address description logo productCategories ratings performance supplierType originStore storeAssociations status isActive invitation.acceptedAt invitation.expiresAt')
      .sort({ createdAt: -1 }).lean();
    const suppliers = records.map(record => {
      const association = record.storeAssociations?.find(item => String(item.store) === String(store._id));
      return {
        ...record,
        supplierType: record.supplierType || 'platform',
        storeAssociationStatus: record.supplierType === 'store_added' ? association?.status : 'platform_approved',
        selectable: record.supplierType === 'store_added'
          ? record.status === 'verified' && record.isActive === true && association?.status === 'active'
          : record.status === 'verified' && record.isActive === true
      };
    });
    res.json({ suppliers });
  } catch (error) {
    console.error('Get store managed suppliers error:', error);
    res.status(500).json({ message: 'Unable to load suppliers.' });
  }
};

const resendStoreSupplierInvitation = async (req, res) => {
  try {
    const store = await resolveAuthorizedStore(req.user);
    const supplier = await Supplier.findOne({
      _id: req.params.id, supplierType: 'store_added',
      storeAssociations: { $elemMatch: { store: store?._id, status: 'pending_activation' } },
      isDeleted: false
    }).select('+invitation.tokenHash');
    if (!supplier) return res.status(404).json({ message: 'Pending supplier invitation not found for this store.' });
    const user = await User.findById(supplier.user).select('+password');
    if (!user || user.isActive) return res.status(409).json({ message: 'This supplier account is already active.' });
    const temporaryPassword = generateTemporaryPassword();
    const activationToken = crypto.randomBytes(32).toString('hex');
    user.password = temporaryPassword;
    user.requiresPasswordChange = true;
    await user.save();
    supplier.invitation.tokenHash = crypto.createHash('sha256').update(activationToken).digest('hex');
    supplier.invitation.expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    supplier.invitation.sentAt = new Date();
    await supplier.save();
    const delivery = await sendSupplierInvitation({
      email: supplier.email, temporaryPassword, contactPerson: supplier.contactPerson,
      businessName: supplier.businessName, activationToken
    });
    res.status(delivery.success ? 200 : 503).json({
      message: delivery.success ? 'Supplier invitation resent.' : 'Invitation refreshed, but email delivery failed.',
      invitationDelivered: delivery.success
    });
  } catch (error) {
    console.error('Resend supplier invitation error:', error);
    res.status(500).json({ message: 'Unable to resend supplier invitation.' });
  }
};

const activateSupplierInvitation = async (req, res) => {
  try {
    const tokenHash = crypto.createHash('sha256').update(String(req.params.token || '')).digest('hex');
    const supplier = await Supplier.findOne({
      'invitation.tokenHash': tokenHash, 'invitation.expiresAt': { $gt: new Date() },
      'invitation.acceptedAt': { $exists: false }, supplierType: 'store_added', isDeleted: false
    }).select('+invitation.tokenHash');
    if (!supplier) return res.status(400).json({ message: 'This supplier activation link is invalid, expired, or already used.' });
    const user = await User.findById(supplier.user);
    if (!user) return res.status(404).json({ message: 'Supplier account not found.' });
    user.isActive = true;
    user.deactivationReason = null;
    await user.save();
    supplier.isActive = true;
    supplier.invitation.acceptedAt = new Date();
    supplier.invitation.tokenHash = undefined;
    supplier.storeAssociations.forEach(association => {
      if (association.status === 'pending_activation') association.status = 'active';
    });
    await supplier.save();
    await SupplyChainLog.create({
      action: 'supplier_activated', performedBy: user._id, userRole: 'supplier',
      relatedEntity: { type: 'Supplier', id: supplier._id }, description: `Supplier "${supplier.businessName}" activated its account`,
      store: supplier.originStore, supplier: supplier._id
    });
    res.json({ message: 'Supplier account activated. Sign in with your temporary password, then create a private password.' });
  } catch (error) {
    console.error('Activate supplier invitation error:', error);
    res.status(500).json({ message: 'Unable to activate supplier invitation.' });
  }
};

const updateStoreSupplierAssociation = async (req, res) => {
  try {
    const store = await resolveAuthorizedStore(req.user);
    if (!store) return res.status(403).json({ message: 'Authorized store not found.' });
    const supplier = await Supplier.findOne({
      _id: req.params.id, supplierType: 'store_added',
      storeAssociations: { $elemMatch: { store: store._id } }, isDeleted: false
    });
    if (!supplier) return res.status(404).json({ message: 'Store-added supplier not found for this store.' });
    const association = supplier.storeAssociations.find(item => String(item.store) === String(store._id));
    const action = req.body.action;
    if (action === 'deactivate') {
      association.status = 'inactive';
      association.deactivatedAt = new Date();
    } else if (action === 'reactivate') {
      const invitedUser = await User.findById(supplier.user).select('isActive');
      if (!invitedUser?.isActive || !supplier.invitation?.acceptedAt) {
        return res.status(409).json({ message: 'The supplier must activate the invitation before it can be reactivated.' });
      }
      association.status = 'active';
      association.reactivatedAt = new Date();
    } else {
      return res.status(400).json({ message: 'Use deactivate or reactivate.' });
    }
    supplier.isActive = supplier.storeAssociations.some(item => item.status === 'active');
    await supplier.save();
    await SupplyChainLog.create({
      action: action === 'deactivate' ? 'supplier_association_deactivated' : 'supplier_association_reactivated',
      performedBy: req.user._id, userRole: req.user.role,
      relatedEntity: { type: 'Supplier', id: supplier._id },
      description: `Store ${action}d supplier "${supplier.businessName}"`, store: store._id, supplier: supplier._id
    });
    res.json({ message: `Supplier ${action}d for this store.`, supplier });
  } catch (error) {
    console.error('Update store supplier association error:', error);
    res.status(500).json({ message: 'Unable to update supplier.' });
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
    if (!isSupplierAvailable(supplier)) return res.status(403).json({ message: 'Only active verified suppliers can add products.' });

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

    const mutableFields = [
      'name', 'sku', 'description', 'category', 'images', 'wholesalePrice',
      'retailPrice', 'availableStock', 'minimumOrderQuantity', 'unitOfMeasure',
      'deliveryLeadTimeDays', 'brand', 'specifications', 'weight', 'dimensions',
      'expirationDate', 'isActive'
    ];
    const updates = {};
    mutableFields.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });
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
    const store = await resolveAuthorizedStore(req.user);
    if (!store) return res.status(403).json({ message: 'An authorized store is required to browse suppliers.' });
    let filter = getSelectableSupplierFilterForStore(store._id);
    if (category) filter.productCategories = category;
    if (search) filter.businessName = { $regex: search, $options: 'i' };

    const skip = (page - 1) * limit;
    const suppliers = await Supplier.find(filter)
      .select('businessName contactPerson email phone address description logo productCategories ratings performance.averageDeliveryDays performance.reliabilityScore performance.completedOrders supplierType originStore storeAssociations invitation.acceptedAt')
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
    const store = await resolveAuthorizedStore(req.user);
    if (!store || !isSupplierSelectableForStore(supplier, store._id)) {
      return res.status(404).json({ message: 'Supplier not found or unavailable.' });
    }

    const { category, search, page = 1, limit = 20 } = req.query;
    let filter = { supplier: supplier._id, isActive: true, isDeleted: false };
    if (category) filter.category = category;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const skip = (page - 1) * limit;
    const products = await SupplierProduct.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await SupplierProduct.countDocuments(filter);

    res.json({ supplier: { _id: supplier._id, businessName: supplier.businessName, logo: supplier.logo, ratings: supplier.ratings, supplierType: supplier.supplierType || 'platform' }, products, pagination: { page: parseInt(page), totalPages: Math.ceil(total / limit), total } });
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
    const supplier = await Supplier.findById(req.params.id).select('+applicationDocuments.documentUrl');
    if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });

    const { action, reason } = req.body;
    if (supplier.supplierType === 'store_added' && ['verify', 'reject', 'request_resubmission'].includes(action)) {
      return res.status(409).json({ message: 'Store-added suppliers do not require Platform Admin verification.' });
    }
    if (action === 'verify' && !hasRequiredPlatformDocuments(supplier)) {
      return res.status(409).json({ message: 'Required supplier documents are incomplete. Request resubmission instead.' });
    }
    if (['reject', 'request_resubmission'].includes(action) && !String(reason || '').trim()) {
      return res.status(400).json({ message: 'A review reason is required for this action.' });
    }
    const wasInactive = supplier.isActive === false;
    let legacyDeactivation = false;

    if (action === 'reactivate' && wasInactive) {
      const lastLifecycleLog = await SupplyChainLog.findOne({
        supplier: supplier._id,
        action: { $in: ['supplier_suspended', 'supplier_deactivated'] }
      }).sort({ createdAt: -1 }).lean();
      // Older deactivations disabled every catalog item, then failed to write their
      // unsupported audit action. Repair that legacy state only when no lifecycle
      // audit exists; current suspensions preserve each product's own active flag.
      legacyDeactivation = !lastLifecycleLog;
    }

    const transition = applySupplierLifecycleAction(supplier, action, {
      actorId: req.user._id,
      reason
    });

    if (['verify', 'reject', 'request_resubmission'].includes(action)) {
      const documentStatus = action === 'verify' ? 'verified' : action === 'reject' ? 'rejected' : 'needs_resubmission';
      supplier.applicationDocuments.forEach(document => {
        if (document.status !== 'superseded') {
          document.status = documentStatus;
          document.reviewerFeedback = reason;
          document.reviewedAt = new Date();
          document.reviewedBy = req.user._id;
        }
      });
      supplier.applicationHistory.push({
        action: action === 'verify' ? 'approved' : action === 'reject' ? 'rejected' : 'resubmission_requested',
        actor: req.user._id,
        reason
      });
    }

    await supplier.save();

    let legacyProductsRestored = 0;
    if (action === 'reactivate' && legacyDeactivation) {
      const repair = await SupplierProduct.updateMany(
        { supplier: supplier._id, isDeleted: false, isActive: false },
        { $set: { isActive: true } }
      );
      legacyProductsRestored = repair.modifiedCount || 0;
    }

    const actionLabels = {
      verify: 'Verified',
      reject: 'Rejected',
      request_resubmission: 'Needs Resubmission',
      suspend: 'Suspended',
      reactivate: 'Reactivated'
    };
    const actionMessages = {
      verify: 'Your supplier account has been verified. You can now list products and receive orders.',
      reject: `Your supplier application was rejected. Reason: ${reason || 'N/A'}`,
      request_resubmission: `Your supplier application needs updated documents. Reason: ${reason}`,
      suspend: `Your supplier account has been suspended. Reason: ${reason || 'N/A'}`,
      reactivate: 'Your supplier account has been reactivated and is available to sellers again.'
    };

    // Notify supplier
    await createNotification({
      recipient: supplier.user,
      sender: req.user._id,
      type: 'supplier_verification',
      title: `Supplier Account ${actionLabels[action]}`,
      message: actionMessages[action],
      relatedId: supplier._id,
      relatedModel: 'Supplier'
    });

    await sendSupplierApplicationUpdate({
      email: supplier.email, contactPerson: supplier.contactPerson,
      businessName: supplier.businessName,
      status: action === 'verify' ? 'approved' : action === 'request_resubmission' ? 'resubmission_required' : action,
      reason
    }).catch(() => ({ success: false }));

    await SupplyChainLog.create({
      action: action === 'request_resubmission'
        ? 'supplier_resubmission_requested'
        : `supplier_${action === 'verify' ? 'verified' : action === 'reject' ? 'rejected' : action === 'suspend' ? 'suspended' : 'reactivated'}`,
      performedBy: req.user._id,
      userRole: req.user.role,
      relatedEntity: { type: 'Supplier', id: supplier._id },
      description: `Supplier "${supplier.businessName}" ${actionLabels[action].toLowerCase()}${reason ? ` (${reason})` : ''}`,
      supplier: supplier._id,
      previousValue: transition.previous,
      newValue: transition.current,
      metadata: { legacyProductsRestored }
    });

    res.json(supplier);
  } catch (error) {
    console.error('Admin verify supplier error:', error);
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Server error' });
  }
};

const adminGetSupplierDetails = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id)
      .select('+applicationDocuments.documentUrl')
      .populate('user', 'firstName lastName email avatar')
      .populate('verifiedBy', 'firstName lastName')
      .populate('originStore', 'name')
      .populate('storeAssociations.store', 'name');
    if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });

    const [products, orders, productCount, orderCount, recentLogs] = await Promise.all([
      SupplierProduct.find({ supplier: supplier._id, isDeleted: false }).select('name sku category wholesalePrice availableStock isActive').sort({ createdAt: -1 }).limit(20),
      PurchaseOrder.find({ supplier: supplier._id, isDeleted: false }).select('orderNumber status paymentStatus totalCost createdAt').populate('store', 'name').sort({ createdAt: -1 }).limit(20),
      SupplierProduct.countDocuments({ supplier: supplier._id, isDeleted: false }),
      PurchaseOrder.countDocuments({ supplier: supplier._id, isDeleted: false }),
      SupplyChainLog.find({ supplier: supplier._id })
      .populate('performedBy', 'firstName lastName')
      .sort({ createdAt: -1 }).limit(20)
    ]);

    res.json({ supplier, products, orders, productCount, orderCount, recentLogs });
  } catch (error) {
    console.error('Admin supplier details error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const adminUpdateSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ _id: req.params.id, isDeleted: false });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });
    const allowed = ['businessName', 'contactPerson', 'email', 'phone', 'address', 'description', 'productCategories', 'taxId', 'businessRegistrationNumber', 'logo'];
    allowed.forEach(field => { if (req.body[field] !== undefined) supplier[field] = req.body[field]; });
    await supplier.save();
    await SupplyChainLog.create({ action: 'supplier_updated', performedBy: req.user._id, userRole: req.user.role, relatedEntity: { type: 'Supplier', id: supplier._id }, description: `Supplier "${supplier.businessName}" updated`, supplier: supplier._id });
    res.json(supplier);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

const adminDeactivateSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ _id: req.params.id, isDeleted: false });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });
    const activeOrders = await PurchaseOrder.countDocuments({ supplier: supplier._id, isDeleted: false, status: { $in: ['submitted', 'confirmed', 'processing', 'shipped'] } });
    if (activeOrders) return res.status(409).json({ message: `Supplier has ${activeOrders} active purchase order(s). Complete or cancel them first.` });
    const transition = applySupplierLifecycleAction(supplier, 'suspend', {
      actorId: req.user._id,
      reason: req.body.reason || 'Deactivated by administrator'
    });
    await supplier.save();
    await SupplyChainLog.create({
      action: 'supplier_deactivated',
      performedBy: req.user._id,
      userRole: req.user.role,
      relatedEntity: { type: 'Supplier', id: supplier._id },
      description: `Supplier "${supplier.businessName}" deactivated`,
      supplier: supplier._id,
      previousValue: transition.previous,
      newValue: transition.current,
      metadata: { productAvailabilityPreserved: true }
    });
    res.json(supplier);
  } catch (error) { res.status(error.statusCode || 400).json({ message: error.message }); }
};

module.exports = {
  registerSupplier, resubmitSupplierApplication,
  createStoreSupplier, getStoreManagedSuppliers, resendStoreSupplierInvitation, activateSupplierInvitation,
  updateStoreSupplierAssociation,
  getMySupplierProfile,
  updateSupplierProfile,
  getSupplierDashboard,
  addProduct, getMyProducts, updateProduct, deleteProduct,
  getSupplierOrders, updateOrderStatus,
  browseSuppliers, getSupplierCatalog,
  adminGetAllSuppliers, adminVerifySupplier, adminGetSupplierDetails,
  adminUpdateSupplier, adminDeactivateSupplier
};
