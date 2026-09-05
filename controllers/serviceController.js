const { validationResult } = require('express-validator');
const Service = require('../models/Service');
const Store = require('../models/Store');
const User = require('../models/User');
const { isRoleEligibleForService } = require('../utils/staffSpecialization');
const { calculateServicePrice } = require('../utils/pricingEngine');
const { calculateTransactionTax, resolveTransactionTaxConfiguration } = require('../utils/taxCalculator');
const { canOperateStore } = require('../utils/authorizationPolicy');

const DEFAULT_REQUIREMENTS = [
  "Valid ID and contact details",
  "Pet vaccination record",
  "Pet information (breed, age, health status)",
  "Signed service consent or waiver",
  "Appointment confirmation (if required)"
];

const PUBLIC_STORE_FILTER = Object.freeze({
  isActive: true,
  isDeleted: { $ne: true },
  verificationStatus: { $in: ['verified', null] }
});
const PUBLIC_SERVICE_FIELDS = 'name description store category subCategory duration bufferTime price pricingRules addOns bookingRules assignedStaff schedule homeServiceAvailable homeServicePrice maxPetsPerSession requirements images ratings isActive';

const validateAssignedStaff = async (assignedStaff = [], storeId, serviceData) => {
  const ids = [...new Set((assignedStaff || []).map(String).filter(Boolean))];
  if (!ids.length) return [];
  const staff = await User.find({
    _id: { $in: ids }, role: 'staff', store: storeId, isActive: true,
    staffStatus: { $ne: 'suspended' }, isDeleted: false
  });
  if (staff.length !== ids.length) throw Object.assign(new Error('Assigned staff must be active and belong to this store branch.'), { statusCode: 400 });
  const incompatible = staff.find(member => !isRoleEligibleForService(member.staffType, serviceData));
  if (incompatible) throw Object.assign(new Error(`${incompatible.firstName} ${incompatible.lastName} is not eligible for this service based on their role.`), { statusCode: 400 });
  return ids;
};

// Get all services for a store
const getStoreServices = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { category } = req.query;

    const store = await Store.findOne({ _id: storeId, ...PUBLIC_STORE_FILTER }).select('_id');
    if (!store) return res.status(404).json({ message: 'Store not found or unavailable' });

    const filter = { store: storeId, isActive: true, isDeleted: { $ne: true } };

    if (category) filter.category = category;

    const services = await Service.find(filter).select(PUBLIC_SERVICE_FIELDS)
      .populate('store', 'name logo contactInfo.address businessHours bookingSettings taxConfiguration refundPolicy')
      .populate({
        path: 'assignedStaff',
        match: { isActive: true, staffStatus: { $in: ['active', null] }, 'professionalProfile.isPublic': { $ne: false } },
        select: 'firstName lastName staffType professionalProfile.professionalTitle professionalProfile.specialty'
      })
      .sort({ createdAt: -1 });

    res.json(services);
  } catch (error) {
    console.error('Get store services error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create a new service (store admin only)
const createService = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name,
      description,
      category,
      subCategory,
      duration,
      bufferTime,
      price,
      homeServiceAvailable,
      homeServicePrice,
      maxPetsPerSession,
      requirements,
      images,
      pricingRules,
      addOns,
      bookingRules,
      assignedStaff,
      schedule,
      recommendationCriteria
    } = req.body;

    // Convert requirements array to string if needed and combine with defaults
    let requirementsList = Array.isArray(requirements) ? requirements : (requirements ? requirements.split(',').map(r => r.trim()) : []);
    
    // Add defaults if they are not already there
    DEFAULT_REQUIREMENTS.forEach(req => {
      if (!requirementsList.includes(req)) {
        requirementsList.push(req);
      }
    });

    const requirementsStr = requirementsList.join(', ');

    // Verify store ownership
    const store = await Store.findById(req.params.storeId);
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    // Check if user is admin of this store, staff member, or super admin
    const isOwner = store.owner.toString() === req.user._id.toString();
    const isStaff = req.user.role === 'staff' && req.user.store && req.user.store.toString() === req.params.storeId.toString();

    if (!(await canOperateStore(req.user, store._id, ['services.create', 'services.manage']))) {
      return res.status(403).json({ message: 'You can only create services for your own or assigned store' });
    }

    const validatedAssignedStaff = await validateAssignedStaff(assignedStaff, req.params.storeId, { name, description, category, subCategory });
    const service = new Service({
      name,
      description,
      store: req.params.storeId,
      addedBy: req.user._id,
      category,
      subCategory,
      duration,
      bufferTime: bufferTime || 0,
      price,
      homeServiceAvailable,
      homeServicePrice,
      maxPetsPerSession,
      requirements: requirementsStr,
      images,
      pricingRules: pricingRules || {},
      addOns: addOns || [],
      bookingRules: bookingRules || {},
      assignedStaff: validatedAssignedStaff,
      schedule: schedule || {},
      recommendationCriteria: recommendationCriteria || {}
    });

    await service.save();
    await service.populate('store', 'name');
    await service.populate('assignedStaff', 'firstName lastName staffType');

    // Real-time Service Emission
    const io = req.app.get('socketio');
    if (io) {
      io.to(`store_${req.params.storeId}`).emit('serviceUpdate', service);
      io.to('admin_global').emit('serviceUpdate', service);
    }

    res.status(201).json(service);
  } catch (error) {
    console.error('Create service error:', error);
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Server error' });
  }
};

