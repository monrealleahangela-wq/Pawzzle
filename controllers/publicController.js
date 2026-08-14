const User = require('../models/User');
const Store = require('../models/Store');
const Pet = require('../models/Pet');
const Product = require('../models/Product');
const Service = require('../models/Service');
const Review = require('../models/Review');
const { getPublicRecaptchaConfig } = require('../utils/captchaVerifier');

// Public site keys are designed to be sent to browsers. The matching secret
// remains server-only and is never included in this response.
const getCaptchaConfig = (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(getPublicRecaptchaConfig());
};

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
        Store.countDocuments({ isActive: true, isDeleted: { $ne: true } }),
        Pet.countDocuments({ isAvailable: true, isDeleted: { $ne: true } }),
        User.countDocuments({ role: 'staff', isActive: true, isDeleted: { $ne: true } }),
        Product.countDocuments({ isActive: true, isDeleted: { $ne: true } }),
        Service.countDocuments({ isActive: true, isDeleted: { $ne: true } })
      ])
    ]);

    res.json({
      pets,
      products,
      services,
      experts,
      stats: {
        stores: stats[0],
        pets: stats[1],
        experts: stats[2],
        products: stats[3],
        services: stats[4]
      }
    });
  } catch (error) {
    console.error('Landing page data error:', error);
    res.status(500).json({ message: 'Server error fetching landing data' });
  }
};

module.exports = {
  getLandingPageData,
  getCaptchaConfig
};
