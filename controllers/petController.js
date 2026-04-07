const { validationResult } = require('express-validator');
const Pet = require('../models/Pet');
const Store = require('../models/Store');

// Get all pets with filtering
const getAllPets = async (req, res) => {
  try {
    console.log('🐕 getAllPets called with path:', req.path);
    console.log('👤 User:', req.user);

    const { species, breed, size, gender, minAge, maxAge, minPrice, maxPrice, search, isAvailable, city, page = 1, limit = 10 } = req.query;

    const filter = {
      isDeleted: { $ne: true },
      approvalStatus: { $in: ['approved', 'pending'] } // Show both pending and approved to buyers
    };

    // Filter by City (if provided, we need to find stores in that city first)
    if (city) {
      const cityFilter = city.replace(/[nñ]/gi, '[nñ]');
      const storesInCity = await Store.find({
        'contactInfo.address.city': { $regex: new RegExp(cityFilter, 'i') }
      }).select('_id');
      const storeIds = storesInCity.map(s => s._id);
      filter.store = { $in: storeIds };
    }

    // Check if this is an admin route (path starts with /admin)
    const isAdminRoute = req.path.startsWith('/admin');
    console.log('🔍 Request path:', req.path);
    console.log('🔍 Original URL:', req.originalUrl);
    console.log('🔍 Is admin route:', isAdminRoute);

    // If admin route, filter by store or user for data isolation
    if (isAdminRoute) {
      if (req.user.role === 'admin' || req.user.role === 'staff') {
          // Priority: filter by store if user is assigned to one
          if (req.user.store) {
              filter.store = req.user.store;
          } else if (req.user.role === 'admin') {
              // Fallback for admins without a store field set
              filter.addedBy = req.user._id;
          } else if (req.user.role === 'staff') {
              // Staff MUST have a store
              return res.status(403).json({ message: 'Staff account not assigned to a store.' });
          }
      }
      console.log(`🔒 Multi-tenant isolation for ${req.user.role} - applying filter:`, JSON.stringify(filter, null, 2));
    }

    if (isAvailable === 'true') {
      filter.isAvailable = true;
    } else if (isAvailable === 'false') {
      filter.isAvailable = false;
    }

    if (species) filter.species = species;
    if (breed) filter.breed = new RegExp(breed, 'i');
    if (size) filter.size = size;
    if (gender) filter.gender = gender;
    if (minAge || maxAge) {
      filter.age = {};
      if (minAge) filter.age.$gte = parseInt(minAge);
      if (maxAge) filter.age.$lte = parseInt(maxAge);
    }
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    // Add general search functionality
    if (search && search !== '') {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { breed: { $regex: search, $options: 'i' } }
      ];
    }

    console.log('🔍 Filter being used:', filter);

    const skip = (page - 1) * limit;
    const pets = await Pet.find(filter)
      .populate('addedBy', 'username firstName lastName')
      .populate('store', 'name contactInfo.address')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Pet.countDocuments(filter);

    console.log('📊 Found pets:', pets.length);
    console.log('📊 Total pets:', total);

    // Debug: Show pet owners
    if (pets.length > 0) {
      console.log('🐕 Pet owners:');
      pets.forEach((pet, index) => {
        console.log(`  ${index + 1}. Pet: ${pet.name}, AddedBy: ${pet.addedBy}, AddedByUser: ${pet.addedBy?.username || pet.addedBy}`);
      });
    }

    res.json({
      pets,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalPets: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get pets error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get pet by ID
const getPetById = async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id)
      .populate('addedBy', 'username firstName lastName')
      .populate('store', 'name contactInfo.address');

    if (!pet || pet.isDeleted) {
      return res.status(404).json({ message: 'Pet not found' });
    }

    res.json({ pet });
  } catch (error) {
    console.error('Get pet error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create new pet (Admin only)
const createPet = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Find the store for this user (admin or staff)
    let store;
    
    if (req.user.role === 'staff') {
        if (req.user.store) {
            store = await Store.findById(req.user.store);
        }
    } else {
        store = await Store.findOne({ owner: req.user._id });
    }

    if (!store) {
      console.warn('⚠️ No store found for user:', req.user._id, 'Role:', req.user.role);
      return res.status(400).json({ message: 'You must have a store to add pets. Please ensure your account is linked to a store.' });
    }

    console.log('📦 Creating pet with data:', { ...req.body, addedBy: req.user._id, store: store._id });

    const petData = {
      ...req.body,
      addedBy: req.user._id,
      store: store._id
    };

    const pet = new Pet(petData);
    await pet.save();

    const populatedPet = await Pet.findById(pet._id).populate('addedBy', 'username firstName lastName');

    res.status(201).json({
      message: 'Pet created successfully',
      pet: populatedPet
    });
  } catch (error) {
    console.error('Create pet error:', error);
    // Check for specific Mongoose validation errors or duplicate key errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: 'Validation Error', errors });
    } else if (error.code === 11000) { // Duplicate key error
      return res.status(409).json({ message: 'Duplicate pet entry', error: error.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// Update pet (Admin only or owner)
const updatePet = async (req, res) => {
  try {
    console.log('📝 updatePet CALLED for ID:', req.params.id);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('📝 updatePet VALIDATION ERRORS:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const pet = await Pet.findById(req.params.id);
    if (!pet) {
      console.log('📝 updatePet PET NOT FOUND');
      return res.status(404).json({ message: 'Pet not found' });
    }

    console.log('📝 updatePet PET FOUND:', pet.name);
    console.log('📝 updatePet USER ROLE:', req.user.role);
    console.log('📝 updatePet USER ID:', req.user._id);

    // Check permissions: Owner, store staff, or super admin
    const isOwner = pet.addedBy && pet.addedBy.toString() === req.user._id.toString();
    const isStoreStaff = req.user.role === 'staff' && req.user.store && pet.store && pet.store.toString() === req.user.store.toString();
    
    let isStoreOwner = false;
    if (req.user.role === 'admin' && pet.store) {
      console.log('📝 updatePet CHECKING STORE OWNER for store:', pet.store);
      try {
        const store = await Store.findById(pet.store);
        isStoreOwner = store && store.owner && store.owner.toString() === req.user._id.toString();
        console.log('📝 updatePet IS STORE OWNER:', isStoreOwner);
      } catch (storeError) {
        console.error('📝 updatePet ERROR FETCHING STORE:', storeError);
      }
    }

    if (req.user.role !== 'super_admin' && !isOwner && !isStoreStaff && !isStoreOwner) {
      console.log('📝 updatePet ACCESS DENIED');
      return res.status(403).json({ message: 'Access denied' });
    }

    console.log('📝 updatePet PERMISSION GRANTED');

    // List of fields that shouldn't be updated directly via this endpoint
    const { _id, id, addedBy, store, createdAt, updatedAt, ratings, ...updateData } = req.body;
    console.log('📝 updatePet CLEANED DATA:', updateData);
    
    // Ensure store is set if missing (for legacy data or manual fixes)
    if (!pet.store) {
      console.log('📝 updatePet ATTEMPTING TO FIX MISSING STORE');
      let storeId = req.user.store;
      if (!storeId && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
        const storeRes = await Store.findOne({ owner: req.user._id });
        if (storeRes) storeId = storeRes._id;
      }
      if (storeId) {
        updateData.store = storeId;
        console.log('📝 updatePet FIXED STORE:', storeId);
      }
    }

    console.log('📝 updatePet EXECUTING UPDATE');
    const updatedPet = await Pet.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('addedBy', 'username firstName lastName');

    if (!updatedPet) {
      console.log('📝 updatePet UPDATED PET NOT FOUND AFTER UPDATE');
      return res.status(404).json({ message: 'Pet not found after update' });
    }

    console.log('📝 updatePet UPDATE SUCCESSFUL');
    res.json({
      message: 'Pet updated successfully',
      pet: updatedPet
    });
  } catch (error) {
    console.error('📝 updatePet CRASHED:', error);
    res.status(500).json({ 
      message: 'Server error during pet update', 
      error: error.message
    });
  }
};

// Delete pet (Admin only or owner)
const deletePet = async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id);

    if (!pet) {
      return res.status(404).json({ message: 'Pet not found' });
    }

    // Check permissions: Owner, store staff, or super admin
    const isOwner = pet.addedBy && pet.addedBy.toString() === req.user._id.toString();
    const isStoreStaff = req.user.role === 'staff' && req.user.store && pet.store && pet.store.toString() === req.user.store.toString();
    
    let isStoreOwner = false;
    if (req.user.role === 'admin' && pet.store) {
      try {
        const store = await Store.findById(pet.store);
        isStoreOwner = store && store.owner && store.owner.toString() === req.user._id.toString();
      } catch (err) {
        console.error('Delete pet store lookup error:', err);
      }
    }

    if (req.user.role !== 'super_admin' && !isOwner && !isStoreStaff && !isStoreOwner) {
      return res.status(403).json({ message: 'Access denied' });
    }

    pet.isDeleted = true;
    await pet.save();

    res.json({ message: 'Pet deleted successfully' });
  } catch (error) {
    console.error('Delete pet error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllPets,
  getPetById,
  createPet,
  updatePet,
  deletePet
};
