const Pet = require('../models/Pet');
const Store = require('../models/Store');
const { isPlatformAdmin, isStoreAdmin, isOperationalStaff } = require('../config/permissions');
const { canOperateStore } = require('../utils/authorizationPolicy');

// Admin-only function for getting pets with multi-tenant isolation
const getAllAdminPets = async (req, res) => {
  try {
    console.log('🐕 getAllAdminPets called - ADMIN ROUTE');

    const { species, breed, size, gender, minAge, maxAge, minPrice, maxPrice, search, isAvailable, storeId, page = 1, limit = 10 } = req.query;

    let filter = { isDeleted: { $ne: true } };

    if (isPlatformAdmin(req.user)) {
      // Super-admins see everything
      if (storeId) filter.store = storeId;
      console.log('🔓 Super-admin detected');
    } else if (isOperationalStaff(req.user)) {
      // Staff sees pets from their assigned store
      if (req.user.store) {
        const store = await Store.findById(req.user.store);
        if (store) {
          filter.$or = [
            { store: req.user.store },
            { addedBy: store.owner }
          ];
        } else {
          filter.store = req.user.store;
        }
      } else {
        filter.addedBy = req.user.createdBy;
      }
    } else if (isStoreAdmin(req.user)) {
      // Admin - find stores they own
      const adminStores = await Store.find({ owner: req.user._id }).select('_id');
      const storeIds = adminStores.map(s => s._id);
      
      if (storeId) {
        // Specific store view
        if (!storeIds.map(id => id.toString()).includes(storeId)) {
          return res.status(403).json({ message: 'You do not have access to this store' });
        }
        filter.store = storeId;
      } else if (storeIds.length > 0) {
        // All stores owned by admin
        filter.store = { $in: storeIds };
      } else {
        // Fallback for independent admin
        filter.addedBy = req.user._id;
      }
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
    if (minAge) filter.age = { $gte: parseInt(minAge) };
    if (maxAge) {
      if (filter.age) {
        filter.age.$lte = parseInt(maxAge);
      } else {
        filter.age = { $lte: parseInt(maxAge) };
      }
    }
    if (minPrice) filter.price = { $gte: parseFloat(minPrice) };
    if (maxPrice) {
      if (filter.price) {
        filter.price.$lte = parseFloat(maxPrice);
      } else {
        filter.price = { $lte: parseFloat(maxPrice) };
      }
    }

    if (search) {
      const searchFilter = { $or: [
        { name: new RegExp(search, 'i') },
        { breed: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') }
      ] };
      const tenantFilter = { ...filter };
      filter = { $and: [tenantFilter, searchFilter] };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const pets = await Pet.find(filter)
      .populate('addedBy', 'username firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Pet.countDocuments(filter);

    console.log('📊 Found admin pets:', pets.length);
    console.log('📊 Total admin pets:', total);

    // Debug: Show pet owners
    if (pets.length > 0) {
      console.log('🐕 Admin pet owners:');
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
    console.error('Get admin pets error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Approve a pet listing
const approvePet = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    const pet = await Pet.findById(id);
    if (!pet) return res.status(404).json({ message: 'Pet listing not found' });

    // Multi-tenant check
    if (!(await canOperateStore(req.user, pet.store, ['pets.manage', 'inventory.adjust']))) {
      return res.status(403).json({ message: 'Access denied for this pet listing.' });
    }

    pet.approvalStatus = 'approved';
    pet.status = 'available';
    pet.isAvailable = true;
    if (adminNotes) pet.description += `\n\n[Admin Note]: ${adminNotes}`;
    
    await pet.save();

    res.json({ message: 'Pet listing approved successfully', pet });
  } catch (error) {
    console.error('Approve pet error:', error);
    res.status(500).json({ message: 'Server error during approval' });
  }
};

// Reject a pet listing
const rejectPet = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    if (!adminNotes) return res.status(400).json({ message: 'Rejection notes are required' });

    const pet = await Pet.findById(id);
    if (!pet) return res.status(404).json({ message: 'Pet listing not found' });
    if (!(await canOperateStore(req.user, pet.store, ['pets.manage', 'inventory.adjust']))) {
      return res.status(403).json({ message: 'Access denied for this pet listing.' });
    }

    pet.approvalStatus = 'rejected';
    pet.isAvailable = false;
    pet.description += `\n\n[Rejection Reason]: ${adminNotes}`;

    await pet.save();

    res.json({ message: 'Pet listing rejected', pet });
  } catch (error) {
    console.error('Reject pet error:', error);
    res.status(500).json({ message: 'Server error during rejection' });
  }
};

module.exports = {
  getAllAdminPets,
  approvePet,
  rejectPet
};
