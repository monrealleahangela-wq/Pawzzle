const { validationResult } = require('express-validator');
const Store = require('../models/Store');
const StoreApplication = require('../models/StoreApplication');
const Pet = require('../models/Pet');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const Follow = require('../models/Follow');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const DeliveryFeeRule = require('../models/DeliveryFeeRule');
const DeliveryFeeService = require('../services/deliveryFeeService');
const {
  validateRuleInput,
  calculateRulePreview
} = require('../services/deliveryPricingConfigurationService');
const { TAX_STATUSES, PRICING_MODES, normalizeTaxConfiguration } = require('../utils/taxCalculator');
const { POLICY_TYPES, normalizeRefundPolicy } = require('../utils/refundPolicy');
const { isPlatformAdmin, isStoreAdmin, isOperationalStaff } = require('../config/permissions');
const { buildStoreOperationsSnapshot } = require('../services/operationsDashboardService');
const { createNotification } = require('./notificationController');
const {
  CUSTOMER_VISIBLE_STORE_FIELDS,
  getCustomerVisibleOwnerIds,
  buildCustomerVisibleStoreFilter,
  withCustomerComplianceFilter
} = require('../utils/storeVisibility');

const findCustomerVisibleStore = async id => {
  const ownerIds = await getCustomerVisibleOwnerIds();
  return Store.findOne(withCustomerComplianceFilter(buildCustomerVisibleStoreFilter(ownerIds, { _id: id })))
    .select(CUSTOMER_VISIBLE_STORE_FIELDS)
    .populate('owner', 'username firstName lastName');
};

const sendPublicStoreLookupError = (res, error, logLabel) => {
  console.error(logLabel, error);
  if (error?.name === 'CastError') return res.status(404).json({ message: 'Store not found' });
  return res.status(500).json({ message: 'Unable to load store right now' });
};

