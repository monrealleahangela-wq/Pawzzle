const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const User = require('../models/User');
const Store = require('../models/Store');
const Voucher = require('../models/Voucher');
const RevenueService = require('../services/revenueService');
const { createNotification } = require('./notificationController');

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

      console.log(`🕒 Auto-cancelled ${expiredBookings.length} expired pending bookings`);
    }
  } catch (error) {
    console.error('Auto-cancel bookings error:', error);
  }
};

// Create a new booking
const createBooking = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const messages = errors.array().map(e => e.msg).join(', ');
      return res.status(400).json({ message: `Validation failed: ${messages}`, errors: errors.array() });
    }

    const {
      serviceId,
      pet,
      bookingDate,
      startTime,
      endTime,
      isHomeService,
      serviceAddress,
      notes,
      voucherCode
    } = req.body;

    // Get service details
    const service = await Service.findById(serviceId).populate('store');
    if (!service || !service.isActive) {
      return res.status(404).json({ message: 'Service not found or unavailable' });
    }

    // Check if home service is available
    if (isHomeService && !service.homeServiceAvailable) {
      return res.status(400).json({ message: 'Home service is not available for this service' });
    }

    // Calculate total price
    let basePrice = service.price;
    if (isHomeService) {
      basePrice += service.homeServicePrice;
    }

    // Process Voucher if provided
    let discountAmount = 0;
    let appliedVoucherId = null;
    const storeId = service.store?._id || service.store;

    if (voucherCode) {
      const voucher = await Voucher.findOne({
        code: voucherCode.toUpperCase(),
        isActive: true,
        store: storeId
      });

      if (voucher) {
        const now = new Date();
        const isValidDate = now >= voucher.startDate && now <= voucher.endDate;
        const isWithinLimit = voucher.usageLimit === null || voucher.usedCount < voucher.usageLimit;
        const meetsMinPurchase = basePrice >= voucher.minPurchase;

        if (isValidDate && isWithinLimit && meetsMinPurchase) {
          if (voucher.discountType === 'percentage') {
            discountAmount = (basePrice * (voucher.discountValue / 100));
          } else {
            discountAmount = voucher.discountValue;
          }

          discountAmount = Math.min(discountAmount, basePrice);
          appliedVoucherId = voucher._id;

          // Increment used count
          voucher.usedCount += 1;
          await voucher.save();
        }
      }
    }

    const booking = new Booking({
      customer: req.user._id,
      addedBy: service.addedBy || (service.store ? service.store.owner : req.user._id),
      service: serviceId,
      store: storeId,
      pet,
      bookingDate,
      startTime,
      endTime,
      isHomeService,
      serviceAddress: isHomeService ? serviceAddress : undefined,
      totalPrice: basePrice - discountAmount,
      voucher: appliedVoucherId,
      discountAmount,
      notes
    });

    await booking.save();

    // Auto-populate for return
    await booking.populate([
      { path: 'service', select: 'name duration price' },
      { path: 'store', select: 'name' }
    ]);

    res.status(201).json(booking);

    // Notify store owner about new booking
    await createNotification({
      recipient: booking.addedBy,
      sender: req.user._id,
      type: 'new_booking',
      title: 'New Booking Request',
      message: `You have a new booking request for ${booking.service.name}.`,
      relatedId: booking._id,
      relatedModel: 'Booking'
    });
  } catch (error) {
    console.error('❌ Create booking error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// Get bookings for a customer
const getCustomerBookings = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    let filter = { customer: req.user._id };
    if (status) filter.status = status;

    // Run auto-cleanup for this customer's expired bookings
    await autoCancelExpiredBookings({ customer: req.user._id });

    const skip = (page - 1) * limit;
    const bookings = await Booking.find(filter)
      .populate('service', 'name category duration')
      .populate('store', 'name contactInfo.address')
      .sort({ bookingDate: -1, startTime: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(filter);

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
    console.error('Get customer bookings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get bookings for a store (admin only)
const getStoreBookings = async (req, res) => {
  try {
    const { status, date, page = 1, limit = 20 } = req.query;

    let filter = { store: req.params.storeId };
    if (status) filter.status = status;
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      filter.bookingDate = { $gte: startDate, $lt: endDate };
    }

    // Verify store ownership
    const store = await Store.findById(req.params.storeId);
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    // Check permissions
    if (req.user.role === 'admin' && store.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only view bookings for your own store' });
    }

    // Run auto-cleanup for this store's expired bookings
    await autoCancelExpiredBookings({ store: req.params.storeId });

    const skip = (page - 1) * limit;
    const bookings = await Booking.find(filter)
      .populate('customer', 'firstName lastName email phone')
      .populate('service', 'name category duration')
      .sort({ bookingDate: -1, startTime: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(filter);

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
    console.error('Get store bookings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update booking status (admin only)
const updateBookingStatus = async (req, res) => {
  try {
    const { status, adminNotes } = req.body;

    const booking = await Booking.findById(req.params.id).populate('store');
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Check permissions: Owner, store staff, or super admin
    const isStoreOwner = req.user.role === 'admin' && booking.store && booking.store.owner && booking.store.owner.toString() === req.user._id.toString();
    const isStoreStaff = req.user.role === 'staff' && req.user.store && booking.store && booking.store._id.toString() === req.user.store.toString();

    if (req.user.role !== 'super_admin' && !isStoreOwner && !isStoreStaff) {
      return res.status(403).json({ message: 'You can only update bookings for your own store' });
    }

    const oldStatus = booking.status;
    booking.status = status;
    if (adminNotes) booking.adminNotes = adminNotes;

    // Financial Impact Handling
    if (status === 'completed' && oldStatus !== 'completed' && !booking.isRevenueRecorded) {
      // Automatically record revenue if marked as completed (assuming it's paid in person if not already paid)
      await RevenueService.recordPayment('booking', booking._id);
    } else if (status === 'cancelled' && oldStatus !== 'cancelled' && booking.isRevenueRecorded) {
      // Reverse revenue if a recorded booking is cancelled
      await RevenueService.reversePayment('booking', booking._id);
      booking.paymentStatus = 'refunded';
    }

    // Decrement voucher usage if booking is cancelled
    if (status === 'cancelled' && booking.voucher) {
      await Voucher.findByIdAndUpdate(booking.voucher, { $inc: { usedCount: -1 } });
      console.log(`🎫 Voucher usage REVERSED for booking #${booking._id} due to cancellation.`);
    }

    await booking.save();
    await booking.populate([
      { path: 'customer', select: 'firstName lastName email phone' },
      { path: 'service', select: 'name category' }
    ]);

    res.json(booking);

    // Notify customer about booking status update
    await createNotification({
      recipient: booking.customer._id,
      sender: req.user._id,
      type: 'booking_status',
      title: 'Booking Status Updated',
      message: `Your booking for ${booking.service.name} has been ${status}.`,
      relatedId: booking._id,
      relatedModel: 'Booking'
    });
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update payment method
const updatePaymentMethod = async (req, res) => {
  try {
    const { paymentMethod } = req.body;

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Customer can only update their own bookings
    if (booking.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only update your own bookings' });
    }

    booking.paymentMethod = paymentMethod;
    await booking.save();

    res.json(booking);
  } catch (error) {
    console.error('Update payment method error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Cancel booking
const cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Customer can cancel their own bookings
    if (booking.customer.toString() === req.user._id.toString()) {
      if (booking.status === 'confirmed' || booking.status === 'in_progress') {
        return res.status(400).json({ message: 'Cannot cancel confirmed or in-progress booking' });
      }
    }
    // Admin/Staff can cancel bookings for their store
    else if (req.user.role === 'admin' || req.user.role === 'staff') {
      const store = await Store.findById(booking.store);
      
      const isStoreOwner = req.user.role === 'admin' && store.owner.toString() === req.user._id.toString();
      const isStoreStaff = req.user.role === 'staff' && req.user.store && booking.store && booking.store.toString() === req.user.store.toString();

      if (!isStoreOwner && !isStoreStaff && req.user.role !== 'super_admin') {
        return res.status(403).json({ message: 'You can only cancel bookings for your own store' });
      }
    } else {
      return res.status(403).json({ message: 'Access denied' });
    }

    booking.status = 'cancelled';
    await booking.save();

    res.json({ message: 'Booking cancelled successfully' });

    // Notify the other party about cancellation
    const isCustomer = req.user._id.toString() === booking.customer.toString();
    await createNotification({
      recipient: isCustomer ? booking.addedBy : booking.customer,
      sender: req.user._id,
      type: 'booking_status',
      title: 'Booking Cancelled',
      message: `Booking for ${booking.service?.name || 'service'} has been cancelled by the ${isCustomer ? 'customer' : 'store'}.`,
      relatedId: booking._id,
      relatedModel: 'Booking'
    });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all bookings (super admin read-only access)
const getAllBookings = async (req, res) => {
  try {
    console.log('📅 getAllBookings called with path:', req.path);
    console.log('👤 User:', req.user);

    const { page = 1, limit = 10, status, search } = req.query;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};

    // Check if this is an admin route (check full original URL)
    const isAdminRoute = req.originalUrl && req.originalUrl.includes('/admin');
    console.log('� Booking request - Original URL:', req.originalUrl);
    console.log('📅 Booking request - Is admin route:', isAdminRoute);

    // If admin route, filter by admin user ID for complete data isolation
    if (isAdminRoute && req.user.role === 'admin') {
      // Multi-tenant isolation: filter bookings by admin user ID
      filter.addedBy = req.user._id;
      console.log('🔒 Multi-tenant isolation - showing bookings for admin:', req.user._id);
    }

    if (status && status !== 'all') {
      filter.status = status;
    }

    // Build search
    if (search && search !== '') {
      // Find matching users if searching by name/email
      const matchedUsers = await User.find({
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } }
        ]
      }, '_id');

      const matchedServices = await Service.find({
        name: { $regex: search, $options: 'i' }
      }, '_id');

      const userIds = matchedUsers.map(u => u._id);
      const serviceIds = matchedServices.map(s => s._id);

      filter.$or = [
        { customer: { $in: userIds } },
        { service: { $in: serviceIds } }
      ];

      // Also check specific booking fields
      if (mongoose.Types.ObjectId.isValid(search)) {
        filter.$or.push({ _id: search });
      }
    }

    console.log('🔍 Filter being used:', JSON.stringify(filter));

    // Run auto-cleanup for this filtered context
    await autoCancelExpiredBookings(filter);

    const bookings = await Booking.find(filter)
      .populate('customer', 'firstName lastName email phone')
      .populate('service', 'name duration price requirements')
      .populate('store', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(filter);

    console.log('📊 Found bookings:', bookings.length);
    console.log('📊 Total bookings:', total);

    res.json({
      bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching all bookings:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get calendar bookings for real-time updates
const getCalendarBookings = async (req, res) => {
  try {
    const { month, year } = req.query;

    // Build date range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Last day of previous month

    const bookings = await Booking.find({
      bookingDate: {
        $gte: startDate,
        $lt: endDate
      }
    })
      .populate('customer', 'firstName lastName')
      .populate('service', 'name')
      .sort({ bookingDate: 1 });

    res.json({ bookings });
  } catch (error) {
    console.error('Error fetching calendar bookings:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Confirm booking payment (Admin only)
const confirmBookingPayment = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('store');
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.status === 'cancelled') {
        return res.status(400).json({ message: 'Cannot confirm payment for a cancelled booking' });
    }

    if (booking.isRevenueRecorded) {
      return res.status(400).json({ message: 'Booking is already marked as paid' });
    }

    // Record revenue and update store stats via central service
    await RevenueService.recordPayment('booking', booking._id);

    res.json({
      message: 'Payment confirmed successfully',
      booking: await Booking.findById(booking._id).populate('customer', 'firstName lastName email phone').populate('service', 'name category')
    });

    // Notify customer about payment confirmation
    await createNotification({
      recipient: booking.customer,
      sender: req.user._id,
      type: 'booking_status',
      title: 'Booking Payment Confirmed',
      message: `Your payment for booking for ${booking.service?.name || 'service'} has been confirmed.`,
      relatedId: booking._id,
      relatedModel: 'Booking'
    });
  } catch (error) {
    console.error('Confirm booking payment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  createBooking,
  getCustomerBookings,
  getStoreBookings,
  getAllBookings,
  getCalendarBookings,
  updateBookingStatus,
  updatePaymentMethod,
  cancelBooking,
  confirmBookingPayment
};
