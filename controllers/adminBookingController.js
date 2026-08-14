const Booking = require('../models/Booking');
const Voucher = require('../models/Voucher');
const { hasPermission, isPlatformAdmin, isStoreAdmin, isOperationalStaff } = require('../config/permissions');
const { getAuthorizedStoreIds } = require('../utils/authorizationPolicy');

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

    if (isPlatformAdmin(req.user)) {
      console.log('🔓 Super-admin detected - showing all bookings');
    } else if (isOperationalStaff(req.user)) {
      if (!hasPermission(req.user, 'bookings.assigned') && !hasPermission(req.user, 'bookings.manage')) {
        return res.status(403).json({ message: 'Access denied. This staff role cannot access service bookings.' });
      }
      const storeIds = await getAuthorizedStoreIds(req.user);
      if (!storeIds?.length) return res.status(403).json({ message: 'No store is assigned to this account.' });
      filter.store = { $in: storeIds };
      if (!hasPermission(req.user, 'bookings.manage')) {
        filter.$and = [{ $or: [{ staff: req.user._id }, { serviceProvider: req.user._id }] }];
      }
    } else if (isStoreAdmin(req.user)) {
      // Admin - find by store ownership or addedBy
      const storeIds = await getAuthorizedStoreIds(req.user);
      if (!storeIds?.length) return res.status(403).json({ message: 'No store is assigned to this account.' });
      filter.store = { $in: storeIds };
    } else {
      return res.status(403).json({ message: 'Access denied.' });
    }

    if (status) filter.status = status;
    if (paymentMethod) filter.paymentMethod = paymentMethod;

    if (search) {
      const searchScope = { $or: [
        { customerName: new RegExp(search, 'i') },
        { customerEmail: new RegExp(search, 'i') },
        { customerPhone: new RegExp(search, 'i') }
      ] };
      filter.$and = [...(filter.$and || []), searchScope];
    }

    // Run auto-cleanup within this admin's scope
    await autoCancelExpiredBookings(filter);

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const bookings = await Booking.find(filter)
      .populate('customer', 'username firstName lastName email')
      .populate('service', 'name description price duration requirements category')
      .populate('store', 'name owner')
      .populate('staff', 'firstName lastName avatar staffType professionalProfile.professionalTitle professionalProfile.specialty professionalProfile.experienceYears professionalProfile.rating professionalProfile.reviewCount professionalProfile.verification.status')
      .populate('serviceProvider', 'firstName lastName avatar staffType professionalProfile.professionalTitle professionalProfile.specialty professionalProfile.experienceYears professionalProfile.rating professionalProfile.reviewCount professionalProfile.verification.status')
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
