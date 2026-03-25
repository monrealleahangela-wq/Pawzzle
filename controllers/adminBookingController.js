const Booking = require('../models/Booking');
const Store = require('../models/Store');
const Voucher = require('../models/Voucher');

// Auto-cancels bookings that are still pending and whose date has passed
const autoCancelExpiredBookings = async (filterBase = {}) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiredQuery = {
      ...filterBase,
      status: 'pending',
      bookingDate: { $lt: today }
    };

    const expiredBookings = await Booking.find(expiredQuery);
    if (expiredBookings.length > 0) {
      const ids = expiredBookings.map(b => b._id);
      
      await Booking.updateMany(
        { _id: { $in: ids } },
        { 
          $set: { 
            status: 'cancelled', 
            adminNotes: 'Automatically cancelled by system: scheduled date passed without confirmation.' 
          } 
        }
      );

      // Revert voucher usage if any
      for (const booking of expiredBookings) {
        if (booking.voucher) {
          await Voucher.findByIdAndUpdate(booking.voucher, { $inc: { usedCount: -1 } });
        }
      }

      console.log(`🕒 [ADMIN] Auto-cancelled ${expiredBookings.length} expired pending bookings`);
    }
  } catch (error) {
    console.error('Auto-cancel bookings error:', error);
  }
};

// Admin-only function for getting bookings with multi-tenant isolation
const getAllAdminBookings = async (req, res) => {
  try {
    console.log('📅 getAllAdminBookings called - ADMIN ROUTE');

    const { status, paymentMethod, search, page = 1, limit = 10 } = req.query;

    // Multi-tenant isolation: determine store for admin or staff
    let filter = { isDeleted: { $ne: true } };

    if (req.user.role === 'super_admin') {
      console.log('🔓 Super-admin detected - showing all bookings');
    } else if (req.user.role === 'staff') {
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
      // Admin - find by store ownership or addedBy
      const adminStore = await Store.findOne({ owner: req.user._id });
      if (adminStore) {
        filter.store = adminStore._id;
      } else {
        filter.addedBy = req.user._id;
      }
    }

    if (status) filter.status = status;
    if (paymentMethod) filter.paymentMethod = paymentMethod;

    if (search) {
      filter.$or = [
        { customerName: new RegExp(search, 'i') },
        { customerEmail: new RegExp(search, 'i') },
        { customerPhone: new RegExp(search, 'i') }
      ];
    }

    // Run auto-cleanup within this admin's scope
    await autoCancelExpiredBookings(filter);

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const bookings = await Booking.find(filter)
      .populate('customer', 'username firstName lastName email')
      .populate('service', 'name price duration requirements')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(filter);

    console.log('📊 Found admin bookings:', bookings.length);
    console.log('📊 Total admin bookings:', total);

    // Debug: Show booking owners
    if (bookings.length > 0) {
      console.log('📅 Admin booking owners:');
      bookings.forEach((booking, index) => {
        console.log(`  ${index + 1}. Booking: ${booking._id}, AddedBy: ${booking.addedBy}, Customer: ${booking.customer?.username || booking.customer}`);
      });
    }

    res.json({
      bookings,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalBookings: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get admin bookings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllAdminBookings
};
