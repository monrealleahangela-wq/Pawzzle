const crypto = require('crypto');
const mongoose = require('mongoose');
const Supplier = require('../models/Supplier');
const SupplierProduct = require('../models/SupplierProduct');
const SupplierProductVariant = require('../models/SupplierProductVariant');
const Product = require('../models/Product');
const ServiceSupply = require('../models/ServiceSupply');
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
const { supplierProductDuplicateResponse } = require('../utils/supplierProductDuplicate');
const { claimSku, releaseSku, replaceSkuClaim } = require('../services/skuClaimService');
const {
  assertSupplierVariantWritesEnabled,
  featureRequested,
  getSupplierVariantReadiness
} = require('../services/supplierVariantReadinessService');
const {
  FDA_REVIEW_CATEGORIES,
  withPublishedSupplierProduct,
  isSupplierProductPublished,
  hasReviewedContentUpdate,
  requiresFdaComplianceReview,
  buildSupplierProductApprovalState
} = require('../utils/supplierProductApproval');
const {
  getSelectableSupplierFilterForStore,
  isSupplierAvailable,
  isSupplierSelectableForStore,
  applySupplierLifecycleAction
} = require('../utils/supplierLifecycle');

const REQUIRED_PLATFORM_DOCUMENTS = ['business_registration', 'bir_certificate'];
const SUPPLIER_GOODS_TYPES = ['live_pets', 'pet_supplies', 'general_products'];

const normalizeStringList = value => (Array.isArray(value) ? value : [])
  .map(item => String(item || '').trim()).filter(Boolean).slice(0, 20);

const normalizeRegulatoryDocuments = value => (Array.isArray(value) ? value : [])
  .filter(document => document && typeof document === 'object' && String(document.documentUrl || '').trim())
  .slice(0, 10)
  .map(document => ({
    documentType: String(document.documentType || 'supporting_document').trim().slice(0, 80),
    documentUrl: String(document.documentUrl).trim(),
    originalName: String(document.originalName || '').trim().slice(0, 160),
    uploadedAt: document.uploadedAt || new Date()
  }));

const createHttpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const validateFdaComplianceDetails = ({ category, fdaRegistrationNumber, regulatoryDocuments }) => {
  if (!requiresFdaComplianceReview(category)) return;
  if (!String(fdaRegistrationNumber || '').trim()) {
    throw createHttpError('An FDA product registration number is required for food and medicine supplies.', 400);
  }
  if (!Array.isArray(regulatoryDocuments) || regulatoryDocuments.length === 0) {
    throw createHttpError('Upload at least one FDA registration or product compliance document.', 400);
  }
};

const applySupplierProductApprovalState = (product, actor) => {
  const { reviewHistory, ...state } = buildSupplierProductApprovalState({
    category: product.category,
    actor
  });
  Object.assign(product, state);
  if (reviewHistory.length) product.reviewHistory.push(...reviewHistory);
};

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

