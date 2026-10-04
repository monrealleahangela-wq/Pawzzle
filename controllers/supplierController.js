const crypto = require('crypto');
const mongoose = require('mongoose');
const Supplier = require('../models/Supplier');
const SupplierProduct = require('../models/SupplierProduct');
const Pet = require('../models/Pet');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProcurementReceivingReport = require('../models/ProcurementReceivingReport');
const User = require('../models/User');
const Store = require('../models/Store');
const SupplyChainLog = require('../models/SupplyChainLog');
const { createNotification } = require('./notificationController');
const { releasePurchaseOrderStock } = require('../services/procurementStockCommitmentService');
const { getResolutionQuantities } = require('../utils/procurementResolution');
const { sanitizeReceivingReport, sanitizeOrderReceivingReport } = require('../utils/procurementEvidence');
const { sendSupplierInvitation, sendSupplierApplicationUpdate } = require('../utils/emailService');
const {
  getSelectableSupplierFilterForStore,
  isSupplierAvailable,
  isSupplierSelectableForStore,
  applySupplierLifecycleAction
} = require('../utils/supplierLifecycle');

const REQUIRED_PLATFORM_DOCUMENTS = ['business_registration', 'bir_certificate'];
const SUPPLIER_GOODS_TYPES = ['live_pets', 'pet_supplies', 'general_products'];

const createHttpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const settleSupplierSecondaryEffects = async (context, effects) => {
  const results = await Promise.allSettled(effects.filter(Boolean).map(effect => (
    typeof effect === 'function' ? Promise.resolve().then(effect) : effect
  )));
  results.forEach(result => {
    if (result.status === 'rejected') {
      console.error(`${context} secondary operation failed:`, result.reason);
    }
  });
};

const inferSupplierGoodsType = itemType => itemType === 'live_pet'
  ? 'live_pets'
  : itemType === 'product' ? 'general_products' : 'pet_supplies';

