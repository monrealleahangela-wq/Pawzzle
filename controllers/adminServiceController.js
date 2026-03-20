const Service = require('../models/Service');
const Store = require('../models/Store');

// Admin-only function for getting services with multi-tenant isolation
const getAllAdminServices = async (req, res) => {
  try {
    console.log('🔧 getAllAdminServices called - ADMIN ROUTE');

    const { category, minPrice, maxPrice, search, homeService, page = 1, limit = 10 } = req.query;

    let filter = { isDeleted: { $ne: true } };

    if (req.user.role === 'super_admin') {
      // Super-admins see everything
      console.log('🔓 Super-admin detected - showing all data');
    } else if (req.user.role === 'staff') {
      // Staff sees services from their assigned store
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
      } else if (req.user.createdBy) {
        // Fallback: If staff has no store but has a creator, show creator's services
        filter.addedBy = req.user.createdBy;
      }
    } else {
      // Admin - find stores they own
      const adminStores = await Store.find({ owner: req.user._id }).select('_id');
      const storeIds = adminStores.map(s => s._id);
      filter.$or = [
        { addedBy: req.user._id },
        { store: { $in: storeIds } }
      ];
    }

    if (homeService === 'true') {
      filter.homeServiceAvailable = true;
    } else if (homeService === 'false') {
      filter.homeServiceAvailable = false;
    }

    if (category) filter.category = category;
    
    // Robust Price Parsing
    if (minPrice && !isNaN(parseFloat(minPrice))) {
      filter.price = { $gte: parseFloat(minPrice) };
    }
    if (maxPrice && !isNaN(parseFloat(maxPrice))) {
      if (filter.price) {
        filter.price.$lte = parseFloat(maxPrice);
      } else {
        filter.price = { $lte: parseFloat(maxPrice) };
      }
    }

    if (search) {
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
        { category: new RegExp(search, 'i') }
      ];
    }

    // Robust Pagination Parsing
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 10);
    const skip = (pageNum - 1) * limitNum;

    const services = await Service.find(filter)
      .populate('addedBy', 'username firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Service.countDocuments(filter);

    console.log('📊 Found admin services:', services.length);

    res.json({
      services,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalServices: total,
        hasNext: pageNum * limitNum < total,
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Get admin services error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllAdminServices
};
