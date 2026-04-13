const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const User = require('../models/User');
const Store = require('../models/Store');
const Voucher = require('../models/Voucher');
const PetProfile = require('../models/PetProfile');
const RevenueService = require('../services/revenueService');
const { createNotification, notifyStoreStaff } = require('./notificationController');

// Auto-cancels bookings that are still pending and whose date has passed or unapproved for too long
const autoCancelExpiredBookings = async (filterBase = {}) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date();

    // 1. Cancel unapproved bookings after 30 minutes
    const unapprovedLimit = new Date();
    unapprovedLimit.setMinutes(unapprovedLimit.getMinutes() - 30);

    const unapprovedQuery = {
      ...filterBase,
      status: 'pending',
      paymentStatus: { $ne: 'paid' }, // Skip if already paid
      createdAt: { $lt: unapprovedLimit }
    };

    const unapprovedBookings = await Booking.find(unapprovedQuery);
    if (unapprovedBookings.length > 0) {
      const ids = unapprovedBookings.map(b => b._id);
      await Booking.updateMany(
        { _id: { $in: ids } },
        { 
          $set: { 
            status: 'cancelled', 
            adminNotes: 'Automatically cancelled: Booking was not approved by the store within the 30-minute confirmation window.' 
          } 
        }
      );

      // Notify customers
      for (const b of unapprovedBookings) {
        await createNotification({
          recipient: b.customer,
          sender: b.addedBy, // Store owner
          type: 'booking_status',
          title: 'Booking Auto-Cancelled',
          message: `Your booking for ${b.service?.name || 'service'} was cancelled because the store didn't approve it within 30 minutes.`,
          relatedId: b._id,
          relatedModel: 'Booking'
        });
        
        // Revert voucher
        if (b.voucher) {
          await Voucher.findByIdAndUpdate(b.voucher, { $inc: { usedCount: -1 } });
        }
      }
      console.log(`🕒 Auto-cancelled ${unapprovedBookings.length} unapproved bookings`);
    }

    // 2. Cancel expired/late bookings (Original logic)
    const expiredQuery = {
      ...filterBase,
      status: { $in: ['pending', 'approved', 'confirmed'] },
      $or: [
        { bookingDate: { $lt: today } },
        {
          bookingDate: today
        }
      ]
    };

    const expiredBookings = await Booking.find(expiredQuery);
    
    // Filter for today's late arrivals
    const finalExpired = expiredBookings.filter(b => {
      if (new Date(b.bookingDate) < today) return true;
      
      const [h, m] = b.startTime.split(':');
      const sched = new Date(b.bookingDate);
      sched.setHours(parseInt(h), parseInt(m), 0, 0);
      const limit = new Date(sched.getTime() + 30 * 60000);
      return now > limit;
    });

    if (finalExpired.length > 0) {
      const ids = finalExpired.map(b => b._id);
      
      await Booking.updateMany(
        { _id: { $in: ids } },
        { 
          $set: { 
            status: 'cancelled', 
            adminNotes: 'Automatically cancelled by system: Arrived more than 30 minutes late or scheduled date passed.' 
          } 
        }
      );

      // Revert voucher usage if any
      for (const booking of finalExpired) {
        if (booking.voucher) {
          await Voucher.findByIdAndUpdate(booking.voucher, { $inc: { usedCount: -1 } });
        }
      }

      console.log(`🕒 Auto-cancelled ${finalExpired.length} expired/late bookings`);
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

    // Check if booking date/time is in the past
    const [year, month, day] = bookingDate.split('-').map(Number);
    const [hour, minute] = startTime.split(':').map(Number);
    const selectedDateTime = new Date(year, month - 1, day, hour, minute);
    if (selectedDateTime <= new Date()) {
      return res.status(400).json({ message: 'Cannot book a service for a past date or time' });
    }

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
      basePrice += service.homeServicePrice || 0;
    }

    // Dynamic Surcharge based on pet size (₱50 for Medium, ₱100 for Large, ₱150 for Extra Large)
    // Applied to Grooming/Bath related services
    const isGrooming = (service.name || '').toLowerCase().includes('grooming') || (service.name || '').toLowerCase().includes('bath');
    if (isGrooming && pet.size) {
      if (pet.size === 'Medium') basePrice += 50;
      else if (pet.size === 'Large') basePrice += 100;
      else if (pet.size === 'Extra Large') basePrice += 150;
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
      paymentMethod: req.body.paymentMethod || 'pending',
      voucher: appliedVoucherId,
      discountAmount,
      notes
    });

    await booking.save();

    // ── Auto-save / update pet profile for this customer ──
    try {
      const petName = (pet.name || '').trim();
      const petType = (pet.type || '').trim();

      if (petName && petType) {
        const existingPetProfile = await PetProfile.findOne({
          owner: req.user._id,
          name: { $regex: new RegExp(`^${petName}$`, 'i') },
          type: { $regex: new RegExp(`^${petType}$`, 'i') }
        });

        // Compute a calculated birthday if age is provided but birthday isn't
        let calculatedBirthday = pet.birthday;
        if (!calculatedBirthday && pet.age) {
          const bday = new Date();
          bday.setFullYear(bday.getFullYear() - parseInt(pet.age));
          bday.setMonth(0);
          bday.setDate(1);
          calculatedBirthday = bday;
        } else if (!calculatedBirthday) {
          // Absolute fallback to avoid validation error
          calculatedBirthday = new Date(2020, 0, 1);
        }

        if (existingPetProfile) {
          // Update details in case they changed
          existingPetProfile.breed = pet.breed || existingPetProfile.breed;
          existingPetProfile.size = pet.size || existingPetProfile.size;
          existingPetProfile.birthday = calculatedBirthday || existingPetProfile.birthday;
          existingPetProfile.weight = pet.weight || existingPetProfile.weight;
          existingPetProfile.gender = pet.gender || existingPetProfile.gender;
          existingPetProfile.color = pet.color || existingPetProfile.color;
          existingPetProfile.photo = pet.photo || existingPetProfile.photo;
          existingPetProfile.vaccinationStatus = pet.vaccinationStatus || existingPetProfile.vaccinationStatus;
          if (pet.specialNotes) existingPetProfile.specialNotes = pet.specialNotes;
          existingPetProfile.lastBookedAt = new Date();
          await existingPetProfile.save();
          console.log(`✅ Pet profile updated: ${petName}`);
        } else {
          // Create new profile
          await PetProfile.create({
            owner: req.user._id,
            name: petName,
            type: petType,
            breed: pet.breed || 'Mixed',
            size: pet.size || 'Small',
            birthday: calculatedBirthday,
            gender: pet.gender || 'Male',
            weight: pet.weight || 5,
            color: pet.color || '',
            photo: pet.photo || null,
            vaccinationStatus: pet.vaccinationStatus || 'Pending',
            specialNotes: pet.specialNotes || '',
            lastBookedAt: new Date()
          });
          console.log(`✅ New pet profile auto-saved: ${petName}`);
        }
      }
    } catch (petErr) {
      console.error('⚠️ Pet profile auto-save failed (non-critical):', petErr.message);
    }

    // Auto-populate for return
    await booking.populate([
      { path: 'service', select: 'name duration price' },
      { path: 'store', select: 'name' }
    ]);

    res.status(201).json(booking);

    // Notify store staff (Service Staff) about new booking
    await notifyStoreStaff(storeId, 'service_staff', {
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

    // 1. Ensure expired bookings are handled before fetching
    await autoCancelExpiredBookings({ customer: req.user._id });

    // 2. Build filter
    let filter = { customer: req.user._id };
    if (status && status !== 'all') filter.status = status;

    const skip = (page - 1) * limit;
    const bookings = await Booking.find(filter)
      .populate('service', 'name category duration price homeServicePrice')
      .populate('store', 'name contactInfo.address')
      .sort({ bookingDate: -1, startTime: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(filter);

    res.json({
      success: true,
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
    console.error('❌ Get customer bookings error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
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

    // Multi-phase Notification Standardization
    let notificationTitle = 'Booking Status Updated';
    let notificationMessage = `Your booking for ${booking.service.name} has been ${status}.`;

    if (status === 'processing') {
      notificationTitle = 'Service Started';
      notificationMessage = 'Staff has started your pet service.';
    } else if (status === 'finished') {
      notificationTitle = 'Service Finished';
      notificationMessage = 'Staff has finished the service.';
    } else if (status === 'completed') {
      notificationTitle = 'Service Complete';
      notificationMessage = 'Service complete! Thank you for visiting us.';
    }

    await createNotification({
      recipient: booking.customer._id,
      sender: req.user._id,
      type: 'booking_status',
      title: notificationTitle,
      message: notificationMessage,
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

    booking.paymentStatus = 'paid';
    booking.status = 'approved';
    
    await booking.save();

    const populatedBooking = await Booking.findById(booking._id)
      .populate('customer', 'firstName lastName email phone')
      .populate('service', 'name category');

    res.json({
      message: 'Payment approved successfully.',
      booking: populatedBooking
    });

    // Notify customer: payment approved
    await createNotification({
      recipient: booking.customer,
      sender: req.user._id,
      type: 'booking_status',
      title: '✅ Booking Approved',
      message: `Your payment for ${populatedBooking.service?.name || 'your service'} has been approved! Your booking is now confirmed.`,
      relatedId: booking._id,
      relatedModel: 'Booking'
    });

    // Notify store owner: revenue recorded
    await createNotification({
      recipient: booking.addedBy,
      sender: booking.customer,
      type: 'booking_status',
      title: 'Revenue Recorded',
      message: `Payment for booking #${String(booking._id).slice(-6).toUpperCase()} has been confirmed and revenue has been recorded.`,
      relatedId: booking._id,
      relatedModel: 'Booking'
    });
  } catch (error) {
    console.error('Confirm booking payment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Validate booking via QR scan (Staff/Admin)
const validateBookingQR = async (req, res) => {
  try {
    const { qrCode } = req.body;
    
    if (!qrCode) {
      return res.status(400).json({ message: 'QR Code is required' });
    }

    const booking = await Booking.findOne({ qrCode })
      .populate('customer', 'firstName lastName email')
      .populate('service', 'name');

    if (!booking) {
      return res.status(404).json({ message: 'Invalid QR Code: Booking not found' });
    }

    // NEW: Multi-vendor safety check (Ensure staff scans only their store's bookings)
    const scanner = req.user;
    const isStoreOwner = scanner.role === 'admin' && booking.store && booking.store.owner && booking.store.owner.toString() === scanner._id.toString();
    const isStoreStaff = scanner.role === 'staff' && scanner.store && booking.store && booking.store._id.toString() === scanner.store.toString();
    const isSuperAdmin = scanner.role === 'super_admin';

    if (!isSuperAdmin && !isStoreOwner && !isStoreStaff) {
      return res.status(403).json({ message: 'Access Denied: You can only scan bookings for your own store.' });
    }

    // 1. Check if already used
    if (booking.isScanned) {
      return res.status(400).json({ 
        message: 'QR Code Already Used', 
        details: `This booking was already scanned on ${new Date(booking.scannedAt).toLocaleString()} by staff.`
      });
    }

    // 2. Check if cancelled
    if (booking.status === 'cancelled') {
      return res.status(400).json({ message: 'QR Code Rejected: Booking has been cancelled.' });
    }

    // 3. Check if confirmed (Active)
    // Requirement: "The QR code should only become active after the owner or service staff confirms the booking."
    if (booking.status !== 'confirmed' && booking.status !== 'approved') {
      return res.status(400).json({ 
        message: 'QR Code Inactive', 
        details: `This booking is currently ${booking.status}. It must be 'confirmed' to be active.`
      });
    }

    // 4. Check payment status
    if (booking.paymentStatus !== 'paid') {
      return res.status(400).json({ 
        message: 'Payment Required', 
        details: 'This booking has not been paid for yet. QR codes are only valid for paid bookings.'
      });
    }

    // 5. Check if too early or expired (Strict time restriction)
    const now = new Date();
    const serviceDate = new Date(booking.bookingDate);
    
    const [startH, startM] = booking.startTime.split(':');
    const serviceStart = new Date(serviceDate);
    serviceStart.setHours(parseInt(startH), parseInt(startM), 0, 0);

    const [endH, endM] = booking.endTime.split(':');
    const serviceEnd = new Date(serviceDate);
    serviceEnd.setHours(parseInt(endH), parseInt(endM), 0, 0);

    // If scanned before or after the booking time
    if (now < serviceStart || now > serviceEnd) {
      if (now > serviceEnd) {
        booking.status = 'no_show';
        booking.adminNotes = `Marked as no_show: QR scanned after end time (${booking.endTime}).`;
        await booking.save();
      }
      
      return res.status(400).json({ 
        message: 'QR Code Inactive', 
        details: 'QR is currently not active. It will be active during your booking time.'
      });
    }

    // 6. Valid Scan - Success!
    booking.isScanned = true;
    booking.scannedAt = new Date();
    booking.scannedBy = req.user._id;
    
    // Transition to processing state
    booking.status = 'processing';
    
    await booking.save();

    // Notify customer about successful scan (Started)
    await createNotification({
      recipient: booking.customer._id,
      sender: req.user._id,
      type: 'booking_status',
      title: 'Service Started',
      message: 'Staff has started your pet service.',
      relatedId: booking._id,
      relatedModel: 'Booking'
    });

    res.json({
      message: 'Booking Validated Successfully!',
      booking: {
        _id: booking._id,
        customerName: `${booking.customer.firstName} ${booking.customer.lastName}`,
        serviceName: booking.service.name,
        petName: booking.pet.name,
        time: `${booking.startTime} - ${booking.endTime}`,
        scannedAt: booking.scannedAt,
        status: booking.status
      }
    });

  } catch (error) {
    console.error('QR Validation error:', error);
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
  confirmBookingPayment,
  validateBookingQR
};