const buildSupplierPet = ({ input, supplier, userId, price, images }) => {
  const pet = input && typeof input === 'object' ? input : {};
  const required = ['name', 'species', 'breed', 'age', 'gender', 'size', 'description'];
  const missing = required.filter(key => pet[key] === undefined || pet[key] === null || pet[key] === '');
  if (missing.length) {
    const error = new Error(`Live-pet details are incomplete: ${missing.join(', ')}.`);
    error.statusCode = 400;
    throw error;
  }
  return {
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    age: pet.age,
    ageUnit: pet.ageUnit || 'years',
    birthday: pet.birthday || undefined,
    gender: pet.gender,
    size: pet.size,
    color: pet.color,
    description: pet.description,
    price,
    images: images || [],
    quantity: 1,
    status: 'available',
    isAvailable: true,
    listingType: 'sale',
    dewormed: Boolean(pet.dewormed),
    spayedNeutered: Boolean(pet.spayedNeutered),
    healthCondition: pet.healthCondition || 'healthy',
    vaccinationStatus: pet.vaccinationStatus || 'none',
    healthNotes: pet.healthNotes,
    vetRecords: Array.isArray(pet.vetRecords) ? pet.vetRecords : [],
    proofOfOwnership: Array.isArray(pet.proofOfOwnership) ? pet.proofOfOwnership : [],
    pcciRegistration: pet.pcciRegistration,
    listingContext: 'supplier_catalog',
    sourceSupplier: supplier._id,
    addedBy: userId
  };
};

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
    const goodsTypes = parseJsonField(req.body.goodsTypes, []);
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
      goodsTypes: (goodsTypes || []).filter(type => SUPPLIER_GOODS_TYPES.includes(type)),
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

    await settleSupplierSecondaryEffects('Register supplier', [
      () => SupplyChainLog.create({
        action: 'supplier_registered',
        performedBy: req.user._id,
        userRole: 'supplier',
        relatedEntity: { type: 'Supplier', id: supplier._id },
        description: `Supplier "${businessName}" registered`,
        supplier: supplier._id
      }),
      async () => {
        const admins = await User.find({ role: { $in: ['super_admin', 'platform_admin'] } }).select('_id');
        await Promise.all(admins.map(admin => createNotification({
          recipient: admin._id,
          sender: req.user._id,
          type: 'supplier_verification',
          title: 'New Supplier Registration',
          message: `${businessName} has registered as a supplier and requires verification.`,
          relatedId: supplier._id,
          relatedModel: 'Supplier'
        })));
      },
      () => sendSupplierApplicationUpdate({
        email: supplier.email, contactPerson: supplier.contactPerson,
        businessName: supplier.businessName, status: 'submitted'
      })
    ]);

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
    await settleSupplierSecondaryEffects('Resubmit supplier application', [
      () => SupplyChainLog.create({
        action: 'supplier_resubmitted', performedBy: req.user._id, userRole: 'supplier',
        relatedEntity: { type: 'Supplier', id: supplier._id },
        description: `Supplier "${supplier.businessName}" resubmitted verification documents`, supplier: supplier._id
      })
    ]);
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
    const [deliveryResult] = await Promise.allSettled([sendSupplierInvitation({
      email: cleanEmail, temporaryPassword, contactPerson, businessName, activationToken
    })]);
    const delivery = deliveryResult.status === 'fulfilled' ? deliveryResult.value : { success: false };
    if (deliveryResult.status === 'rejected') {
      console.error('Create store supplier invitation delivery failed:', deliveryResult.reason);
    }
    await settleSupplierSecondaryEffects('Create store supplier invitation', [
      () => SupplyChainLog.create({
        action: 'supplier_invited', performedBy: req.user._id, userRole: req.user.role,
        relatedEntity: { type: 'Supplier', id: supplier._id },
        description: `Store invited supplier "${businessName}"`, store: store._id, supplier: supplier._id,
        metadata: { invitationDelivered: delivery.success }
      })
    ]);
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
  let activatedSupplier;
  let activatedUser;
  try {
    const tokenHash = crypto.createHash('sha256').update(String(req.params.token || '')).digest('hex');
    await mongoose.connection.transaction(async session => {
      const supplier = await Supplier.findOne({
        'invitation.tokenHash': tokenHash, 'invitation.expiresAt': { $gt: new Date() },
        'invitation.acceptedAt': { $exists: false }, supplierType: 'store_added', isDeleted: false
      }).select('+invitation.tokenHash').session(session);
      if (!supplier) throw createHttpError('This supplier activation link is invalid, expired, or already used.', 400);
      const user = await User.findById(supplier.user).session(session);
      if (!user) throw createHttpError('Supplier account not found.', 404);
      user.isActive = true;
      user.deactivationReason = null;
      supplier.isActive = true;
      supplier.invitation.acceptedAt = new Date();
      supplier.invitation.tokenHash = undefined;
      supplier.storeAssociations.forEach(association => {
        if (association.status === 'pending_activation') association.status = 'active';
      });
      await Promise.all([user.save({ session }), supplier.save({ session })]);
      activatedSupplier = supplier;
      activatedUser = user;
    });
    await settleSupplierSecondaryEffects('Activate supplier invitation', [
      SupplyChainLog.create({
        action: 'supplier_activated', performedBy: activatedUser._id, userRole: 'supplier',
        relatedEntity: { type: 'Supplier', id: activatedSupplier._id }, description: `Supplier "${activatedSupplier.businessName}" activated its account`,
        store: activatedSupplier.originStore, supplier: activatedSupplier._id
      })
    ]);
    res.json({ message: 'Supplier account activated. Sign in with your temporary password, then create a private password.' });
  } catch (error) {
    console.error('Activate supplier invitation error:', error);
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Unable to activate supplier invitation.' });
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
    await settleSupplierSecondaryEffects('Update store supplier association', [
      SupplyChainLog.create({
        action: action === 'deactivate' ? 'supplier_association_deactivated' : 'supplier_association_reactivated',
        performedBy: req.user._id, userRole: req.user.role,
        relatedEntity: { type: 'Supplier', id: supplier._id },
        description: `Store ${action}d supplier "${supplier.businessName}"`, store: store._id, supplier: supplier._id
      })
    ]);
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
      'description', 'logo', 'productCategories', 'goodsTypes', 'payoutAccount'];
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
    const itemType = ['pet_supply', 'product', 'live_pet'].includes(req.body.itemType)
      ? req.body.itemType : 'pet_supply';

    if (!name || !sku || !category || wholesalePrice === undefined) {
      return res.status(400).json({ message: 'Name, SKU, category, and wholesale price are required.' });
    }

    const authoritativeCategory = itemType === 'live_pet' ? 'live_pets' : category;
    if (itemType !== 'live_pet' && category === 'live_pets') {
      return res.status(400).json({ message: 'The live-pets category is reserved for exact live-pet catalog records.' });
    }
    let product;
    const persistCatalogEntry = async session => {
      let pet = null;
      if (itemType === 'live_pet') {
        pet = new Pet(buildSupplierPet({
          input: req.body.pet,
          supplier,
          userId: req.user._id,
          price: Number(wholesalePrice),
          images
        }));
        await pet.save({ session });
      }

      product = new SupplierProduct({
        supplier: supplier._id,
        itemType,
        pet: pet?._id || null,
        name, sku, description, category: authoritativeCategory, images: images || [],
        wholesalePrice, retailPrice: retailPrice || 0,
        availableStock: itemType === 'live_pet' ? 1 : (availableStock || 0),
        minimumOrderQuantity: itemType === 'live_pet' ? 1 : (minimumOrderQuantity || 1),
        unitOfMeasure: itemType === 'live_pet' ? 'piece' : (unitOfMeasure || 'piece'),
        deliveryLeadTimeDays: deliveryLeadTimeDays || 3,
        brand, specifications, weight, dimensions, expirationDate
      });
      await product.save({ session });
      await Supplier.updateOne({ _id: supplier._id }, {
        $addToSet: { goodsTypes: inferSupplierGoodsType(itemType) }
      }, { session });
    };

    if (itemType === 'live_pet') {
      await mongoose.connection.transaction(persistCatalogEntry);
    } else {
      await persistCatalogEntry(null);
    }

    await settleSupplierSecondaryEffects('Add supplier product', [
      () => SupplyChainLog.create({
        action: 'supplier_product_added',
        performedBy: req.user._id,
        userRole: 'supplier',
        relatedEntity: { type: 'SupplierProduct', id: product._id },
        description: `Product "${name}" (SKU: ${sku}) added to catalog`,
        supplier: supplier._id
      })
    ]);

    res.status(201).json(product);
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'A product with this SKU already exists.' });
    console.error('Add supplier product error:', error);
    res.status(error.statusCode || (error.name === 'ValidationError' ? 400 : 500)).json({
      message: error.message || 'Server error'
    });
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
    const products = await SupplierProduct.find(filter).populate('pet').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await SupplierProduct.countDocuments(filter);

    res.json({ products, pagination: { page: parseInt(page), totalPages: Math.ceil(total / limit), total } });
  } catch (error) {
    console.error('Get supplier products error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const hasUnreleasedProductCommitment = ({ product, supplier, session }) => PurchaseOrder.exists({
  supplier,
  status: { $nin: ['completed', 'cancelled', 'returned'] },
  items: {
    $elemMatch: {
      supplierProduct: product,
      supplierStockCommittedQuantity: { $gt: 0 },
      supplierStockCommitmentReleased: { $ne: true }
    }
  }
}).session(session);

