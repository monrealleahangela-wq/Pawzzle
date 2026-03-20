const Pet = require('../models/Pet');
const Store = require('../models/Store');

// Admin-only function for getting pets with multi-tenant isolation
const getAllAdminPets = async (req, res) => {
  try {
    console.log('🐕 getAllAdminPets called - ADMIN ROUTE');

    const { species, breed, size, gender, minAge, maxAge, minPrice, maxPrice, search, isAvailable, storeId, page = 1, limit = 10 } = req.query;

    let filter = { isDeleted: { $ne: true } };

    if (req.user.role === 'super_admin') {
      // Super-admins see everything
      if (storeId) filter.store = storeId;
      console.log('🔓 Super-admin detected');
    } else if (req.user.role === 'staff') {
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
    } else {
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
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { breed: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') }
      ];
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

module.exports = {
  getAllAdminPets
};