// Get all stores (public)
const getAllStores = async (req, res) => {
  try {
    const { businessType, city, state, featured, search, page = 1, limit = 12 } = req.query;

    const ownerIds = await getCustomerVisibleOwnerIds();
    const filter = withCustomerComplianceFilter(buildCustomerVisibleStoreFilter(ownerIds));

    if (businessType) filter.businessType = businessType;
    if (city) {
      const cityFilter = city.replace(/[nñ]/gi, '[nñ]');
      filter['contactInfo.address.city'] = new RegExp(cityFilter, 'i');
    }
    if (state) filter['contactInfo.address.state'] = new RegExp(state, 'i');
    if (featured === 'true') filter.featured = true;

    if (search && search !== '') {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    const stores = await Store.find(filter)
      .select(CUSTOMER_VISIBLE_STORE_FIELDS)
      .populate('owner', 'username firstName lastName')
      .sort({ featured: -1, 'ratings.average': -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Store.countDocuments(filter);

    res.json({
      stores,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalStores: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get stores error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get store by ID (public)
const getStoreById = async (req, res) => {
  try {
    const store = await findCustomerVisibleStore(req.params.id);

    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    // Get store's pets and products
    const [pets, products] = await Promise.all([
      Pet.find({
        $and: [
          { $or: [
            { store: store._id },
            { addedBy: store.owner._id || store.owner }
          ] },
          { $or: [{ quantity: { $exists: false } }, { quantity: null }, { quantity: 1 }] }
        ],
        isAvailable: true,
        isDeleted: { $ne: true }
      }).select('-pcciRegistration.certificateUrl -supportingDocuments -vetRecords -proofOfOwnership -permits -pickupInstructions').limit(6),
      Product.find({
        $or: [
          { store: store._id },
          { addedBy: store.owner._id || store.owner }
        ],
        isActive: true,
        isDeleted: { $ne: true }
      }).limit(6)
    ]);

    res.json({
      store,
      pets,
      products
    });
  } catch (error) {
    return sendPublicStoreLookupError(res, error, 'Get store error:');
  }
};

// Get store details with products, services, and pets (public)
const getStoreDetails = async (req, res) => {
  try {
    const store = await findCustomerVisibleStore(req.params.id);

    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    // Get store's products, services, pets, follower count, and staff
    const [products, services, pets, followerCount, staff] = await Promise.all([
      Product.find({
        $or: [
          { store: store._id },
          { addedBy: store.owner._id || store.owner }
        ],
        isActive: true,
        isDeleted: { $ne: true }
      }).select('name description price images stockQuantity category'),
      Service.find({
        $or: [
          { store: store._id },
          { addedBy: store.owner._id || store.owner }
        ],
        isActive: true,
        isDeleted: { $ne: true }
      }).select('name description price duration category images'),
      Pet.find({
        $and: [
          { $or: [
            { store: store._id },
            { addedBy: store.owner._id || store.owner }
          ] },
          { $or: [{ quantity: { $exists: false } }, { quantity: null }, { quantity: 1 }] }
        ],
        isAvailable: true,
        isDeleted: { $ne: true }
      }).select('name breed age gender price images species description'),
      Follow.countDocuments({ following: store.owner._id || store.owner }),
      User.find({
        store: store._id,
        role: 'staff',
        isActive: true,
        isDeleted: { $ne: true },
        'professionalProfile.isPublic': { $ne: false }
      }).select('firstName lastName username avatar staffType professionalProfile reputation lastSeen')
    ]);

    const isStaffVisibile = store.staffingConfiguration?.isStaffVisibleToCustomers;

    res.json({
      store,
      products,
      services,
      pets,
      followerCount,
      staff: isStaffVisibile ? staff : []
    });
  } catch (error) {
    return sendPublicStoreLookupError(res, error, 'Get store details error:');
  }
};

// Get my store (Store Owner or Staff)
const getMyStore = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    console.log('🏪 getMyStore requested for user:', userId);

    let storeDoc;
    if (isOperationalStaff(req.user) && req.user.store) {
      storeDoc = await Store.findById(req.user.store)
        .populate('owner', 'username firstName lastName email');
    } else {
      storeDoc = await Store.findOne({ owner: userId, isDeleted: { $ne: true } })
        .populate('owner', 'username firstName lastName email');
    }

    if (!storeDoc) {
      console.log('⚠️ No store found for user:', userId);
      return res.status(404).json({ message: 'Store not found' });
    }

    const store = storeDoc.toObject();

    // Get store statistics
    const petIds = await Pet.find({ store: store._id }).distinct('_id');
    const [petCount, productCount, orderCount] = await Promise.all([
      Pet.countDocuments({ store: store._id }),
      Product.countDocuments({ store: store._id }),
      Order.countDocuments({ 'items.itemId': { $in: petIds } })
    ]);

    store.stats = {
      totalPets: petCount,
      totalProducts: productCount,
      totalOrders: orderCount,
      totalRevenue: storeDoc.stats?.totalRevenue || 0
    };

    console.log('✅ Store statistics calculated for:', store.name);
    res.json({ store });
  } catch (error) {
    console.error('❌ Get my store error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create store (Store Owner only)
const createStore = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check if user already has a store
    const existingStore = await Store.findOne({ owner: req.user.id, isDeleted: { $ne: true } });
    if (existingStore) {
      return res.status(400).json({ message: 'You already have a store' });
    }

    // Check if user is admin (store owner)
    if (!isStoreAdmin(req.user)) {
      return res.status(403).json({ message: 'Only admins can create stores' });
    }

    const storeData = {
      ...req.body,
      owner: req.user.id
    };

    const store = new Store(storeData);
    await store.save();

    const populatedStore = await Store.findById(store._id).populate('owner', 'username firstName lastName');

    res.status(201).json({
      message: 'Store created successfully',
      store: populatedStore
    });
  } catch (error) {
    console.error('Create store error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update store (Store Owner only)
const updateStore = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const store = await Store.findOne({ owner: req.user.id });

    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    // List of fields that SHOULD NOT be updated via this route
    const protectedFields = ['_id', '__v', 'owner', 'slug', 'ratings', 'stats', 'taxConfiguration', 'taxProfile', 'businessProfile', 'businessCompliance', 'refundPolicy', 'rolePermissions', 'staffSequence', 'verificationStatus', 'isActive', 'featured', 'subscriptionTier', 'subscriptionExpires', 'createdAt', 'updatedAt'];

    // Create a body clone without protected fields
    const updateData = { ...req.body };
    protectedFields.forEach(field => delete updateData[field]);

    // Handle nested updates safely for Mongoose
    if (updateData.contactInfo) {
      const contactInfo = { ...store.contactInfo?.toObject?.() || store.contactInfo };
      const newContactInfo = updateData.contactInfo;

      if (newContactInfo.address) {
        contactInfo.address = {
          street: newContactInfo.address.street || contactInfo.address?.street || 'N/A',
          barangay: newContactInfo.address.barangay || contactInfo.address?.barangay || 'N/A',
          city: newContactInfo.address.city || contactInfo.address?.city || 'N/A',
          state: newContactInfo.address.state || contactInfo.address?.state || 'Cavite',
          zipCode: newContactInfo.address.zipCode || contactInfo.address?.zipCode || '0000',
          country: newContactInfo.address.country || contactInfo.address?.country || 'Philippines',
          coordinates: newContactInfo.address.coordinates || contactInfo.address?.coordinates || {}
        };
        delete newContactInfo.address;
      }

      Object.assign(contactInfo, newContactInfo);
      store.contactInfo = contactInfo;
      delete updateData.contactInfo;
    }

    if (updateData.socialMedia) {
      store.socialMedia = {
        ...store.socialMedia?.toObject?.() || store.socialMedia,
        ...updateData.socialMedia
      };
      delete updateData.socialMedia;
    }

    if (updateData.businessHours) {
      store.businessHours = {
        ...store.businessHours?.toObject?.() || store.businessHours,
        ...updateData.businessHours
      };
      delete updateData.businessHours;
    }

    if (updateData.bookingSettings) {
      store.bookingSettings = {
        ...store.bookingSettings?.toObject?.() || store.bookingSettings,
        ...updateData.bookingSettings
      };
      delete updateData.bookingSettings;
    }

    // Apply remaining updates
    Object.assign(store, updateData);

    await store.save();

    const updatedStore = await Store.findById(store._id).populate('owner', 'username firstName lastName');

    // Real-time Update Emission
    const io = req.app.get('socketio');
    if (io) {
      io.to(`store_${store._id}`).emit('settingsUpdate', { type: 'store', settings: updatedStore });
      io.to('admin_global').emit('settingsUpdate', { type: 'store', settings: updatedStore });
    }

    res.json({
      message: 'Store updated successfully',
      store: updatedStore
    });
  } catch (error) {
    console.error('Update store error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get store dashboard data (Store Owner or Staff)
const getStoreDashboard = async (req, res) => {
  try {
    let store;
    if (isOperationalStaff(req.user) && req.user.store) {
      store = await Store.findById(req.user.store);
    } else {
      store = await Store.findOne({ owner: req.user.id });
    }

    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    const includeFinancials = isStoreAdmin(req.user) || isPlatformAdmin(req.user);
    const dashboardData = await buildStoreOperationsSnapshot(store, { includeFinancials });
    res.json(dashboardData);
  } catch (error) {
    console.error('Get store dashboard error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Toggle store status (Super Admin only)
const toggleStoreStatus = async (req, res) => {
  try {
    const store = await Store.findById(req.params.id);

    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    store.isActive = !store.isActive;
    await store.save();

    res.json({
      message: `Store ${store.isActive ? 'activated' : 'deactivated'} successfully`,
      isActive: store.isActive
    });
  } catch (error) {
    console.error('Toggle store status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Feature store (Super Admin only)
const featureStore = async (req, res) => {
  try {
    const store = await Store.findById(req.params.id);

    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    store.featured = !store.featured;
    await store.save();

    res.json({
      message: `Store ${store.featured ? 'featured' : 'unfeatured'} successfully`,
      featured: store.featured
    });
  } catch (error) {
    console.error('Feature store error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get store by owner userId (public - for customer shop navigation)
const getStoreByOwner = async (req, res) => {
  try {
    const { ownerId } = req.params;
    const ownerIds = await getCustomerVisibleOwnerIds();
    const store = await Store.findOne(withCustomerComplianceFilter(buildCustomerVisibleStoreFilter(ownerIds, { owner: ownerId }))).select('_id name logo slug');
    if (!store) return res.status(404).json({ message: 'Store not found' });
    res.json({ store });
  } catch (error) {
    console.error('Get store by owner error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Submit store verification documents (Store Owner)
const submitVerification = async (req, res) => {
  try {
    const { idImage, selfieImage, phoneVerified, emailVerified, breederPermit, businessPermit, payoutAccount } = req.body;

    const store = await Store.findOne({ owner: req.user.id });
    if (!store) return res.status(404).json({ message: 'Store not found' });

    store.verification = {
      idImage: idImage || store.verification.idImage,
      selfieImage: selfieImage || store.verification.selfieImage,
      phoneVerified: phoneVerified ?? store.verification.phoneVerified,
      emailVerified: emailVerified ?? store.verification.emailVerified,
      breederPermit: breederPermit || store.verification.breederPermit,
      businessPermit: businessPermit || store.verification.businessPermit,
      adminNotes: 'Verification recently submitted and pending review.'
    };
    
    if (payoutAccount) {
      store.payoutAccount = payoutAccount;
    }

    store.verificationStatus = 'pending';
    await store.save();

    res.json({ message: 'Verification documents submitted successfully', store });
  } catch (error) {
    console.error('Submit verification error:', error);
    res.status(500).json({ message: 'Server error during submission' });
  }
};

// Approve store verification (Super Admin)
const approveVerification = async (req, res) => {
  try {
    const store = await Store.findById(req.params.id);
    if (!store) return res.status(404).json({ message: 'Store not found' });

    const owner = await User.findOne({
      _id: store.owner,
      role: { $in: ['admin', 'store_owner'] },
      isActive: { $ne: false },
      isDeleted: { $ne: true }
    });
    if (!owner) {
      return res.status(409).json({ message: 'Store verification cannot be approved until its owner account is restored.' });
    }

    store.verificationStatus = 'verified';
    store.verification.verifiedAt = new Date();
    store.verification.adminNotes = 'Identity and documents verified by Super Admin.';
    
    await store.save();

    res.json({ message: 'Store successfully verified!', store });
  } catch (error) {
    console.error('Approve verification error:', error);
    res.status(500).json({ message: 'Server error during verification approval' });
  }
};

// Reject store verification (Super Admin)
const rejectVerification = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ message: 'Rejection reason is required' });

    const store = await Store.findById(req.params.id);
    if (!store) return res.status(404).json({ message: 'Store not found' });

    store.verificationStatus = 'pending'; // Reset or keep as pending
    store.verification.adminNotes = `Rejection Reason: ${reason}`;
    
    await store.save();

    res.json({ message: 'Verification rejected', store });
  } catch (error) {
    console.error('Reject verification error:', error);
    res.status(500).json({ message: 'Server error during verification rejection' });
  }
};

const getTaxConfiguration = async (req, res) => {
  try {
    const store = await Store.findById(req.params.id).select('name taxConfiguration taxProfile.verificationStatus taxProfile.verifiedTaxStatus taxProfile.declaredTaxStatus taxProfile.registeredName taxProfile.verifiedAt taxProfile.updateRequestStatus isActive isDeleted');
    if (!store || !store.isActive || store.isDeleted) return res.status(404).json({ message: 'Store not found' });
    res.json({
      storeId: store._id,
      storeName: store.name,
      taxConfiguration: normalizeTaxConfiguration(store.taxConfiguration),
      taxProfile: {
        verificationStatus: store.taxProfile?.verificationStatus || 'unverified',
        declaredTaxStatus: store.taxProfile?.declaredTaxStatus || null,
        verifiedTaxStatus: store.taxProfile?.verifiedTaxStatus || null,
        registeredName: store.taxProfile?.registeredName || null,
        verifiedAt: store.taxProfile?.verifiedAt || null,
        updateRequestStatus: store.taxProfile?.updateRequestStatus || 'none'
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load tax configuration.' });
  }
};

const updateTaxConfiguration = async (req, res) => {
  try {
    if (!isPlatformAdmin(req.user)) {
      return res.status(403).json({ message: 'Verified tax status can only be changed through Platform Admin review.' });
    }
    const store = await Store.findById(req.params.id).select('+taxConfiguration.auditLog');
    if (!store) return res.status(404).json({ message: 'Store not found' });

    const taxStatus = String(req.body.taxStatus || '');
    const pricingMode = String(req.body.pricingMode || '');
    const vatRatePercent = Number(req.body.vatRatePercent);
    if (!TAX_STATUSES.includes(taxStatus)) return res.status(400).json({ message: 'Invalid tax status.' });
    if (!PRICING_MODES.includes(pricingMode)) return res.status(400).json({ message: 'Invalid pricing mode.' });
    if (!Number.isFinite(vatRatePercent) || vatRatePercent < 0 || vatRatePercent > 100) {
      return res.status(400).json({ message: 'VAT rate must be between 0 and 100.' });
    }
    if (store.taxProfile?.verificationStatus !== 'verified') {
      return res.status(409).json({ message: 'Verify the Store Tax Profile from the Store Application before configuring tax calculations.' });
    }
    const verifiedStatus = store.taxProfile.verifiedTaxStatus === 'vat_registered' ? 'vat_registered' : 'non_vat';
    if (taxStatus !== verifiedStatus) {
      return res.status(409).json({ message: 'Tax configuration must match the verified Store Tax Profile.' });
    }

    const previous = normalizeTaxConfiguration(store.taxConfiguration);
    const next = {
      isConfigured: true,
      taxStatus,
      pricingMode,
      vatRatePercent,
      deliveryFeeTaxable: Boolean(req.body.deliveryFeeTaxable),
      configuredAt: new Date()
    };
    const auditLog = store.taxConfiguration?.auditLog || [];
    auditLog.push({ changedBy: req.user._id, changedAt: new Date(), previous, next });
    if (auditLog.length > 50) auditLog.splice(0, auditLog.length - 50);
    store.taxConfiguration = { ...next, configuredBy: req.user._id, auditLog };
    await store.save();

    res.json({
      message: 'Tax configuration updated. New transactions will use this configuration.',
      taxConfiguration: normalizeTaxConfiguration(store.taxConfiguration)
    });
  } catch (error) {
    console.error('Update tax configuration error:', error);
    res.status(500).json({ message: 'Unable to update tax configuration.' });
  }
};

const requestTaxProfileUpdate = async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim();
    if (reason.length < 10) return res.status(400).json({ message: 'Explain the requested business or tax information change.' });
    const store = await Store.findOne({ owner: req.user._id, isDeleted: { $ne: true } }).select('+taxProfile.updateRequestReason');
    if (!store) return res.status(404).json({ message: 'Store not found.' });
    if (store.taxProfile?.updateRequestStatus === 'pending') {
      return res.status(409).json({ message: 'A business and tax information update is already awaiting review.' });
    }
    store.taxProfile.updateRequestStatus = 'pending';
    store.taxProfile.updateRequestedAt = new Date();
    store.taxProfile.updateRequestReason = reason;
    await store.save();

    const application = await StoreApplication.findOne({ applicant: req.user._id, applicationType: 'new_store' }).sort({ createdAt: -1 });
    if (application) {
      application.reviewHistory.push({ action: 'tax_update_requested', actor: req.user._id, notes: reason, sections: ['businessRegistrationDetails', 'taxProfile'] });
      await application.save();
    }
    const platformAdmins = await User.find({ role: { $in: ['super_admin', 'platform_admin'] }, isActive: { $ne: false }, isDeleted: { $ne: true } }).select('_id');
    await Promise.all(platformAdmins.map(admin => createNotification({
      recipient: admin._id,
      sender: req.user._id,
      type: 'store_application',
      title: 'Business & Tax Update Requested',
      message: `${store.name} requested a reviewed update to its business or tax information.`,
      relatedId: application?._id || store._id,
      relatedModel: application ? 'StoreApplication' : 'Store'
    })));
    res.json({ message: 'Your update request was sent to Platform Admin for review.', status: 'pending' });
  } catch (error) {
    console.error('Request tax profile update error:', error);
    res.status(500).json({ message: 'Unable to submit the update request.' });
  }
};

const getRefundPolicy = async (req, res) => {
  try {
    const store = req.params.id
      ? await Store.findOne({ _id: req.params.id, isActive: { $ne: false }, isDeleted: { $ne: true } }).select('name refundPolicy')
      : await Store.findOne({ owner: req.user._id, isDeleted: { $ne: true } }).select('name refundPolicy');
    if (!store) return res.status(404).json({ message: 'Store not found.' });
    res.json({ storeId: store._id, storeName: store.name, refundPolicy: normalizeRefundPolicy(store.refundPolicy) });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load refund policy.' });
  }
};

const updateRefundPolicy = async (req, res) => {
  try {
    const store = isPlatformAdmin(req.user) && req.params.id
      ? await Store.findById(req.params.id).select('+refundPolicy.auditLog')
      : await Store.findOne({ owner: req.user._id, isDeleted: { $ne: true } }).select('+refundPolicy.auditLog');
    if (!store) return res.status(404).json({ message: 'Store not found.' });
    if (!POLICY_TYPES.includes(req.body.type)) return res.status(400).json({ message: 'Select a valid refund policy.' });
    const next = normalizeRefundPolicy(req.body);
    if (next.type === 'conditional_refund' && !next.conditions) {
      return res.status(400).json({ message: 'Describe the conditions used to review refund requests.' });
    }
    const previous = normalizeRefundPolicy(store.refundPolicy);
    const auditLog = store.refundPolicy?.auditLog || [];
    auditLog.push({ changedBy: req.user._id, changedAt: new Date(), previous, next });
    if (auditLog.length > 50) auditLog.splice(0, auditLog.length - 50);
    store.refundPolicy = { ...next, updatedAt: new Date(), updatedBy: req.user._id, auditLog };
    await store.save();
    await ActivityLog.create({ user: req.user._id, action: 'Refund Policy Updated', details: `${store.name} changed from ${previous.type} to ${next.type}.`, ipAddress: req.ip });
    const io = req.app.get('socketio');
    if (io) io.to(`store_${store._id}`).emit('settingsUpdate', { type: 'refund_policy', refundPolicy: next });
    res.json({ message: 'Refund policy updated. Existing transactions retain their original policy snapshot.', refundPolicy: next });
  } catch (error) {
    console.error('Update refund policy error:', error);
    res.status(500).json({ message: 'Unable to update refund policy.' });
  }
};

const getDeliveryPricing = async (req, res) => {
  try {
    const store = isPlatformAdmin(req.user) && req.params.id
      ? await Store.findById(req.params.id).select('_id name contactInfo.address')
      : await Store.findOne({ owner: req.user._id, isDeleted: { $ne: true } }).select('_id name contactInfo.address');
    if (!store) return res.status(404).json({ message: 'Store not found.' });
    const now = new Date();
    const activeRule = await DeliveryFeeRule.findOne({
      store: store._id,
      isActive: true,
      effectiveFrom: { $lte: now },
      $or: [{ effectiveUntil: null }, { effectiveUntil: { $gte: now } }]
    }).sort({ effectiveFrom: -1, version: -1 }).lean();
    const latestRule = activeRule || await DeliveryFeeRule.findOne({ store: store._id })
      .sort({ version: -1, createdAt: -1 })
      .lean();
    const hasMapLocation = DeliveryFeeService.isValidCoordinates(store.contactInfo?.address?.coordinates);
    const status = !hasMapLocation
      ? 'origin_required'
      : activeRule
        ? 'active'
        : latestRule
          ? 'inactive'
          : 'not_configured';
    res.json({
      store: {
        _id: store._id,
        name: store.name,
        address: store.contactInfo?.address || null,
        hasMapLocation
      },
      status,
      enabled: Boolean(activeRule),
      deliveryPricing: latestRule || null,
      preview: activeRule ? calculateRulePreview({ input: activeRule, distanceKm: 5, itemQuantity: 3 }) : null
    });
  } catch (error) {
    console.error('Get delivery pricing error:', error);
    res.status(500).json({ message: 'Unable to load delivery pricing.' });
  }
};

const updateDeliveryPricing = async (req, res) => {
  try {
    const store = isPlatformAdmin(req.user) && req.params.id
      ? await Store.findById(req.params.id)
      : await Store.findOne({ owner: req.user._id, isDeleted: { $ne: true } });
    if (!store) return res.status(404).json({ message: 'Store not found.' });
    const now = new Date();
    if (req.body.enabled === false) {
      const result = await DeliveryFeeRule.updateMany(
        { store: store._id, isActive: true },
        { $set: { isActive: false, effectiveUntil: now, deactivatedBy: req.user._id } }
      );
      const latestRule = await DeliveryFeeRule.findOne({ store: store._id }).sort({ version: -1, createdAt: -1 }).lean();
      await ActivityLog.create({
        user: req.user._id,
        action: 'Home Delivery Disabled',
        details: `${store.name} disabled home delivery. Existing order snapshots were not changed.`,
        ipAddress: req.ip
      });
      const io = req.app.get('socketio');
      if (io) io.to(`store_${store._id}`).emit('settingsUpdate', { type: 'delivery_pricing', status: 'inactive' });
      return res.json({
        message: result.modifiedCount ? 'Home delivery disabled.' : 'Home delivery is already disabled.',
        status: latestRule ? 'inactive' : 'not_configured',
        enabled: false,
        deliveryPricing: latestRule || null
      });
    }

    const coordinates = store.contactInfo?.address?.coordinates;
    if (!DeliveryFeeService.isValidCoordinates(coordinates)) {
      return res.status(400).json({
        code: 'STORE_LOCATION_REQUIRED',
        fieldErrors: { storeLocation: 'Confirm the store map location before enabling home delivery.' },
        message: 'Add the store map location before enabling distance-based delivery.'
      });
    }

    const { values, fieldErrors, valid } = validateRuleInput(req.body);
    if (!valid) {
      return res.status(400).json({
        code: 'DELIVERY_PRICING_VALIDATION_FAILED',
        fieldErrors,
        message: 'Review the highlighted delivery pricing fields.'
      });
    }

    const previous = await DeliveryFeeRule.findOne({ store: store._id }).sort({ version: -1, createdAt: -1 });
    const version = Number(previous?.version || 0) + 1;
    await DeliveryFeeRule.updateMany(
      { store: store._id, isActive: true },
      { $set: { isActive: false, effectiveUntil: now, deactivatedBy: req.user._id } }
    );
    const rule = await DeliveryFeeRule.create({
      store: store._id,
      name: `Distance and item delivery pricing v${version}`,
      baseFee: values.baseFee,
      includedKilometers: values.includedKilometers,
      ratePerKilometer: values.ratePerKilometer,
      additionalItemFee: values.additionalItemFee,
      minimumFee: values.minimumFee,
      maximumFee: values.maximumFee,
      maximumDistanceKm: values.maximumDistanceKm,
      version,
      effectiveFrom: now,
      effectiveUntil: null,
      isActive: true,
      createdBy: req.user._id
    });
    await ActivityLog.create({
      user: req.user._id,
      action: 'Delivery Pricing Updated',
      details: `${store.name} activated delivery pricing version ${version}. Historical orders keep their saved calculation.`,
      ipAddress: req.ip
    });
    const io = req.app.get('socketio');
    if (io) io.to(`store_${store._id}`).emit('settingsUpdate', { type: 'delivery_pricing', version });
    res.json({
      message: 'Delivery pricing updated.',
      status: 'active',
      enabled: true,
      deliveryPricing: rule,
      preview: calculateRulePreview({ input: rule, distanceKm: 5, itemQuantity: 3 })
    });
  } catch (error) {
    console.error('Update delivery pricing error:', error);
    res.status(500).json({ message: 'Unable to update delivery pricing.' });
  }
};

const previewDeliveryPricing = async (req, res) => {
  try {
    const store = isPlatformAdmin(req.user) && req.params.id
      ? await Store.findById(req.params.id).select('_id')
      : await Store.findOne({ owner: req.user._id, isDeleted: { $ne: true } }).select('_id');
    if (!store) return res.status(404).json({ message: 'Store not found.' });

    const preview = calculateRulePreview({
      input: req.body,
      distanceKm: req.body.distanceKm,
      itemQuantity: req.body.itemQuantity
    });
    if (!preview.valid) {
      return res.status(400).json({
        code: 'DELIVERY_PRICING_VALIDATION_FAILED',
        fieldErrors: preview.fieldErrors,
        message: 'Complete the delivery pricing fields to see an estimate.'
      });
    }
    res.json({ preview });
  } catch (error) {
    console.error('Preview delivery pricing error:', error);
    res.status(500).json({ message: 'Unable to preview delivery pricing.' });
  }
};

// Get all store locations for map (Filtered for Cavite only)
const getStoreLocations = async (req, res) => {
  try {
    const ownerIds = await getCustomerVisibleOwnerIds();
    const stores = await Store.find(buildCustomerVisibleStoreFilter(ownerIds))
      .where({ 'businessCompliance.restrictionReasons': { $not: { $elemMatch: { active: true } } } })
      .select('name logo coverImage slug businessType contactInfo.phone contactInfo.email contactInfo.address verificationStatus');

    res.json({ stores });
  } catch (error) {
    console.error('Get store locations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllStores,
  getStoreById,
  getStoreDetails,
  getMyStore,
  createStore,
  updateStore,
  getStoreDashboard,
  toggleStoreStatus,
  featureStore,
  getStoreByOwner,
  getStoreLocations,
  submitVerification,
  approveVerification,
  rejectVerification,
  getTaxConfiguration,
  updateTaxConfiguration,
  requestTaxProfileUpdate,
  getRefundPolicy,
  updateRefundPolicy,
  getDeliveryPricing,
  updateDeliveryPricing,
  previewDeliveryPricing
};