// Create a new service for admins (no store requirement)
const createAdminService = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name,
      description,
      category,
      subCategory,
      duration,
      bufferTime,
      price,
      homeServiceAvailable,
      homeServicePrice,
      maxPetsPerSession,
      requirements,
      images,
      pricingRules,
      addOns,
      bookingRules,
      assignedStaff,
      schedule,
      recommendationCriteria
    } = req.body;

    console.log('🔐 Creating admin service for user:', req.user.email, 'Role:', req.user.role);

    // Convert requirements array to string if needed and combine with defaults
    let requirementsList = Array.isArray(requirements) ? requirements : (requirements ? requirements.split(',').map(r => r.trim()) : []);
    
    // Add defaults if they are not already there
    DEFAULT_REQUIREMENTS.forEach(req => {
      if (!requirementsList.includes(req)) {
        requirementsList.push(req);
      }
    });

    const requirementsStr = requirementsList.join(', ');

    // For admins, we don't require a specific store - they can create services
    // The service will be associated with their user account or a default store
    let serviceStore = null;

    // If admin has a store, use it
    if (req.user.store) {
      serviceStore = req.user.store;
      console.log('🏪 Using admin store:', req.user.store);
    } else {
      // For admins without a store, find or create a default one
      let defaultStore = await Store.findOne({ owner: req.user._id });

      if (!defaultStore) {
        console.log('🏪 Creating default store for admin');
        const storeName = `${req.user.firstName || 'Admin'}'s Store`;

        defaultStore = new Store({
          name: storeName,
          slug: storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + Date.now(),
          description: `Default store for ${req.user.firstName || 'Admin'}`,
          businessType: 'pet_store',
          contactInfo: {
            phone: '000-000-0000',
            email: req.user.email,
            address: {
              street: '123 Default Street',
              barangay: 'Default Barangay',
              city: 'Default City',
              state: 'Default State',
              zipCode: '00000',
              country: 'Default Country'
            }
          },
          owner: req.user._id,
          isActive: true
        });
        await defaultStore.save();
      }

      serviceStore = defaultStore._id;
      console.log('🏪 Using default store:', serviceStore);
    }

    const validatedAssignedStaff = await validateAssignedStaff(assignedStaff, serviceStore, { name, description, category, subCategory });
    const service = new Service({
      name,
      description,
      store: serviceStore,
      addedBy: req.user._id,
      category,
      subCategory,
      duration,
      bufferTime: bufferTime || 0,
      price,
      homeServiceAvailable,
      homeServicePrice,
      maxPetsPerSession,
      requirements: requirementsStr,
      images,
      createdBy: req.user._id,
      pricingRules: pricingRules || {},
      addOns: addOns || [],
      bookingRules: bookingRules || {},
      assignedStaff: validatedAssignedStaff,
      schedule: schedule || {},
      recommendationCriteria: recommendationCriteria || {}
    });

    await service.save();
    await service.populate('store', 'name');
    await service.populate('assignedStaff', 'firstName lastName staffType');

    // Real-time Service Emission
    const io = req.app.get('socketio');
    if (io) {
      io.to(`store_${serviceStore}`).emit('serviceUpdate', service);
      io.to('admin_global').emit('serviceUpdate', service);
    }

    console.log('✅ Admin service created successfully:', service._id);
    res.status(201).json(service);
  } catch (error) {
    console.error('Create admin service error:', error);
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Server error' });
  }
};