const notifyStoresOfUnavailableOffer = async product => {
  const linkedProducts = await Product.find({
    isDeleted: { $ne: true },
    $or: [
      { supplierProductRef: product._id },
      { 'procurementOffers.supplierProduct': product._id }
    ]
  }).select('name store supplierProductRef procurementOffers');
  const linkedSupplies = await ServiceSupply.find({
    isDeleted: { $ne: true },
    $or: [
      { supplierProduct: product._id },
      { 'supplierOffers.supplierProduct': product._id }
    ]
  }).select('name store supplierProduct supplierOffers');
  const targets = [
    ...linkedProducts.map(target => ({ target, primary: target.supplierProductRef, offers: target.procurementOffers || [] })),
    ...linkedSupplies.map(target => ({ target, primary: target.supplierProduct, offers: target.supplierOffers || [] }))
  ];
  await Promise.all(targets.map(async ({ target, primary, offers }) => {
    const store = await Store.findById(target.store).select('owner');
    if (!store?.owner) return;
    const alternativeIds = offers.map(offer => offer.supplierProduct)
      .filter(id => String(id) !== String(product._id));
    if (primary && String(primary) !== String(product._id)) {
      alternativeIds.push(primary);
    }
    const candidates = alternativeIds.length
      ? await SupplierProduct.find(withPublishedSupplierProduct({ _id: { $in: alternativeIds }, isActive: true, isDeleted: false,
        $expr: { $gte: ['$availableStock', '$minimumOrderQuantity'] } })).select('supplier') : [];
    const suppliers = candidates.length ? await Supplier.find({ _id: { $in: candidates.map(item => item.supplier) } }) : [];
    const hasAlternative = suppliers.some(candidate => isSupplierSelectableForStore(candidate, store._id));
    await createNotification({
      recipient: store.owner,
      type: 'supply_alert',
      title: 'Supplier offer unavailable',
      message: `${product.name} is no longer available from one supplier for ${target.name}.${hasAlternative ? ' An eligible alternative offer is available for review.' : ''}`,
      relatedId: store._id,
      relatedModel: 'Store',
      targetUrl: '/admin/purchase-orders?tab=suppliers',
      dedupeKey: `offer-unavailable:${store._id}:${target._id}:${product._id}:${product.updatedAt.getTime()}`
    });
  }));
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
    status: 'unavailable',
    isAvailable: false,
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

    const products = await SupplierProduct.countDocuments(withPublishedSupplierProduct({ supplier: supplier._id, isActive: true, isDeleted: false }));
    const pendingProducts = await SupplierProduct.countDocuments({
      supplier: supplier._id,
      requiresPlatformReview: true,
      approvalStatus: 'pending_review',
      category: { $in: FDA_REVIEW_CATEGORIES },
      isDeleted: false
    });
    const totalStock = await SupplierProduct.aggregate([
      { $match: withPublishedSupplierProduct({ supplier: supplier._id, isActive: true, isDeleted: false }) },
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
        pendingProducts,
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
  let requestedItemType = 'pet_supply';
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });
    if (!isSupplierAvailable(supplier)) return res.status(403).json({ message: 'Only active verified suppliers can add products.' });

    const { name, sku, description, category, images, wholesalePrice, retailPrice,
      availableStock, minimumOrderQuantity, unitOfMeasure, deliveryLeadTimeDays,
      brand, specifications, weight, dimensions, expirationDate, ingredients,
      nutritionalInformation, intendedSpecies, safetyNotes, regulatoryDocuments,
      fdaRegistrationNumber, fdaRegistrationExpiry } = req.body;
    const itemType = ['pet_supply', 'product', 'live_pet'].includes(req.body.itemType)
      ? req.body.itemType : 'pet_supply';
    requestedItemType = itemType;

    if (!name || !sku || !category || wholesalePrice === undefined) {
      return res.status(400).json({ message: 'Name, SKU, category, and wholesale price are required.' });
    }

    const authoritativeCategory = itemType === 'live_pet' ? 'live_pets' : category;
    if (itemType !== 'live_pet' && category === 'live_pets') {
      return res.status(400).json({ message: 'The live-pets category is reserved for exact live-pet catalog records.' });
    }
    if (['pet_food', 'pet_treats'].includes(authoritativeCategory)
        && (!String(ingredients || '').trim() || !String(nutritionalInformation || '').trim())) {
      return res.status(400).json({ message: 'Ingredients and nutritional information are required for pet food and treats.' });
    }
    const normalizedRegulatoryDocuments = normalizeRegulatoryDocuments(regulatoryDocuments);
    validateFdaComplianceDetails({
      category: authoritativeCategory,
      fdaRegistrationNumber,
      regulatoryDocuments: normalizedRegulatoryDocuments
    });
    const approvalState = buildSupplierProductApprovalState({
      category: authoritativeCategory,
      actor: req.user._id
    });
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
        pet: pet?._id,
        name, sku, description, category: authoritativeCategory, images: images || [],
        wholesalePrice, retailPrice: retailPrice || 0,
        availableStock: itemType === 'live_pet' ? 1 : (availableStock || 0),
        minimumOrderQuantity: itemType === 'live_pet' ? 1 : (minimumOrderQuantity || 1),
        unitOfMeasure: itemType === 'live_pet' ? 'piece' : (unitOfMeasure || 'piece'),
        deliveryLeadTimeDays: deliveryLeadTimeDays || 3,
        brand, specifications, weight, dimensions, expirationDate,
        ingredients, nutritionalInformation,
        intendedSpecies: normalizeStringList(intendedSpecies), safetyNotes,
        fdaRegistrationNumber: String(fdaRegistrationNumber || '').trim(),
        fdaRegistrationExpiry: fdaRegistrationExpiry || undefined,
        regulatoryDocuments: normalizedRegulatoryDocuments,
        ...approvalState
      });
      await product.save({ session });
      await Supplier.updateOne({ _id: supplier._id }, {
        $addToSet: { goodsTypes: inferSupplierGoodsType(itemType) }
      }, { session });
    };

    const variantRegistryReady = featureRequested()
      ? (await getSupplierVariantReadiness()).enabled
      : false;
    const persistWithSkuClaim = () => mongoose.connection.transaction(async session => {
      await persistCatalogEntry(session);
      await claimSku({
        namespaceType: 'supplier', owner: supplier._id, sku: product.sku,
        entityType: 'supplier_product', entity: product._id, session
      });
    });
    if (itemType === 'live_pet') {
      if (variantRegistryReady) await persistWithSkuClaim();
      else await mongoose.connection.transaction(persistCatalogEntry);
    } else if (variantRegistryReady) {
      await persistWithSkuClaim();
    } else {
      await persistCatalogEntry(null);
    }

    const requiresFdaReview = requiresFdaComplianceReview(authoritativeCategory);
    await settleSupplierSecondaryEffects('Add supplier product', [
      () => SupplyChainLog.create({
        action: requiresFdaReview ? 'supplier_product_submitted' : 'supplier_product_added',
        performedBy: req.user._id,
        userRole: 'supplier',
        relatedEntity: { type: 'SupplierProduct', id: product._id },
        description: requiresFdaReview
          ? `Supply "${name}" (SKU: ${sku}) submitted for internal FDA compliance review`
          : `Supply "${name}" (SKU: ${sku}) published; FDA review is not required for this category`,
        supplier: supplier._id
      })
    ]);

    res.status(201).json(product);
  } catch (error) {
    const duplicate = supplierProductDuplicateResponse(error, { itemType: requestedItemType });
    if (duplicate) return res.status(duplicate.status).json({ code: duplicate.code, message: duplicate.message });
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
    const products = await SupplierProduct.find(filter).select('+regulatoryDocuments.documentUrl +fdaRegistrationNumber +fdaRegistrationExpiry').populate('pet').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const variantParents = products.filter(product => product.productMode === 'variant').map(product => product._id);
    const childVariants = variantParents.length
      ? await SupplierProductVariant.find({ supplierProduct: { $in: variantParents } })
        .select('+regulatoryReview.reviewedBy').sort({ createdAt: 1 }).lean()
      : [];
    const variantsByParent = childVariants.reduce((map, variant) => {
      const key = String(variant.supplierProduct);
      if (!map[key]) map[key] = [];
      map[key].push(variant);
      return map;
    }, {});
    const serializedProducts = products.map(product => ({
      ...product.toObject(),
      variants: variantsByParent[String(product._id)] || []
    }));
    const total = await SupplierProduct.countDocuments(filter);

    res.json({ products: serializedProducts, pagination: { page: parseInt(page), totalPages: Math.ceil(total / limit), total } });
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
  let reviewedContentChanged = false;
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });

    const mutableFields = [
      'name', 'sku', 'description', 'category', 'images', 'wholesalePrice',
      'retailPrice', 'availableStock', 'minimumOrderQuantity', 'unitOfMeasure',
      'deliveryLeadTimeDays', 'brand', 'specifications', 'weight', 'dimensions',
      'expirationDate', 'ingredients', 'nutritionalInformation', 'intendedSpecies',
      'safetyNotes', 'fdaRegistrationNumber', 'fdaRegistrationExpiry',
      'regulatoryDocuments', 'isActive'
    ];
    const updates = {};
    mutableFields.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });
    if (updates.intendedSpecies !== undefined) updates.intendedSpecies = normalizeStringList(updates.intendedSpecies);
    if (updates.fdaRegistrationNumber !== undefined) updates.fdaRegistrationNumber = String(updates.fdaRegistrationNumber || '').trim();
    if (updates.regulatoryDocuments !== undefined) updates.regulatoryDocuments = normalizeRegulatoryDocuments(updates.regulatoryDocuments);

    const variantRegistryReady = featureRequested()
      ? (await getSupplierVariantReadiness()).enabled
      : false;
    await mongoose.connection.transaction(async session => {
      product = await SupplierProduct.findOne({ _id: req.params.id, supplier: supplier._id })
        .select('+regulatoryDocuments.documentUrl +fdaRegistrationNumber +fdaRegistrationExpiry').session(session);
      if (!product) throw createHttpError('Product not found.', 404);
      if (product.productMode === 'variant') await assertSupplierVariantWritesEnabled();
      reviewedContentChanged = hasReviewedContentUpdate(req.body, product);
      previousValue = { sku: product.sku, price: product.wholesalePrice, stock: product.availableStock,
        minimumOrderQuantity: product.minimumOrderQuantity, isActive: product.isActive,
        approvalStatus: product.approvalStatus, published: isSupplierProductPublished(product) };
      Object.assign(product, updates);

      if (variantRegistryReady && updates.sku !== undefined && String(previousValue?.sku || product.sku) !== String(updates.sku)) {
        await replaceSkuClaim({
          namespaceType: 'supplier', owner: supplier._id,
          previousSku: previousValue.sku, nextSku: updates.sku,
          entityType: 'supplier_product', entity: product._id, session
        });
      }

      if (['pet_food', 'pet_treats'].includes(product.category)
          && (!String(product.ingredients || '').trim() || !String(product.nutritionalInformation || '').trim())) {
        throw createHttpError('Ingredients and nutritional information are required for pet food and treats.', 400);
      }
      if (reviewedContentChanged) {
        validateFdaComplianceDetails({
          category: product.category,
          fdaRegistrationNumber: product.fdaRegistrationNumber,
          regulatoryDocuments: product.regulatoryDocuments
        });
        applySupplierProductApprovalState(product, req.user._id);
      }
      if (product.productMode === 'variant'
          && reviewedContentChanged
          && requiresFdaComplianceReview(product.category)) {
        await SupplierProductVariant.updateMany({ supplierProduct: product._id }, {
          $set: {
            'regulatoryReview.scope': 'variant',
            'regulatoryReview.status': 'pending_review',
            'regulatoryReview.submittedAt': new Date(),
            'regulatoryReview.reason': ''
          },
          $unset: {
            'regulatoryReview.reviewedAt': 1,
            'regulatoryReview.reviewedBy': 1
          }
        }, { session });
      }

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
          } else if (!pet.acquiredThroughPurchaseOrder && !isSupplierProductPublished(product)) {
            pet.status = 'unavailable';
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
        action: reviewedContentChanged && requiresFdaComplianceReview(product)
          ? 'supplier_product_submitted'
          : 'supplier_product_updated',
        performedBy: req.user._id,
        userRole: 'supplier',
        relatedEntity: { type: 'SupplierProduct', id: product._id },
        description: reviewedContentChanged && requiresFdaComplianceReview(product)
          ? `Supply "${product.name}" submitted for internal FDA compliance review`
          : reviewedContentChanged
            ? `Supply "${product.name}" updated and published; FDA review is not required for this category`
            : `Product "${product.name}" updated`,
        supplier: supplier._id,
        previousValue,
        newValue: { price: product.wholesalePrice, stock: product.availableStock }
      }),
      previousValue.stock >= previousValue.minimumOrderQuantity && previousValue.isActive !== false
        && (product.availableStock < product.minimumOrderQuantity || product.isActive === false
          || (previousValue.published && !isSupplierProductPublished(product)))
        ? () => notifyStoresOfUnavailableOffer(product) : null
    ]);

    res.json(product);
  } catch (error) {
    const duplicate = supplierProductDuplicateResponse(error, { itemType: product?.itemType });
    if (duplicate) return res.status(duplicate.status).json({ code: duplicate.code, message: duplicate.message });
    console.error('Update supplier product error:', error);
    res.status(error.statusCode || (error.name === 'CastError' ? 400 : 500)).json({ message: error.message || 'Server error' });
  }
};

