const Order = require('../models/Order');
const Store = require('../models/Store');

// Admin-only function for getting orders with multi-tenant isolation
const getAllAdminOrders = async (req, res) => {
  try {
    console.log('📦 getAllAdminOrders called - ADMIN ROUTE');
    console.log('👤 Admin user:', req.user);
    console.log('🔍 Request path:', req.path);
    console.log('🔍 Original URL:', req.originalUrl);

    const mongoose = require('mongoose');
    // Multi-tenant isolation: determine stores for admin or staff
    let filter = {};
    const { status, paymentMethod, search, storeId, page = 1, limit = 10 } = req.query;

    const p = Math.max(1, parseInt(page) || 1);
    const l = Math.max(1, parseInt(limit) || 10);

    if (req.user.role === 'super_admin') {
      // Super-admins see everything
      if (storeId) filter.store = new mongoose.Types.ObjectId(storeId);
      console.log('🔓 Super-admin detected');
    } else if (req.user.role === 'staff') {
      // Staff sees orders from their assigned store
      if (req.user.store) {
        filter.store = new mongoose.Types.ObjectId(req.user.store);
      } else {
        return res.status(403).json({ message: 'Staff not assigned to a store' });
      }
    } else {
      // Admin - find by store ownership
      const adminStores = await Store.find({ owner: req.user._id }).select('_id');
      const storeIds = adminStores.map(s => s._id);

      if (storeId) {
        // Specific store view
        if (!storeIds.map(id => id.toString()).includes(storeId)) {
          return res.status(403).json({ message: 'You do not have access to this store' });
        }
        filter.store = new mongoose.Types.ObjectId(storeId);
      } else if (storeIds.length > 0) {
        // All stores owned by admin
        filter.store = { $in: storeIds };
      } else {
        // Fallback or legacy (addedBy)
        filter.addedBy = req.user._id;
      }
    }

    console.log('🔒 Multi-tenant isolation - showing data for admin:', req.user._id);
    console.log('👤 Admin email:', req.user.email);
    console.log('👤 Admin username:', req.user.username);
    console.log('🔍 Filter applied:', JSON.stringify(filter, null, 2));

    if (status) filter.status = status;
    if (paymentMethod) filter.paymentMethod = paymentMethod;

    if (search) {
      filter.$or = [
        { orderNumber: new RegExp(search, 'i') },
        { phoneNumber: new RegExp(search, 'i') },
        { notes: new RegExp(search, 'i') }
      ];
    }

    const skip = (p - 1) * l;

    const orders = await Order.find(filter)
      .populate('customer', 'username firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(l);

    const total = await Order.countDocuments(filter);

    console.log('📊 Found admin orders:', orders.length);
    console.log('📊 Total admin orders:', total);

    // Debug: Show order owners
    if (orders.length > 0) {
      console.log('📦 Admin order owners:');
      orders.forEach((order, index) => {
        console.log(`  ${index + 1}. Order: ${order._id}, AddedBy: ${order.addedBy}, Customer: ${order.customer?.username || order.customer}`);
      });
    }

    res.json({
      orders,
      pagination: {
        currentPage: p,
        totalPages: Math.ceil(total / l),
        totalOrders: total,
        hasNext: p * l < total,
        hasPrev: p > 1
      }
    });
  } catch (error) {
    console.error('Get admin orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllAdminOrders
};
