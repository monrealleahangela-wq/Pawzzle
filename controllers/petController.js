const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Pet = require('../models/Pet');
const Store = require('../models/Store');
const { isPlatformAdmin, isStoreAdmin, isOperationalStaff } = require('../config/permissions');
const { canOperateStore } = require('../utils/authorizationPolicy');
const { derivePetAge } = require('../utils/petAge');
const { isIndividualPetRecord } = require('../services/petAvailabilityService');
const {
  getCustomerVisibleOwnerIds,
  buildCustomerVisibleStoreFilter,
  withCustomerComplianceFilter
} = require('../utils/storeVisibility');
const {
  buildPublicPetFilter,
  escapeRegex,
  filterStoresByDistance,
  isMarketplacePet,
  normalizeCatalogImages
} = require('../utils/catalogListing');

const PET_LISTING_FIELDS = [
  'name', 'species', 'breed', 'birthday', 'age', 'ageUnit', 'gender', 'size',
  'color', 'description', 'price', 'images', 'weight', 'isNegotiable', 'dewormed',
  'spayedNeutered', 'healthCondition', 'vetRecords', 'proofOfOwnership', 'permits',
  'pickupAvailability', 'fulfillmentType', 'paymentConfig', 'depositAmount',
  'vaccinationStatus', 'pedigreePapers', 'pcciRegistration', 'supportingDocuments',
  'healthNotes', 'availabilityNotes', 'temperament', 'temperamentTraits',
  'activityLevel', 'careNeeds', 'petCompatibility', 'videos', 'location',
  'pickupInstructions', 'adoptionDetails', 'listingType'
];

const pickPetListingFields = input => Object.fromEntries(
  PET_LISTING_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(input || {}, field))
    .map(field => [field, input[field]])
);

const resolvePublicStores = async (query = {}) => {
  const ownerIds = await getCustomerVisibleOwnerIds();
  const extra = {};
  if (query.city) extra['contactInfo.address.city'] = { $regex: new RegExp(escapeRegex(query.city), 'i') };
  let stores = await Store.find(
    withCustomerComplianceFilter(buildCustomerVisibleStoreFilter(ownerIds, extra))
  ).select('_id contactInfo.address.coordinates').lean();

  const hasLatitude = query.latitude !== undefined && query.latitude !== '';
  const hasLongitude = query.longitude !== undefined && query.longitude !== '';
  if (hasLatitude !== hasLongitude) throw Object.assign(new Error('Both latitude and longitude are required.'), { statusCode: 400 });
  if (hasLatitude) {
    const latitude = Number(query.latitude);
    const longitude = Number(query.longitude);
    const radiusKm = query.radiusKm === undefined || query.radiusKm === '' ? 5 : Number(query.radiusKm);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
        || !Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 100) {
      throw Object.assign(new Error('Invalid location filter.'), { statusCode: 400 });
    }
    stores = filterStoresByDistance(stores, { lat: latitude, lng: longitude }, radiusKm);
  }
  return stores;
};

const toPublicPet = (pet) => {
  const publicPet = pet?.toObject ? pet.toObject() : { ...pet };
  delete publicPet.vetRecords;
  delete publicPet.proofOfOwnership;
  delete publicPet.permits;
  delete publicPet.supportingDocuments;
  delete publicPet.pickupInstructions;

  if (!isIndividualPetRecord(publicPet)) {
    publicPet.isAvailable = false;
    publicPet.status = 'unavailable';
    publicPet.legacyGroupedListing = true;
  }
  delete publicPet.quantity;
  delete publicPet.reservation;

  const pcci = publicPet.pcciRegistration;
  if (pcci) {
    publicPet.pcciRegistration = {
      status: pcci.status,
      registrationNumber: pcci.registrationNumber || '',
      informationStatus: pcci.informationStatus,
      certificateAvailable: Boolean(pcci.certificateUrl)
    };
  }
  return publicPet;
};

// Get all pets with filtering
const getAllPets = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const visibleStores = await resolvePublicStores(req.query);
    const publicListingFilter = buildPublicPetFilter(req.query, visibleStores.map(store => store._id));
    const skip = (page - 1) * limit;
    const pets = await Pet.find(publicListingFilter)
      .populate('addedBy', 'username firstName lastName')
      .populate('store', 'name contactInfo.address ratings stats verificationStatus')
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Pet.countDocuments(publicListingFilter);

    res.json({
      pets: pets.map(toPublicPet),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalPets: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get pets error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    res.status(500).json({ message: 'Server error' });
  }
};