// Update a service
const updateService = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const service = await Service.findById(req.params.id).populate('store');
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    // Check permissions: Owner, store staff, or super admin
    const isOwner = service.store && service.store.owner && service.store.owner.toString() === req.user._id.toString();
    const isStaff = req.user.role === 'staff' && req.user.store && service.store && service.store._id.toString() === req.user.store.toString();

    if (!(await canOperateStore(req.user, service.store._id, ['services.update', 'services.manage']))) {
      return res.status(403).json({ message: 'You can only update services for your own or assigned store' });
    }

    const updates = req.body; if (req.body.requirements && Array.isArray(req.body.requirements)) { updates.requirements = req.body.requirements.join(', '); }
    if (req.body.assignedStaff !== undefined) {
      updates.assignedStaff = await validateAssignedStaff(req.body.assignedStaff, service.store._id, {
        name: req.body.name ?? service.name,
        description: req.body.description ?? service.description,
        category: req.body.category ?? service.category,
        subCategory: req.body.subCategory ?? service.subCategory
      });
    }
    Object.assign(service, updates);
    await service.save();

    // Real-time Service Emission
    const io = req.app.get('socketio');
    if (io) {
      io.to(`store_${service.store._id}`).emit('serviceUpdate', service);
      io.to('admin_global').emit('serviceUpdate', service);
    }

    res.json(service);
  } catch (error) {
    console.error('Update service error:', error);
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Server error' });
  }
};

