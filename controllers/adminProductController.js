const Product = require('../models/Product');
const Store = require('../models/Store');

// Admin-only function for getting products with multi-tenant isolation
const getAllAdminProducts = async (req, res) => {
  try {
    console.log('🛍️ getAllAdminProducts called - ADMIN ROUTE');

    const { category, minPrice, maxPrice, search, isAvailable, page = 1, limit = 10 } = req.query;

    let filter = { isDeleted: { $ne: true } };
    
    if (req.user.role === 'super_admin') {
      console.log('🔓 Super-admin detected - showing all products');
    } else if (req.user.role === 'staff') {
      // Staff sees products from their assigned store
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
      // Admin - find all stores owned by this admin
      const adminStores = await Store.find({ owner: req.user._id }).select('_id');
      const storeIds = adminStores.map(s => s._id);

      // Filter by either the admin user ID OR any store they own
      filter.$or = [
        { addedBy: req.user._id },
        { store: { $in: storeIds } }
      ];
    }

    if (isAvailable === 'true') {
      filter.isAvailable = true;
    } else if (isAvailable === 'false') {
      filter.isAvailable = false;
    }

    if (category) filter.category = category;
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
        { brand: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
        { category: new RegExp(search, 'i') }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const products = await Product.find(filter)
      .populate('addedBy', 'username firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Product.countDocuments(filter);

    console.log('📊 Found admin products:', products.length);
    console.log('📊 Total admin products:', total);

    // Debug: Show product owners
    if (products.length > 0) {
      console.log('🛍️ Admin product owners:');
      products.forEach((product, index) => {
        console.log(`  ${index + 1}. Product: ${product.name}, AddedBy: ${product.addedBy}, AddedByUser: ${product.addedBy?.username || product.addedBy}`);
      });
    }

    res.json({
      products,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalProducts: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get admin products error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllAdminProducts
};
