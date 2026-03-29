const { validationResult } = require('express-validator');
const Service = require('../models/Service');
const Store = require('../models/Store');

const DEFAULT_REQUIREMENTS = [
  "Valid ID and contact details",
  "Pet vaccination record",
  "Pet information (breed, age, health status)",
  "Signed service consent or waiver",
  "Appointment confirmation (if required)"
];

// Get all services for a store
const getStoreServices = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { category, active } = req.query;

    let filter = { store: storeId, isDeleted: { $ne: true } };

    if (category) filter.category = category;
    if (active !== undefined) filter.isActive = active === 'true';

    const services = await Service.find(filter)
      .populate('store', 'name')
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
      duration,
      price,
      homeServiceAvailable,
      homeServicePrice,
      maxPetsPerSession,
      requirements,
      images
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

    if (req.user.role !== 'super_admin' && !isOwner && !isStaff) {
      return res.status(403).json({ message: 'You can only create services for your own or assigned store' });
    }

    const service = new Service({
      name,
      description,
      store: req.params.storeId,
      addedBy: req.user._id,
      category,
      duration,
      price,
      homeServiceAvailable,
      homeServicePrice,
      maxPetsPerSession,
      requirements: requirementsStr,
      images
    });

    await service.save();
    await service.populate('store', 'name');

    res.status(201).json(service);
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ message: 'Server error' });
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
      duration,
      price,
      homeServiceAvailable,
      homeServicePrice,
      maxPetsPerSession,
      requirements,
      images
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

    const service = new Service({
      name,
      description,
      store: serviceStore,
      addedBy: req.user._id,
      category,
      duration,
      price,
      homeServiceAvailable,
      homeServicePrice,
      maxPetsPerSession,
      requirements: requirementsStr,
      images,
      createdBy: req.user._id
    });

    await service.save();
    await service.populate('store', 'name');

    console.log('✅ Admin service created successfully:', service._id);
    res.status(201).json(service);
  } catch (error) {
    console.error('Create admin service error:', error);
    res.status(500).json({ message: 'Server error' });
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

    if (req.user.role !== 'super_admin' && !isOwner && !isStaff) {
      return res.status(403).json({ message: 'You can only update services for your own or assigned store' });
    }

    const updates = req.body; if (req.body.requirements && Array.isArray(req.body.requirements)) { updates.requirements = req.body.requirements.join(', '); }
    Object.assign(service, updates);
    await service.save();

    res.json(service);
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ message: 'Server error' });
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

    if (req.user.role !== 'super_admin' && !isOwner && !isStaff) {
      return res.status(403).json({ message: 'You can only delete services for your own or assigned store' });
    }

    service.isDeleted = true;
    await service.save();

    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all services (public)
const getAllServices = async (req, res) => {
  try {
    const { category, city, homeService, search, page = 1, limit = 20 } = req.query;

    let filter = { isActive: true, isDeleted: { $ne: true } };

    // Check if this is an admin route (path starts with /admin)
    const isAdminRoute = req.path.startsWith('/admin');

    // If admin route, filter by admin user ID for complete data isolation
    if (isAdminRoute && req.user.role === 'admin') {
      // Multi-tenant isolation: filter by the admin user who created the data
      filter.createdBy = req.user._id;
      console.log('🔒 Multi-tenant isolation - showing data for admin:', req.user._id);
    }

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

    // Filter by City (if provided, we need to find stores in that city first)
    if (city) {
      const cityFilter = city.replace(/[nñ]/gi, '[nñ]');
      const storesInCity = await Store.find({
        'contactInfo.address.city': { $regex: new RegExp(cityFilter, 'i') }
      }).select('_id');
      const storeIds = storesInCity.map(s => s._id);
      filter.store = { $in: storeIds };
    }

    const skip = (page - 1) * limit;
    const services = await Service.find(filter)
      .populate('store', 'name contactInfo.address')
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
    const service = await Service.findById(req.params.id).populate('store', 'name contactInfo.address businessHours');
    if (!service || service.isDeleted) {
      console.log('⚠️ Service not found (or deleted):', req.params.id);
      return res.status(404).json({ message: 'Service not found' });
    }
    res.json(service);
  } catch (error) {
    console.error('Get service by ID error:', error);
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
  getAllServices
};