// Get pet by ID
const getPetById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid pet identifier' });
    }
    const pet = await Pet.findById(req.params.id)
      .populate('addedBy', 'username firstName lastName')
      .populate('store', 'name contactInfo.address ratings stats verificationStatus');

    if (!pet || pet.isDeleted) {
      return res.status(404).json({ message: 'Pet not found' });
    }
    if (req.baseUrl?.includes('/admin')
        && !(await canOperateStore(req.user, pet.store?._id || pet.store, ['pets.view', 'pets.manage', 'inventory.view']))) {
      return res.status(403).json({ message: 'Access denied for this pet listing.' });
    }

    const isAdminRequest = req.baseUrl?.includes('/admin');
    if (!isAdminRequest) {
      if (!isMarketplacePet(pet)) {
        return res.status(404).json({ message: 'Pet not found or unavailable' });
      }
      const ownerIds = await getCustomerVisibleOwnerIds();
      const publicStore = await Store.findOne(withCustomerComplianceFilter(buildCustomerVisibleStoreFilter(ownerIds, {
        _id: pet.store?._id || pet.store
      }))).select('name contactInfo.address ratings stats verificationStatus');
      if (!publicStore) return res.status(404).json({ message: 'Pet not found or unavailable' });
      const publicPet = toPublicPet(pet);
      publicPet.store = publicStore.toObject ? publicStore.toObject() : publicStore;
      return res.json({ pet: publicPet });
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
    
    if (isOperationalStaff(req.user)) {
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

    console.log('📦 Creating pet listing:', {
      name: req.body.name,
      species: req.body.species,
      addedBy: req.user._id,
      store: store._id
    });
    
    const derivedAge = derivePetAge(req.body.birthday);
    if (!derivedAge.valid) return res.status(400).json({ message: derivedAge.message });

    const listingData = pickPetListingFields(req.body);
    delete listingData.adoptionDetails;
    listingData.images = normalizeCatalogImages(listingData.images, { required: true });
    if (listingData.weight === '' || listingData.weight === null || listingData.weight === undefined) {
      delete listingData.weight;
    } else {
      listingData.weight = Number(listingData.weight);
    }
    const petData = {
      ...listingData,
      age: derivedAge.age,
      ageUnit: derivedAge.ageUnit,
      listingType: 'sale',
      quantity: 1,
      status: 'available',
      isAvailable: true,
      paymentType: 'online_only',
      allowedPaymentMethods: ['paymongo'],
      paymentConfig: req.body.paymentConfig === 'deposit_first' ? 'deposit_first' : 'full_payment',
      addedBy: req.user._id,
      store: store._id
    };

    const pet = new Pet(petData);
    await pet.save();

    const populatedPet = await Pet.findById(pet._id).populate('addedBy', 'username firstName lastName');

    res.status(201).json({
      message: 'Pet listing created successfully',
      pet: populatedPet
    });
  } catch (error) {
    console.error('Create pet error:', error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
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

    if (!(await canOperateStore(req.user, pet.store, ['pets.manage', 'inventory.adjust']))) {
      console.log('📝 updatePet ACCESS DENIED');
      return res.status(403).json({ message: 'Access denied' });
    }

    console.log('📝 updatePet PERMISSION GRANTED');

    const updateData = pickPetListingFields(req.body);
    if (Object.prototype.hasOwnProperty.call(updateData, 'images')) {
      updateData.images = normalizeCatalogImages(updateData.images, { required: true });
    }
    const clearWeight = Object.prototype.hasOwnProperty.call(updateData, 'weight')
      && (updateData.weight === '' || updateData.weight === null);
    if (clearWeight) delete updateData.weight;
    else if (Object.prototype.hasOwnProperty.call(updateData, 'weight')) updateData.weight = Number(updateData.weight);
    updateData.paymentType = 'online_only';
    updateData.allowedPaymentMethods = ['paymongo'];
    updateData.paymentConfig = updateData.paymentConfig === 'deposit_first' ? 'deposit_first' : 'full_payment';

    if (updateData.listingType === 'adoption' && pet.listingType !== 'adoption') {
      return res.status(400).json({ message: 'Seller pet listings must be for sale.' });
    }

    // Validate Birthday (Cannot be in the future)
    if (updateData.birthday) {
      const derivedAge = derivePetAge(updateData.birthday);
      if (!derivedAge.valid) return res.status(400).json({ message: derivedAge.message });
      updateData.age = derivedAge.age;
      updateData.ageUnit = derivedAge.ageUnit;
    }

    console.log('📝 updatePet CLEANED DATA:', updateData);
    
    // Ensure store is set if missing (for legacy data or manual fixes)
    if (!pet.store) {
      console.log('📝 updatePet ATTEMPTING TO FIX MISSING STORE');
      let storeId = req.user.store;
      if (!storeId && (isStoreAdmin(req.user) || isPlatformAdmin(req.user))) {
        const storeRes = await Store.findOne({ owner: req.user._id });
        if (storeRes) storeId = storeRes._id;
      }
      if (storeId) {
        updateData.store = storeId;
        console.log('📝 updatePet FIXED STORE:', storeId);
      }
    }

    console.log('📝 updatePet EXECUTING UPDATE');
    const updateOperation = { $set: updateData };
    const unset = {};
    if (clearWeight) unset.weight = 1;
    if (Object.keys(unset).length) updateOperation.$unset = unset;
    const updatedPet = await Pet.findByIdAndUpdate(
      req.params.id,
      updateOperation,
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
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
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

    if (!(await canOperateStore(req.user, pet.store, ['pets.manage', 'inventory.adjust']))) {
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