const updateProduct = async (req, res) => {
  let product;
  let previousValue;
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });

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

    await mongoose.connection.transaction(async session => {
      product = await SupplierProduct.findOne({ _id: req.params.id, supplier: supplier._id }).session(session);
      if (!product) throw createHttpError('Product not found.', 404);
      previousValue = { price: product.wholesalePrice, stock: product.availableStock };
      Object.assign(product, updates);

      if (product.itemType === 'live_pet') {
        const requestedStock = req.body.availableStock;
        if (requestedStock !== undefined && ![0, 1].includes(Number(requestedStock))) {
          throw createHttpError('A live pet availability must be zero or one.', 400);
        }
        const pet = product.pet
          ? await Pet.findOne({
              _id: product.pet,
              sourceSupplier: supplier._id,
              listingContext: 'supplier_catalog'
            }).session(session)
          : null;
        const reservedPurchaseOrder = pet?.procurementReservation?.purchaseOrder;
        if (reservedPurchaseOrder && requestedStock !== undefined && Number(requestedStock) !== 0) {
          throw createHttpError('A live pet reserved by an active purchase order cannot be made available through a catalog edit.', 409);
        }
        product.availableStock = reservedPurchaseOrder
          ? 0
          : (requestedStock === undefined ? product.availableStock : Number(requestedStock));

        if (req.body.pet && pet) {
          const editablePetFields = ['name', 'species', 'breed', 'age', 'ageUnit', 'birthday', 'gender', 'size', 'color', 'description', 'dewormed', 'spayedNeutered', 'healthCondition', 'vaccinationStatus', 'healthNotes', 'vetRecords', 'proofOfOwnership', 'pcciRegistration'];
          editablePetFields.forEach(field => { if (req.body.pet[field] !== undefined) pet[field] = req.body.pet[field]; });
          if (req.body.images) pet.images = req.body.images;
          if (req.body.wholesalePrice !== undefined) pet.price = req.body.wholesalePrice;
        }
        if (pet) {
          if (reservedPurchaseOrder) {
            pet.status = 'reserved';
            pet.isAvailable = false;
          } else if (!pet.acquiredThroughPurchaseOrder) {
            pet.status = product.availableStock === 1 ? 'available' : 'unavailable';
            pet.isAvailable = product.availableStock === 1;
          }
          await pet.save({ session });
        }
      }
      await product.save({ session });
    });

    await settleSupplierSecondaryEffects('Update supplier product', [
      () => SupplyChainLog.create({
        action: 'supplier_product_updated',
        performedBy: req.user._id,
        userRole: 'supplier',
        relatedEntity: { type: 'SupplierProduct', id: product._id },
        description: `Product "${product.name}" updated`,
        supplier: supplier._id,
        previousValue,
        newValue: { price: product.wholesalePrice, stock: product.availableStock }
      })
    ]);

    res.json(product);
  } catch (error) {
    console.error('Update supplier product error:', error);
    res.status(error.statusCode || (error.name === 'CastError' ? 400 : 500)).json({ message: error.message || 'Server error' });
  }
};

