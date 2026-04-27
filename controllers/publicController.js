const User = require('../models/User');
const Store = require('../models/Store');
const Pet = require('../models/Pet');
const Product = require('../models/Product');
const Service = require('../models/Service');
const Review = require('../models/Review');

// Get all data needed for the landing page in one call
const getLandingPageData = async (req, res) => {
  try {
    const [
      pets,
      products,
      services,
      experts,
      stats
    ] = await Promise.all([
      // 1. Featured Pets
      Pet.find({ isAvailable: true, isDeleted: { $ne: true } })
        .sort({ featured: -1, createdAt: -1 })
        .limit(8)
        .select('name breed price images gender age description'),
      
      // 2. Featured Products
      Product.find({ isActive: true, isDeleted: { $ne: true } })
        .sort({ featured: -1, createdAt: -1 })
        .limit(8)
        .select('name price images category stockQuantity'),
      
      // 3. Best Services
      Service.find({ isActive: true, isDeleted: { $ne: true } })
        .sort({ featured: -1, createdAt: -1 })
        .limit(4)
        .select('name price duration category description images'),
      
      // 4. Verified Experts (Public Professionals)
      User.find({
        role: 'staff',
        isActive: true,
        isDeleted: { $ne: true },
        'professionalProfile.isPublic': true
      })
      .limit(4)
      .select('firstName lastName avatar staffType professionalProfile reputation lastSeen'),
      
      // 5. Accurate Platform Stats
      Promise.all([
        Store.countDocuments({ isActive: true }),
        User.countDocuments({ role: 'staff', isActive: true }),
        Product.countDocuments({ isActive: true }),
        Service.countDocuments({ isActive: true })
      ])
    ]);

    res.json({
      pets,
      products,
      services,
      experts,
      stats: {
        stores: stats[0],
        experts: stats[1],
        products: stats[2],
        services: stats[3]
      }
    });
  } catch (error) {
    console.error('Landing page data error:', error);
    res.status(500).json({ message: 'Server error fetching landing data' });
  }
};

module.exports = {
  getLandingPageData
};