const deleteProduct = async (req, res) => {
  let product;
  try {
    const supplier = await Supplier.findOne({ user: req.user._id });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });
    const variantRegistryReady = featureRequested()
      ? (await getSupplierVariantReadiness()).enabled
      : false;

    await mongoose.connection.transaction(async session => {
      product = await SupplierProduct.findOne({ _id: req.params.id, supplier: supplier._id }).session(session);
      if (!product) throw createHttpError('Product not found.', 404);
      if (product.productMode === 'variant') await assertSupplierVariantWritesEnabled();
      if (product.isDeleted) throw createHttpError('Product was already removed.', 409);

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
      if (variantRegistryReady) {
        await releaseSku({
          entityType: 'supplier_product', entity: product._id,
          reason: 'Supplier product archived', session
        });
      }
    });

    await settleSupplierSecondaryEffects('Delete supplier product', [
      () => SupplyChainLog.create({
        action: 'supplier_product_removed',
        performedBy: req.user._id,
        userRole: 'supplier',
        relatedEntity: { type: 'SupplierProduct', id: product._id },
        description: `Product "${product.name}" removed from catalog`,
        supplier: supplier._id
      }),
      () => notifyStoresOfUnavailableOffer(product)
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
    const publishedFilter = withPublishedSupplierProduct(filter);
    const products = await SupplierProduct.find(publishedFilter).populate('pet').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await SupplierProduct.countDocuments(publishedFilter);

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

const adminGetProductReviews = async (req, res) => {
  try {
    const { status, search, itemType, category, page = 1, limit = 30 } = req.query;
    const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 30));
    const filter = {
      requiresPlatformReview: true,
      category: { $in: FDA_REVIEW_CATEGORIES },
      isDeleted: false
    };
    if (status) filter.approvalStatus = status;
    if (itemType) filter.itemType = itemType;
    if (category) filter.category = FDA_REVIEW_CATEGORIES.includes(category)
      ? category
      : { $in: [] };
    if (search) filter.$or = [
      { name: { $regex: String(search).slice(0, 80), $options: 'i' } },
      { sku: { $regex: String(search).slice(0, 80), $options: 'i' } }
    ];

    const [products, total, statusCounts] = await Promise.all([
      SupplierProduct.find(filter)
        .select('+regulatoryDocuments.documentUrl +fdaRegistrationNumber +fdaRegistrationExpiry')
        .populate('supplier', 'businessName status isActive supplierType contactPerson email')
        .populate('reviewedBy', 'firstName lastName')
        .populate('pet')
        .sort({ submittedAt: -1, createdAt: -1 })
        .skip((safePage - 1) * safeLimit).limit(safeLimit),
      SupplierProduct.countDocuments(filter),
      SupplierProduct.aggregate([
        { $match: { requiresPlatformReview: true, category: { $in: FDA_REVIEW_CATEGORIES }, isDeleted: false } },
        { $group: { _id: '$approvalStatus', count: { $sum: 1 } } }
      ])
    ]);

    res.json({
      products,
      counts: Object.fromEntries(statusCounts.map(row => [row._id, row.count])),
      pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
    });
  } catch (error) {
    console.error('Admin get product reviews error:', error);
    res.status(500).json({ message: 'Unable to load supply reviews.' });
  }
};