// Delete a service
const deleteService = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id).populate('store');
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    // Check permissions: Owner, store staff, or super admin
    const isOwner = service.store && service.store.owner && service.store.owner.toString() === req.user._id.toString();
    const isStaff = req.user.role === 'staff' && req.user.store && service.store && service.store._id.toString() === req.user.store.toString();

    if (!(await canOperateStore(req.user, service.store._id, ['services.delete', 'services.manage']))) {
      return res.status(403).json({ message: 'You can only delete services for your own or assigned store' });
    }

    service.isDeleted = true;
    await service.save();

    res.json({ message: 'Service deleted successfully' });

    // Real-time Service Emission
    const io = req.app.get('socketio');
    if (io) {
      io.to(`store_${service.store._id}`).emit('serviceUpdate', { _id: req.params.id, isDeleted: true });
      io.to('admin_global').emit('serviceUpdate', { _id: req.params.id, isDeleted: true });
    }
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all services (public)
const getAllServices = async (req, res) => {
  try {
    const { category, city, homeService, search, page = 1, limit = 20 } = req.query;

    const filter = { isActive: true, isDeleted: { $ne: true } };

    if (category) filter.category = category;
    if (homeService === 'true') filter.homeServiceAvailable = true;

    // Search: match name, description, or category
    if (search && search !== '') {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }

    // Keep inactive, suspended, and deleted stores out of public discovery.
    // This is part of the database filter so pagination remains accurate.
    const publicStoreFilter = { ...PUBLIC_STORE_FILTER };
    if (city) {
      const cityFilter = city.replace(/[nñ]/gi, '[nñ]');
      publicStoreFilter['contactInfo.address.city'] = { $regex: new RegExp(cityFilter, 'i') };
    }
    const publicStores = await Store.find(publicStoreFilter).select('_id');
    filter.store = { $in: publicStores.map(store => store._id) };

    const skip = (page - 1) * limit;
    const services = await Service.find(filter).select(PUBLIC_SERVICE_FIELDS)
      .populate('store', 'name logo contactInfo.address businessHours bookingSettings taxConfiguration refundPolicy verificationStatus')
      .populate({ path: 'assignedStaff', match: { isActive: true, staffStatus: { $in: ['active', null] }, 'professionalProfile.isPublic': { $ne: false } }, select: 'firstName lastName staffType professionalProfile.professionalTitle professionalProfile.specialty' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Service.countDocuments(filter);

    res.json({
      services,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalServices: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get all services error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get single service by ID (public)
const getServiceById = async (req, res) => {
  try {
    console.log('🔍 Fetching service by ID:', req.params.id);
    const isAdminRequest = req.baseUrl?.includes('/admin');
    let serviceQuery = Service.findById(req.params.id);
    if (!isAdminRequest) serviceQuery = serviceQuery.select(PUBLIC_SERVICE_FIELDS);
    const service = await serviceQuery
      .populate('store', 'name logo contactInfo.address businessHours bookingSettings taxConfiguration refundPolicy isActive isDeleted verificationStatus')
      .populate({ path: 'assignedStaff', match: { isActive: true, staffStatus: { $in: ['active', null] }, 'professionalProfile.isPublic': { $ne: false } }, select: 'firstName lastName staffType professionalProfile.professionalTitle professionalProfile.specialty' });
    if (!service || service.isDeleted) {
      console.log('⚠️ Service not found (or deleted):', req.params.id);
      return res.status(404).json({ message: 'Service not found' });
    }
    if (!isAdminRequest && (!service.isActive || !service.store || !service.store.isActive
        || service.store.isDeleted || service.store.verificationStatus !== 'verified')) {
      return res.status(404).json({ message: 'Service not found or unavailable' });
    }
    if (isAdminRequest
        && !(await canOperateStore(req.user, service.store?._id || service.store, ['services.view', 'services.manage']))) {
      return res.status(403).json({ message: 'Access denied for this service.' });
    }
    res.json(service);
  } catch (error) {
    console.error('Get service by ID error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── Price Calculator Endpoint ─────────────────────────────────────────────
// POST /api/services/calculate-price
const calculatePrice = async (req, res) => {
  try {
    const { serviceId, pet, bookingDate, startTime, isHomeService, selectedAddOns, selectedConditions } = req.body;

    if (!serviceId) {
      return res.status(400).json({ message: 'Service ID is required' });
    }

    const service = await Service.findById(serviceId).populate('store', 'taxConfiguration isActive isDeleted verificationStatus');
    if (!service || service.isDeleted || !service.isActive || !service.store || !service.store.isActive
        || service.store.isDeleted || service.store.verificationStatus !== 'verified') {
      return res.status(404).json({ message: 'Service not found or unavailable' });
    }
    const taxConfiguration = resolveTransactionTaxConfiguration(service.store.taxConfiguration);

    const { breakdown, resolvedAddOns } = calculateServicePrice(
      service,
      pet || {},
      { date: bookingDate, startTime, isHomeService },
      selectedAddOns || [],
      selectedConditions || []
    );
    const taxBreakdown = calculateTransactionTax({
      subtotal: breakdown.subtotal,
      taxConfiguration
    });

    res.json({
      breakdown: { ...breakdown, ...taxBreakdown, finalPrice: taxBreakdown.finalTotal },
      resolvedAddOns,
      availableAddOns: (service.addOns || []).filter(a => a.isActive),
      availableConditions: service.pricingRules?.condition?.enabled
        ? (service.pricingRules.condition.conditions || [])
        : []
    });
  } catch (error) {
    console.error('Calculate price error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getStoreServices,
  getServiceById,
  createService,
  createAdminService,
  updateService,
  deleteService,
  getAllServices,
  calculatePrice
};