const deleteProduct = async (req, res) => {
  let product;
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });

    await mongoose.connection.transaction(async session => {
      product = await SupplierProduct.findOne({ _id: req.params.id, supplier: supplier._id }).session(session);
      if (!product) throw createHttpError('Product not found.', 404);

      const activeCommitment = await hasUnreleasedProductCommitment({
        product: product._id,
        supplier: supplier._id,
        session
      });
      if (activeCommitment) {
        throw createHttpError('This catalog item has an active procurement commitment and cannot be removed yet.', 409);
      }

      let pet = null;
      if (product.itemType === 'live_pet' && product.pet) {
        pet = await Pet.findOne({
          _id: product.pet,
          sourceSupplier: supplier._id,
          listingContext: 'supplier_catalog'
        }).session(session);
        if (pet?.procurementReservation?.purchaseOrder && !pet.acquiredThroughPurchaseOrder) {
          throw createHttpError('This live pet is reserved by a purchase order and cannot be removed from the catalog.', 409);
        }
      }

      product.isDeleted = true;
      product.isActive = false;
      if (pet && !pet.acquiredThroughPurchaseOrder) {
        pet.status = 'unavailable';
        pet.isAvailable = false;
        await pet.save({ session });
      }
      await product.save({ session });
    });

    await settleSupplierSecondaryEffects('Delete supplier product', [
      () => SupplyChainLog.create({
        action: 'supplier_product_removed',
        performedBy: req.user._id,
        userRole: 'supplier',
        relatedEntity: { type: 'SupplierProduct', id: product._id },
        description: `Product "${product.name}" removed from catalog`,
        supplier: supplier._id
      })
    ]);

    res.json({ message: 'Product removed.' });
  } catch (error) {
    console.error('Delete supplier product error:', error);
    res.status(error.statusCode || (error.name === 'CastError' ? 400 : 500)).json({ message: error.message || 'Server error' });
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
      .populate('items.supplierProduct', 'name sku images itemType pet')
      .populate('items.pet', 'name species breed age ageUnit gender size images healthCondition vaccinationStatus')
      .populate({
        path: 'receivingReport',
        populate: [
          { path: 'receivedBy', select: 'firstName lastName' },
          { path: 'resolutionSubmissions.decisionBy', select: 'firstName lastName' },
          { path: 'resolutionSubmissions.financialAdjustment.reviewedBy', select: 'firstName lastName' }
        ]
      })
      .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await PurchaseOrder.countDocuments(filter);

    res.json({
      orders: orders.map(sanitizeOrderReceivingReport),
      pagination: { page: parseInt(page), totalPages: Math.ceil(total / limit), total }
    });
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
      shipped: ['delivered']
    };

    if (!validTransitions[order.status]?.includes(status)) {
      return res.status(400).json({ message: `Cannot transition from "${order.status}" to "${status}".` });
    }
    if (status === 'confirmed' && order.paymentTiming === 'pay_now' && order.paymentStatus !== 'paid') {
      return res.status(409).json({ message: 'This pay-now purchase order must have a verified PayMongo payment before supplier acceptance.' });
    }
    if (status === 'cancelled' && order.paymentStatus === 'paid') {
      return res.status(409).json({ message: 'A paid purchase order cannot be cancelled without an authorized refund process.' });
    }
    if (status === 'cancelled' && (order.paymentStatus === 'pending' || order.paymentDetails?.sessionStatus === 'active')) {
      return res.status(409).json({ message: 'The store must cancel its active PayMongo session before this purchase order can be rejected.' });
    }

    if (status === 'cancelled') {
      let cancelledOrder;
      let cancelledSupplier;
      await mongoose.connection.transaction(async session => {
        cancelledSupplier = await Supplier.findOne({ user: req.user._id }).session(session);
        if (!cancelledSupplier) throw Object.assign(new Error('Supplier not found.'), { statusCode: 404 });
        cancelledOrder = await PurchaseOrder.findOne({
          _id: req.params.id,
          supplier: cancelledSupplier._id,
          isDeleted: false
        }).session(session);
        if (!cancelledOrder) throw Object.assign(new Error('Order not found.'), { statusCode: 404 });
        if (!['submitted', 'confirmed', 'processing'].includes(cancelledOrder.status)) {
          throw Object.assign(new Error(`Cannot transition from "${cancelledOrder.status}" to "cancelled".`), { statusCode: 409 });
        }
        if (cancelledOrder.paymentStatus === 'paid') {
          throw Object.assign(new Error('A paid purchase order cannot be cancelled without an authorized refund process.'), { statusCode: 409 });
        }
        if (cancelledOrder.paymentStatus === 'pending' || cancelledOrder.paymentDetails?.sessionStatus === 'active') {
          throw Object.assign(new Error('The store must cancel its active PayMongo session before this purchase order can be rejected.'), { statusCode: 409 });
        }

        await releasePurchaseOrderStock({ order: cancelledOrder, session });
        cancelledOrder.status = 'cancelled';
        if (supplierNotes) cancelledOrder.supplierNotes = supplierNotes;
        cancelledOrder.statusHistory.push({
          status: 'cancelled', changedBy: req.user._id,
          notes: supplierNotes || 'Status changed to cancelled', timestamp: new Date()
        });
        cancelledSupplier.performance.cancelledOrders += 1;
        const total = cancelledSupplier.performance.totalOrders || 1;
        cancelledSupplier.performance.reliabilityScore = Math.round(
          ((total - cancelledSupplier.performance.cancelledOrders) / total) * 100
        );
        await Promise.all([
          cancelledOrder.save({ session }),
          cancelledSupplier.save({ session })
        ]);
      });

      await Promise.allSettled([
        createNotification({
          recipient: cancelledOrder.seller,
          sender: req.user._id,
          type: 'purchase_order',
          title: 'Purchase Order Cancelled',
          message: `Your purchase order ${cancelledOrder.orderNumber} has been cancelled.`,
          relatedId: cancelledOrder._id,
          relatedModel: 'PurchaseOrder'
        }),
        SupplyChainLog.create({
          action: 'purchase_order_cancelled',
          performedBy: req.user._id,
          userRole: 'supplier',
          relatedEntity: { type: 'PurchaseOrder', id: cancelledOrder._id },
          description: `Purchase order ${cancelledOrder.orderNumber} status: ${order.status} → cancelled`,
          supplier: cancelledSupplier._id,
          previousValue: { status: order.status },
          newValue: { status: 'cancelled' }
        })
      ]);
      return res.json(cancelledOrder);
    }

    let transitionSupplier;
    let transitionOrder;
    let prevStatus;
    await mongoose.connection.transaction(async session => {
      transitionSupplier = await Supplier.findOne({ user: req.user._id }).session(session);
      if (!transitionSupplier) throw Object.assign(new Error('Supplier not found.'), { statusCode: 404 });
      transitionOrder = await PurchaseOrder.findOne({
        _id: req.params.id,
        supplier: transitionSupplier._id,
        isDeleted: false
      }).session(session);
      if (!transitionOrder) throw Object.assign(new Error('Order not found.'), { statusCode: 404 });
      if (!validTransitions[transitionOrder.status]?.includes(status) || status === 'cancelled') {
        throw Object.assign(new Error(`Cannot transition from "${transitionOrder.status}" to "${status}".`), { statusCode: 409 });
      }
      if (status === 'confirmed' && transitionOrder.paymentTiming === 'pay_now' && transitionOrder.paymentStatus !== 'paid') {
        throw Object.assign(new Error('This pay-now purchase order must have a verified PayMongo payment before supplier acceptance.'), { statusCode: 409 });
      }

      prevStatus = transitionOrder.status;
      transitionOrder.status = status;
      if (supplierNotes) transitionOrder.supplierNotes = supplierNotes;
      if (trackingNumber) transitionOrder.trackingNumber = trackingNumber;
      if (carrier) transitionOrder.carrier = carrier;
      if (estimatedDeliveryDate) transitionOrder.estimatedDeliveryDate = estimatedDeliveryDate;
      if (status === 'delivered') transitionOrder.actualDeliveryDate = new Date();
      if (status === 'delivered') {
        transitionOrder.inspectionStatus = 'awaiting_inspection';
        if (transitionOrder.paymentTiming === 'after_inspection' && transitionOrder.paymentStatus !== 'paid') {
          transitionOrder.paymentStatus = 'awaiting_inspection';
        }
      }

      transitionOrder.statusHistory.push({
        status, changedBy: req.user._id,
        notes: supplierNotes || `Status changed to ${status}`,
        timestamp: new Date()
      });

      await transitionOrder.save({ session });

      if (status === 'delivered') {
        transitionSupplier.performance.completedOrders += 1;
        transitionSupplier.performance.totalRevenue += transitionOrder.totalCost;
        const deliveryDays = Math.ceil((transitionOrder.actualDeliveryDate - transitionOrder.createdAt) / (1000 * 60 * 60 * 24));
        const totalCompleted = transitionSupplier.performance.completedOrders;
        transitionSupplier.performance.averageDeliveryDays = Math.round(
          ((transitionSupplier.performance.averageDeliveryDays * (totalCompleted - 1)) + deliveryDays) / totalCompleted
        );
        await transitionSupplier.save({ session });
      }
    });

    await Promise.allSettled([
      createNotification({
        recipient: transitionOrder.seller,
        sender: req.user._id,
        type: 'purchase_order',
        title: `Purchase Order ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        message: `Your purchase order ${transitionOrder.orderNumber} has been ${status}.`,
        relatedId: transitionOrder._id,
        relatedModel: 'PurchaseOrder'
      }),
      SupplyChainLog.create({
        action: `purchase_order_${status}`,
        performedBy: req.user._id,
        userRole: 'supplier',
        relatedEntity: { type: 'PurchaseOrder', id: transitionOrder._id },
        description: `Purchase order ${transitionOrder.orderNumber} status: ${prevStatus} → ${status}`,
        supplier: transitionSupplier._id,
        previousValue: { status: prevStatus },
        newValue: { status }
      })
    ]);

    res.json(transitionOrder);
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(error.statusCode || (error.name === 'CastError' ? 400 : 500)).json({
      message: error.message || 'Unable to update this purchase order.'
    });
  }
};

const submitOrderResolution = async (req, res) => {
  let result;
  try {
    const type = req.body.type;
    if (!['replacement', 'return_correction', 'refund_credit'].includes(type)) {
      return res.status(400).json({ message: 'Resolution type must be replacement, return/correction, or refund/credit.' });
    }
    const proposedAmount = Number(req.body.proposedAmount);
    if (type === 'refund_credit' && (!Number.isFinite(proposedAmount) || proposedAmount <= 0)) {
      return res.status(400).json({ message: 'A positive proposed refund/credit amount is required for Finance review.' });
    }

    await mongoose.connection.transaction(async session => {
      const supplier = await Supplier.findOne({ user: req.user._id }).session(session);
      if (!supplier) throw createHttpError('Supplier not found.', 404);
      const order = await PurchaseOrder.findOne({
        _id: req.params.id,
        supplier: supplier._id,
        isDeleted: false
      }).session(session);
      if (!order) throw createHttpError('Purchase order not found.', 404);
      const report = await ProcurementReceivingReport.findOne({
        purchaseOrder: order._id,
        supplier: supplier._id,
        store: order.store
      }).session(session);
      if (!report || report.processingStatus !== 'completed') {
        throw createHttpError('A completed receiving report is required before a resolution can be submitted.', 409);
      }
      if (!['pending_supplier_resolution', 'resolution_rejected'].includes(report.resolutionStatus)) {
        throw createHttpError(`A resolution cannot be submitted while the report is "${report.resolutionStatus}".`, 409);
      }

      const rows = Array.isArray(req.body.items) ? req.body.items : [];
      if (!rows.length || rows.length > order.items.length) {
        throw createHttpError('At least one affected purchase-order line is required.', 400);
      }
      const unresolved = new Map(getResolutionQuantities(report).map(row => [String(row.purchaseOrderItem), row.unresolvedQuantity]));
      const seen = new Set();
      const items = [];
      for (const row of rows) {
        const id = String(row.purchaseOrderItem || row.itemId || '');
        const proposedQuantity = Number(row.proposedQuantity ?? row.quantity);
        const available = Number(unresolved.get(id) || 0);
        if (!id || seen.has(id) || !Number.isInteger(proposedQuantity) || proposedQuantity < 1 || proposedQuantity > available) {
          throw createHttpError('Resolution quantities must be whole numbers within each line\'s unresolved quantity.', 400);
        }
        const orderItem = order.items.id(id);
        if (!orderItem) throw createHttpError('A resolution item does not belong to this purchase order.', 400);
        if (orderItem.itemType === 'live_pet' && type !== 'refund_credit') {
          throw createHttpError('Exact live-pet procurement cannot use quantity-based replacement or correction. Submit a refund/credit proposal for authorized review.', 409);
        }
        seen.add(id);
        items.push({ purchaseOrderItem: orderItem._id, unresolvedQuantity: available, proposedQuantity });
      }

      report.resolutionSubmissions.push({
        type,
        items,
        notes: req.body.notes,
        submittedBy: req.user._id,
        status: 'submitted',
        ...(type === 'refund_credit' ? {
          financialProposal: {
            adjustmentType: req.body.adjustmentType === 'refund' ? 'refund' : 'credit',
            proposedAmount
          },
          financialAdjustment: { status: 'not_required' }
        } : {})
      });
      const savedSubmission = report.resolutionSubmissions[report.resolutionSubmissions.length - 1];
      report.resolutionStatus = 'resolution_submitted';
      report.resolutionHistory.push({
        status: 'resolution_submitted',
        action: 'supplier_resolution_submitted',
        actor: req.user._id,
        actorRole: req.user.role,
        resolutionSubmission: savedSubmission._id,
        notes: req.body.notes
      });
      order.status = 'resolution_submitted';
      order.statusHistory.push({ status: 'resolution_submitted', changedBy: req.user._id, notes: `Supplier proposed ${type}.` });
      await Promise.all([report.save({ session }), order.save({ session })]);
      result = { supplier, order, report, savedSubmission };
    });

    await settleSupplierSecondaryEffects('Submit supplier resolution', [
      createNotification({
        recipient: result.order.seller,
        sender: req.user._id,
        type: 'purchase_order',
        title: 'Supplier Resolution Submitted',
        message: `A ${type.replaceAll('_', ' ')} resolution was submitted for ${result.order.orderNumber}.`,
        relatedId: result.order._id,
        relatedModel: 'PurchaseOrder'
      }),
      SupplyChainLog.create({
        action: 'purchase_order_resolution_submitted',
        performedBy: req.user._id,
        userRole: req.user.role,
        relatedEntity: { type: 'PurchaseOrder', id: result.order._id },
        description: `Supplier submitted ${type} resolution for ${result.order.orderNumber}.`,
        store: result.order.store,
        supplier: result.supplier._id,
        metadata: { receivingReport: result.report._id, resolutionSubmission: result.savedSubmission._id }
      })
    ]);
    res.status(201).json({
      order: result.order,
      receivingReport: sanitizeReceivingReport(result.report),
      resolution: result.savedSubmission
    });
  } catch (error) {
    console.error('Submit supplier resolution error:', error);
    res.status(error.statusCode || (error.name === 'CastError' ? 400 : 500)).json({
      message: error.name === 'CastError' ? 'Invalid purchase order.' : (error.message || 'Unable to submit the supplier resolution.')
    });
  }
};

const markResolutionDelivered = async (req, res) => {
  let result;
  try {
    await mongoose.connection.transaction(async session => {
      const supplier = await Supplier.findOne({ user: req.user._id }).session(session);
      if (!supplier) throw createHttpError('Supplier not found.', 404);
      const order = await PurchaseOrder.findOne({
        _id: req.params.id,
        supplier: supplier._id,
        isDeleted: false
      }).session(session);
      if (!order) throw createHttpError('Purchase order not found.', 404);
      const report = await ProcurementReceivingReport.findOne({
        purchaseOrder: order._id,
        supplier: supplier._id,
        store: order.store
      }).session(session);
      const submission = report?.resolutionSubmissions?.id(req.params.resolutionId);
      if (!submission) throw createHttpError('Resolution submission not found.', 404);
      if (!['replacement', 'return_correction'].includes(submission.type)
          || submission.status !== 'awaiting_replacement'
          || report.resolutionStatus !== 'awaiting_replacement') {
        throw createHttpError('This resolution is not awaiting a replacement/corrected delivery.', 409);
      }
      submission.status = 'replacement_delivered';
      submission.replacementDeliveredBy = req.user._id;
      submission.replacementDeliveredAt = new Date();
      submission.replacementNotes = req.body.notes;
      report.resolutionStatus = 'reinspection';
      report.resolutionHistory.push({
        status: 'reinspection', action: 'replacement_delivery_reported', actor: req.user._id,
        actorRole: req.user.role, resolutionSubmission: submission._id, notes: req.body.notes
      });
      order.status = 'reinspection';
      order.inspectionStatus = 'reinspection';
      order.statusHistory.push({ status: 'reinspection', changedBy: req.user._id, notes: req.body.notes || 'Supplier reported replacement/correction delivery.' });
      await Promise.all([report.save({ session }), order.save({ session })]);
      result = { order, report };
    });
    await settleSupplierSecondaryEffects('Mark supplier resolution delivered', [createNotification({
      recipient: result.order.seller,
      sender: req.user._id,
      type: 'purchase_order',
      title: 'Replacement Ready for Reinspection',
      message: `The supplier reported the resolution delivery for ${result.order.orderNumber}. Store receiving staff must reinspect it.`,
      relatedId: result.order._id,
      relatedModel: 'PurchaseOrder'
    })]);
    res.json({ order: result.order, receivingReport: sanitizeReceivingReport(result.report) });
  } catch (error) {
    console.error('Mark resolution delivered error:', error);
    res.status(error.statusCode || (error.name === 'CastError' ? 400 : 500)).json({
      message: error.name === 'CastError' ? 'Invalid resolution.' : (error.message || 'Unable to report the resolution delivery.')
    });
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
    const products = await SupplierProduct.find(filter).populate('pet').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
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

    await settleSupplierSecondaryEffects('Admin supplier lifecycle update', [
      createNotification({
        recipient: supplier.user,
        sender: req.user._id,
        type: 'supplier_verification',
        title: `Supplier Account ${actionLabels[action]}`,
        message: actionMessages[action],
        relatedId: supplier._id,
        relatedModel: 'Supplier'
      }),
      sendSupplierApplicationUpdate({
        email: supplier.email, contactPerson: supplier.contactPerson,
        businessName: supplier.businessName,
        status: action === 'verify' ? 'approved' : action === 'request_resubmission' ? 'resubmission_required' : action,
        reason
      }),
      SupplyChainLog.create({
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
      })
    ]);

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
    await settleSupplierSecondaryEffects('Admin supplier deactivation', [
      SupplyChainLog.create({
        action: 'supplier_deactivated',
        performedBy: req.user._id,
        userRole: req.user.role,
        relatedEntity: { type: 'Supplier', id: supplier._id },
        description: `Supplier "${supplier.businessName}" deactivated`,
        supplier: supplier._id,
        previousValue: transition.previous,
        newValue: transition.current,
        metadata: { productAvailabilityPreserved: true }
      })
    ]);
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
  getSupplierOrders, updateOrderStatus, submitOrderResolution, markResolutionDelivered,
  browseSuppliers, getSupplierCatalog,
  adminGetAllSuppliers, adminVerifySupplier, adminGetSupplierDetails,
  adminUpdateSupplier, adminDeactivateSupplier
};