const adminReviewProduct = async (req, res) => {
  const actionMap = {
    approve: { status: 'approved', logAction: 'supplier_product_approved', label: 'approved' },
    request_changes: { status: 'changes_requested', logAction: 'supplier_product_changes_requested', label: 'changes requested' },
    reject: { status: 'rejected', logAction: 'supplier_product_rejected', label: 'rejected' }
  };
  const review = actionMap[req.body.action];
  const reason = String(req.body.reason || '').trim();
  if (!review) return res.status(400).json({ message: 'Choose approve, request_changes, or reject.' });
  if (req.body.action !== 'approve' && !reason) {
    return res.status(400).json({ message: 'A review reason is required when requesting changes or rejecting a supply.' });
  }

  let product;
  let supplier;
  try {
    await mongoose.connection.transaction(async session => {
      product = await SupplierProduct.findOne({
        _id: req.params.id,
        requiresPlatformReview: true,
        category: { $in: FDA_REVIEW_CATEGORIES },
        approvalStatus: 'pending_review',
        isDeleted: false
      }).select('+regulatoryDocuments.documentUrl +fdaRegistrationNumber +fdaRegistrationExpiry').session(session);
      if (!product) throw createHttpError('This regulated supply is not awaiting FDA compliance review or was already reviewed.', 409);

      supplier = await Supplier.findById(product.supplier).session(session);
      if (!supplier) throw createHttpError('Supplier not found.', 404);
      if (req.body.action === 'approve') {
        validateFdaComplianceDetails({
          category: product.category,
          fdaRegistrationNumber: product.fdaRegistrationNumber,
          regulatoryDocuments: product.regulatoryDocuments
        });
      }
      if (req.body.action === 'approve' && !isSupplierAvailable(supplier)) {
        throw createHttpError('Verify and activate the supplier account before accepting its FDA compliance evidence.', 409);
      }

      product.approvalStatus = review.status;
      product.reviewedAt = new Date();
      product.reviewedBy = req.user._id;
      product.reviewReason = reason;
      product.publishedAt = review.status === 'approved' ? new Date() : undefined;
      product.reviewHistory.push({ status: review.status, actor: req.user._id, reason });
      await product.save({ session });

      if (product.itemType === 'live_pet' && product.pet) {
        const pet = await Pet.findOne({
          _id: product.pet,
          sourceSupplier: supplier._id,
          listingContext: 'supplier_catalog'
        }).session(session);
        if (pet && !pet.acquiredThroughPurchaseOrder && !pet.procurementReservation?.purchaseOrder) {
          const publishPet = review.status === 'approved' && Number(product.availableStock) === 1 && product.isActive;
          pet.status = publishPet ? 'available' : 'unavailable';
          pet.isAvailable = publishPet;
          await pet.save({ session });
        }
      }

      await SupplyChainLog.create([{
        action: review.logAction,
        performedBy: req.user._id,
        userRole: req.user.role,
        relatedEntity: { type: 'SupplierProduct', id: product._id },
        description: `FDA compliance evidence for "${product.name}" ${review.label}${reason ? ` (${reason})` : ''}`,
        supplier: supplier._id,
        metadata: { approvalStatus: review.status }
      }], { session });
    });

    await settleSupplierSecondaryEffects('Admin FDA compliance review', [
      createNotification({
        recipient: supplier.user,
        sender: req.user._id,
        type: 'supplier_product_review',
        title: `FDA Compliance ${req.body.action === 'request_changes' ? 'Changes Requested' : review.label.replace(/^./, value => value.toUpperCase())}`,
        message: req.body.action === 'approve'
          ? `${product.name}'s submitted FDA details were verified by Pawzzle and the supply is now published to verified stores.`
          : `${product.name}'s FDA compliance submission was ${review.label}. Reason: ${reason}`,
        relatedId: product._id,
        relatedModel: 'SupplierProduct',
        targetUrl: '/supplier/dashboard?tab=products'
      }),
      review.status !== 'approved' ? () => notifyStoresOfUnavailableOffer(product) : null
    ]);

    res.json(product);
  } catch (error) {
    console.error('Admin review product error:', error);
    res.status(error.statusCode || (error.name === 'CastError' ? 400 : 500)).json({
      message: error.statusCode ? error.message : error.name === 'CastError' ? 'Invalid supply.' : 'Unable to review supply.'
    });
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
      SupplierProduct.find({ supplier: supplier._id, isDeleted: false }).select('name sku category wholesalePrice availableStock isActive approvalStatus requiresPlatformReview reviewReason').sort({ createdAt: -1 }).limit(20),
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
  adminGetAllSuppliers, adminGetProductReviews, adminReviewProduct,
  adminVerifySupplier, adminGetSupplierDetails,
  adminUpdateSupplier, adminDeactivateSupplier
};
