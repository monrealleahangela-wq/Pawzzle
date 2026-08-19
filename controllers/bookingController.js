const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const User = require('../models/User');
const Store = require('../models/Store');
const Voucher = require('../models/Voucher');
const PetProfile = require('../models/PetProfile');
const Review = require('../models/Review');
const RevenueService = require('../services/revenueService');
const { createNotification, notifyStoreStaff } = require('./notificationController');
const { calculateServicePrice, validateBookingRules } = require('../utils/pricingEngine');
const { calculateTransactionTax, normalizeTaxConfiguration } = require('../utils/taxCalculator');
const { hasPermission, isPlatformAdmin, isStoreAdmin, isOperationalStaff } = require('../config/permissions');
const { getAuthorizedStoreIds, canAccessStore } = require('../utils/authorizationPolicy');
const {
  loadContext,
  getConfirmationExpiry,
  getEligibleForBooking,
  prepareForPayment,
  recalculateBooking
} = require('../services/bookingLifecycleService');
const { getStaffSpecializationRole, getProfessionalVerificationStatus } = require('../utils/staffSpecialization');
const { normalizeRefundPolicy, snapshotRefundPolicy, requiresAcknowledgment } = require('../utils/refundPolicy');
const { prepareServiceIntake } = require('../utils/bookingIntake');

const canStaffManageBooking = (user, booking) => {
  if (!isOperationalStaff(user) || isStoreAdmin(user) || isPlatformAdmin(user)) return false;
  const sameStore = user.store && booking.store && String(booking.store?._id || booking.store) === String(user.store?._id || user.store);
  if (!sameStore) return false;
  if (hasPermission(user, 'bookings.manage')) return true;
  return hasPermission(user, 'bookings.update') && booking.staff && String(booking.staff?._id || booking.staff) === String(user._id);
};

const getBookingScope = async user => {
  if (user.role === 'customer') return { customer: user._id };
  if (isPlatformAdmin(user)) return {};
  if (user.role === 'supplier') return null;
  const storeIds = await getAuthorizedStoreIds(user);
  if (!storeIds?.length) return null;
  const storeScope = { store: { $in: storeIds } };
  if (hasPermission(user, 'bookings.manage')) return storeScope;
  if (isOperationalStaff(user)
      && (hasPermission(user, 'bookings.assigned') || hasPermission(user, 'bookings.update') || hasPermission(user, 'bookings.view'))) {
    return { $and: [storeScope, { $or: [{ staff: user._id }, { serviceProvider: user._id }] }] };
  }
  return null;
};

const expireBookingProposals = async (filterBase = {}) => {
  const now = new Date();
  const candidates = await Booking.find({
    ...filterBase,
    status: 'awaiting_customer_confirmation',
    'lifecycle.confirmationExpiresAt': { $lte: now }
  }).select('_id customer addedBy');
  let expiredCount = 0;
  for (const candidate of candidates) {
    const booking = await Booking.findOneAndUpdate({
      _id: candidate._id,
      status: 'awaiting_customer_confirmation',
      'lifecycle.confirmationExpiresAt': { $lte: now }
    }, {
      $set: { status: 'pending', 'lifecycle.confirmationExpiresAt': null, updatedAt: now }
    }, { new: false });
    if (!booking) continue;
    expiredCount += 1;
    await Promise.all([
      createNotification({
        recipient: booking.customer,
        sender: booking.addedBy,
        type: 'booking_status',
        title: 'Booking Proposal Expired',
        message: 'The proposal expired and has returned to the store for review. No payment was created.',
        relatedId: booking._id,
        relatedModel: 'Booking',
        targetUrl: `/bookings?id=${booking._id}`
      }),
      createNotification({
        recipient: booking.addedBy,
        sender: booking.customer,
        type: 'booking_status',
        title: 'Proposal Needs Review Again',
        message: 'A booking proposal expired and is back in Pending Review.',
        relatedId: booking._id,
        relatedModel: 'Booking',
        targetUrl: `/admin/bookings?id=${booking._id}`
      })
    ]);
  }
  return expiredCount;
};

// Auto-cancels bookings that are still pending and whose date has passed or unapproved for too long
const autoCancelExpiredBookings = async (filterBase = {}) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date();

    await expireBookingProposals(filterBase);

    // 1. Cancel unapproved bookings after 30 minutes
    const unapprovedLimit = new Date();
    unapprovedLimit.setMinutes(unapprovedLimit.getMinutes() - 30);

    const unapprovedQuery = {
      ...filterBase,
      // Pending requests wait for store review. Only a customer proposal with
      // its stored expiry may expire; the old hard-coded 30-minute rule is disabled.
      status: '__legacy_auto_expiry_disabled__',
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
      status: { $in: ['pending', 'awaiting_customer_confirmation', 'awaiting_payment', 'approved', 'confirmed'] },
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
      voucherCode,
      selectedAddOns,
      selectedConditions,
      petProfileId,
      serviceIntake
    } = req.body;

    // Check if booking date/time is in the past
    const [year, month, day] = bookingDate.split('-').map(Number);
    const [hour, minute] = startTime.split(':').map(Number);
    const selectedDateTime = new Date(year, month - 1, day, hour, minute);
    if (selectedDateTime <= new Date()) {
      return res.status(400).json({ message: 'Cannot book a service for a past date or time' });
    }

    // Get service details
    const service = await Service.findById(serviceId)
      .populate('store')
      .populate('assignedStaff', 'firstName lastName');
    if (!service || !service.isActive) {
      return res.status(404).json({ message: 'Service not found or unavailable' });
    }
    const preparedIntake = prepareServiceIntake(service, serviceIntake);
    if (preparedIntake.error) return res.status(400).json({ message: preparedIntake.error });
    if (!normalizeTaxConfiguration(service.store?.taxConfiguration).isConfigured) {
      return res.status(409).json({ message: 'Store tax configuration is missing. Booking payment is temporarily unavailable.' });
    }

    // Check if home service is available
    if (isHomeService && !service.homeServiceAvailable) {
      return res.status(400).json({ message: 'Home service is not available for this service' });
    }

    // ── Validate Booking Rules ──────────────────────────────────────
    const ruleCheck = await validateBookingRules(service, bookingDate, startTime);
    if (!ruleCheck.valid) {
      return res.status(400).json({ message: ruleCheck.reason });
    }

    // ── Dynamic Pricing Engine ──────────────────────────────────────
    const { breakdown, resolvedAddOns } = calculateServicePrice(
      service,
      pet || {},
      { date: bookingDate, startTime, isHomeService },
      selectedAddOns || [],
      selectedConditions || []
    );

    // Resolve selected conditions to full objects for storage
    const resolvedConditions = [];
    if (selectedConditions && selectedConditions.length > 0 && service.pricingRules?.condition?.conditions) {
      for (const condId of selectedConditions) {
        const condRule = service.pricingRules.condition.conditions.find(c => c.condition === condId);
        if (condRule) {
          resolvedConditions.push({
            condition: condRule.condition,
            label: condRule.label,
            fee: condRule.fee
          });
        }
      }
    }

    // ── Process Voucher ─────────────────────────────────────────────
    let discountAmount = 0;
    let appliedVoucherId = null;
    const storeId = service.store?._id || service.store;

    if (voucherCode) {
      const voucher = await Voucher.findOne({
        code: voucherCode.toUpperCase(),
        isActive: true,
        store: storeId
      });

      if (!voucher) return res.status(400).json({ message: 'Voucher is invalid for this store.' });
      if (voucher) {
        const now = new Date();
        const isValidDate = now >= voucher.startDate && now <= voucher.endDate;
        const isWithinLimit = voucher.usageLimit === null || voucher.usedCount < voucher.usageLimit;
        const meetsMinPurchase = breakdown.subtotal >= voucher.minPurchase;

        if (!isValidDate) return res.status(400).json({ message: 'Voucher is not currently valid.' });
        if (!isWithinLimit) return res.status(400).json({ message: 'Voucher usage limit has been reached.' });
        if (!meetsMinPurchase) return res.status(400).json({ message: `A minimum purchase of ₱${voucher.minPurchase.toFixed(2)} is required for this voucher.` });
        if (isValidDate && isWithinLimit && meetsMinPurchase) {
          if (voucher.discountType === 'percentage') {
            discountAmount = (breakdown.subtotal * (voucher.discountValue / 100));
          } else {
            discountAmount = voucher.discountValue;
          }

          discountAmount = Math.min(discountAmount, breakdown.subtotal);
          appliedVoucherId = voucher._id;

          // Increment used count
          voucher.usedCount += 1;
          await voucher.save();
        }
      }
    }

    // Apply the store's tax rules after discounts. Home-service fees are part of
    // the service subtotal and therefore follow the same service tax treatment.
    const taxBreakdown = calculateTransactionTax({
      subtotal: breakdown.subtotal,
      discountAmount,
      deliveryFee: 0,
      taxConfiguration: service.store?.taxConfiguration
    });
    breakdown.discount = taxBreakdown.discountAmount;
    breakdown.calculationVersion = taxBreakdown.calculationVersion;
    breakdown.discountedSubtotal = taxBreakdown.discountedSubtotal;
    breakdown.deliveryFee = taxBreakdown.deliveryFee;
    breakdown.deliveryFeeTaxable = taxBreakdown.deliveryFeeTaxable;
    breakdown.taxStatus = taxBreakdown.taxStatus;
    breakdown.pricingMode = taxBreakdown.pricingMode;
    breakdown.vatRatePercent = taxBreakdown.vatRatePercent;
    breakdown.vatExclusiveAmount = taxBreakdown.vatExclusiveAmount;
    breakdown.vatAmount = taxBreakdown.vatAmount;
    breakdown.nonTaxableAmount = taxBreakdown.nonTaxableAmount;
    breakdown.configuredAt = taxBreakdown.configuredAt;
    breakdown.finalPrice = taxBreakdown.finalTotal;

    // ── Auto-Assign Staff ───────────────────────────────────────────
    let linkedPetProfile = null;
    if (petProfileId) {
      linkedPetProfile = await PetProfile.findOne({ _id: petProfileId, owner: req.user._id });
      if (!linkedPetProfile) return res.status(400).json({ message: 'The selected pet profile was not found in your account.' });
    }

    const booking = new Booking({
      customer: req.user._id,
      addedBy: service.addedBy || (service.store ? service.store.owner : req.user._id),
      service: serviceId,
      store: storeId,
      staff: null,
      pet,
      petProfile: linkedPetProfile?._id || null,
      serviceIntake: preparedIntake.value,
      selectedAddOns: resolvedAddOns,
      selectedConditions: resolvedConditions,
      pricingBreakdown: breakdown,
      bookingDate,
      startTime,
      endTime,
      isHomeService,
      serviceAddress: isHomeService ? serviceAddress : undefined,
      totalPrice: breakdown.finalPrice,
      paymentMethod: 'paymongo',
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
          if (!booking.petProfile) {
            booking.petProfile = existingPetProfile._id;
            await booking.save();
          }
          console.log(`✅ Pet profile updated: ${petName}`);
        } else {
          // Create new profile
          const createdPetProfile = await PetProfile.create({
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
          booking.petProfile = createdPetProfile._id;
          await booking.save();
          console.log(`✅ New pet profile auto-saved: ${petName}`);
        }
      }
    } catch (petErr) {
      console.error('⚠️ Pet profile auto-save failed (non-critical):', petErr.message);
    }

    // Auto-populate for return
    await booking.populate([
      { path: 'service', select: 'name duration price' },
      { path: 'store', select: 'name' },
      { path: 'staff', select: 'firstName lastName avatar staffType professionalProfile.professionalTitle professionalProfile.specialty professionalProfile.experienceYears professionalProfile.rating professionalProfile.reviewCount professionalProfile.verification.status' }
    ]);

    res.status(201).json(booking);

    // Notify store staff (Service Staff) about new booking
    await notifyStoreStaff(storeId, ['service_staff', 'service_management_staff'], {
      sender: req.user._id,
      type: 'new_booking',
      title: 'New Booking Request',
      message: `You have a new booking request for ${booking.service.name}.`,
      relatedId: booking._id,
      relatedModel: 'Booking',
      targetUrl: `/admin/bookings?id=${booking._id}`
    });
    if (booking.addedBy) {
      await createNotification({
        recipient: booking.addedBy,
        sender: req.user._id,
        type: 'new_booking',
        title: 'New Booking Request',
        message: `A customer submitted a booking request for ${booking.service.name}.`,
        relatedId: booking._id,
        relatedModel: 'Booking',
        targetUrl: `/admin/bookings?id=${booking._id}`
      });
    }
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
      .populate('staff', 'firstName lastName avatar staffType professionalProfile.professionalTitle professionalProfile.specialty professionalProfile.experienceYears professionalProfile.rating professionalProfile.reviewCount')
      .populate('serviceProvider', 'firstName lastName avatar staffType professionalProfile.professionalTitle professionalProfile.specialty professionalProfile.rating professionalProfile.reviewCount')
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

const isBookingManager = (user, booking) => {
  if (isPlatformAdmin(user)) return true;
  const storeOwnerId = booking.store?.owner?._id || booking.store?.owner;
  if (isStoreAdmin(user) && hasPermission(user, 'bookings.manage')
      && storeOwnerId && String(storeOwnerId) === String(user._id)) return true;
  return canStaffManageBooking(user, booking);
};

const populateBooking = query => query
  .populate('customer', 'firstName lastName email phone')
  .populate('service', 'name description category duration price homeServicePrice')
  .populate('store', 'name owner contactInfo.address bookingSettings taxConfiguration')
  .populate('staff', 'firstName lastName avatar role staffType professionalProfile.professionalTitle professionalProfile.specialty professionalProfile.experienceYears professionalProfile.rating professionalProfile.reviewCount professionalProfile.verification.status')
  .populate('serviceProvider', 'firstName lastName avatar role staffType professionalProfile.professionalTitle professionalProfile.specialty professionalProfile.experienceYears professionalProfile.rating professionalProfile.reviewCount professionalProfile.verification.status');

const getBookingById = async (req, res) => {
  try {
    await autoCancelExpiredBookings({ _id: req.params.id });
    const booking = await populateBooking(Booking.findOne({ _id: req.params.id, isDeleted: { $ne: true } }));
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });
    const ownsBooking = String(booking.customer?._id || booking.customer) === String(req.user._id);
    if (!ownsBooking && !isBookingManager(req.user, booking)) return res.status(403).json({ message: 'Access denied.' });
    res.json({ booking });
  } catch (error) {
    res.status(error.name === 'CastError' ? 404 : 500).json({ message: error.name === 'CastError' ? 'Booking not found.' : 'Unable to load booking.' });
  }
};

const ratingMapForStaff = async staffIds => {
  if (!staffIds.length) return new Map();
  const rows = await Review.aggregate([
    { $match: { targetType: 'Booking', staffId: { $in: staffIds }, isApproved: true, isDeleted: { $ne: true } } },
    { $group: { _id: '$staffId', averageRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } }
  ]);
  return new Map(rows.map(row => [String(row._id), {
    averageRating: Number(row.averageRating.toFixed(1)), reviewCount: row.reviewCount
  }]));
};

const toPublicStaff = (staff, ratings = {}) => {
  const verificationStatus = getProfessionalVerificationStatus(staff);
  const verified = verificationStatus === 'verified';
  const publicCredentials = (staff.professionalProfile?.credentialDocuments || [])
    .filter(document => document.status === 'verified' && (!document.expiresAt || new Date(document.expiresAt) > new Date()))
    .map(document => ({
      documentType: document.documentType,
      name: document.name,
      issuingBody: document.issuingBody,
      credentialNumber: document.credentialNumber,
      expiresAt: document.expiresAt
    }));
  return ({
  _id: staff._id,
  firstName: staff.firstName,
  lastName: staff.lastName,
  avatar: staff.avatar,
  staffType: getStaffSpecializationRole(staff),
  professionalTitle: staff.professionalProfile?.professionalTitle || '',
  specialty: staff.professionalProfile?.specialty || '',
  experienceYears: staff.professionalProfile?.experienceYears || 0,
  certifications: (staff.professionalProfile?.certifications || []).map(item => ({
    name: item.name,
    issuingBody: item.issuingBody,
    year: item.year,
    verificationStatus: item.isVerified ? 'verified' : 'information_provided'
  })),
  areasOfExpertise: staff.professionalProfile?.areasOfExpertise || [],
  languages: staff.professionalProfile?.languages || [],
  availability: staff.professionalProfile?.availability || {},
  verified,
  verificationStatus: verified ? 'verified' : 'not_verified',
  credentials: publicCredentials,
  averageRating: ratings.averageRating || 0,
  reviewCount: ratings.reviewCount || 0
  });
};

const getEligibleBookingStaff = async (req, res) => {
  try {
    const { booking, service, store } = await loadContext(req.params.id);
    await booking.populate('store', 'owner');
    const ownsBooking = String(booking.customer) === String(req.user._id);
    if (!ownsBooking && !isBookingManager(req.user, booking)) return res.status(403).json({ message: 'Access denied.' });
    if (ownsBooking && booking.status !== 'awaiting_customer_confirmation') {
      return res.status(409).json({ message: 'Staff can only be changed while the booking awaits your confirmation.' });
    }
    const candidates = await getEligibleForBooking(booking, service);
    const staffIds = candidates.map(item => item.staff._id);
    const ratings = await ratingMapForStaff(staffIds);
    res.json({
      store: { _id: store._id, name: store.name },
      staff: candidates.map(item => ({
        ...toPublicStaff(item.staff, ratings.get(String(item.staff._id))),
        isCurrent: String(item.staff._id) === String(booking.staff),
        matchScore: item.matchScore,
        matchExplanation: item.matchExplanation,
        performance: item.performance
      }))
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Unable to load eligible staff.' });
  }
};

const assignBookingStaff = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.body.staffId)) return res.status(400).json({ message: 'Valid staff ID is required.' });
    const { booking, service, store } = await loadContext(req.params.id);
    await booking.populate('store', 'owner');
    if (!isBookingManager(req.user, booking) || isPlatformAdmin(req.user)) {
      return res.status(403).json({ message: 'Only the store owner or authorized booking staff can assign service staff.' });
    }
    if (!['pending', 'awaiting_customer_confirmation'].includes(booking.status)) {
      return res.status(409).json({ message: 'Staff assignment is closed for this booking.' });
    }
    const candidates = await getEligibleForBooking(booking, service);
    const selected = candidates.find(item => String(item.staff._id) === String(req.body.staffId));
    if (!selected) return res.status(409).json({ message: 'The selected staff member is not qualified or available for this booking.' });

    const proposalInstructions = String(req.body.specialInstructions || '').trim();
    if (proposalInstructions.length > 2000) return res.status(400).json({ message: 'Special instructions must be 2,000 characters or fewer.' });
    const requestedDuration = Number(req.body.estimatedDurationMinutes || service.duration);
    if (!Number.isInteger(requestedDuration) || requestedDuration < 1 || requestedDuration > 1440) {
      return res.status(400).json({ message: 'Estimated duration must be between 1 and 1,440 minutes.' });
    }
    const pricing = await recalculateBooking(booking, service, store);
    booking.staff = selected.staff._id;
    booking.staffRoleSnapshot = getStaffSpecializationRole(selected.staff) || '';
    booking.staffSpecialtySnapshot = selected.staff.professionalProfile?.specialty || '';
    booking.status = 'awaiting_customer_confirmation';
    booking.lifecycle.proposedAt = new Date();
    booking.lifecycle.proposedBy = req.user._id;
    booking.lifecycle.confirmationExpiresAt = getConfirmationExpiry(store);
    booking.proposal.estimatedDurationMinutes = requestedDuration;
    booking.proposal.specialInstructions = proposalInstructions;
    booking.proposal.revision = Number(booking.proposal.revision || 0) + 1;
    booking.selectedAddOns = pricing.resolvedAddOns;
    booking.pricingBreakdown = pricing.breakdown;
    booking.discountAmount = pricing.discountAmount;
    booking.totalPrice = pricing.breakdown.finalPrice;
    booking.staffAssignmentHistory.push({
      staff: selected.staff._id,
      assignedBy: req.user._id,
      source: req.user.role === 'staff' ? 'staff' : 'admin'
    });
    await booking.save();

    await createNotification({
      recipient: booking.customer,
      sender: req.user._id,
      type: 'booking_status',
      title: 'Booking Ready for Confirmation',
      message: `Your booking request is ready. Review the assigned ${selected.staff.professionalProfile?.professionalTitle || 'specialist'} before confirming and paying.`,
      relatedId: booking._id,
      relatedModel: 'Booking',
      targetUrl: `/bookings?id=${booking._id}`
    }, req.app.get('socketio'));
    const result = await populateBooking(Booking.findById(booking._id));
    res.json({
      message: 'Staff assigned and booking preview sent to the customer.',
      booking: result,
      specialistRecommendation: {
        staffId: selected.staff._id,
        score: selected.matchScore,
        ...selected.matchExplanation
      }
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Unable to assign staff.' });
  }
};

const selectBookingStaff = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.body.staffId)) return res.status(400).json({ message: 'Valid staff ID is required.' });
    const { booking, service } = await loadContext(req.params.id);
    if (String(booking.customer) !== String(req.user._id)) return res.status(403).json({ message: 'Access denied.' });
    if (booking.status !== 'awaiting_customer_confirmation') return res.status(409).json({ message: 'Staff can no longer be changed for this booking.' });
    const candidates = await getEligibleForBooking(booking, service);
    const selected = candidates.find(item => String(item.staff._id) === String(req.body.staffId));
    if (!selected) return res.status(409).json({ message: 'The selected staff member is no longer available or qualified.' });
    booking.staff = selected.staff._id;
    booking.staffRoleSnapshot = getStaffSpecializationRole(selected.staff) || '';
    booking.staffSpecialtySnapshot = selected.staff.professionalProfile?.specialty || '';
    booking.proposal.specialistChangedAt = new Date();
    booking.proposal.revision = Number(booking.proposal.revision || 0) + 1;
    booking.staffAssignmentHistory.push({ staff: selected.staff._id, assignedBy: req.user._id, source: 'customer' });
    await booking.save();
    await Promise.all([
      createNotification({
        recipient: booking.addedBy,
        sender: req.user._id,
        type: 'booking_status',
        title: 'Customer Selected a Specialist',
        message: `The customer selected ${selected.staff.firstName} ${selected.staff.lastName} for their booking proposal.`,
        relatedId: booking._id,
        relatedModel: 'Booking',
        targetUrl: `/admin/bookings?id=${booking._id}`
      }, req.app.get('socketio')),
      createNotification({
        recipient: booking.customer,
        sender: booking.addedBy,
        type: 'booking_status',
        title: 'Specialist Updated',
        message: `${selected.staff.firstName} ${selected.staff.lastName} is now assigned to your proposal.`,
        relatedId: booking._id,
        relatedModel: 'Booking',
        targetUrl: `/bookings?id=${booking._id}`
      }, req.app.get('socketio'))
    ]);
    const result = await populateBooking(Booking.findById(booking._id));
    res.json({ message: 'Assigned staff updated.', booking: result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Unable to change staff.' });
  }
};

const confirmBookingForPayment = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('store', 'name refundPolicy');
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });
    if (String(booking.customer) !== String(req.user._id)) return res.status(403).json({ message: 'Access denied.' });
    if (booking.status !== 'awaiting_customer_confirmation') {
      return res.status(409).json({ message: booking.status === 'awaiting_payment' ? 'This booking is already ready for payment.' : 'This booking is not awaiting customer confirmation.' });
    }
    const refundPolicy = normalizeRefundPolicy(booking.store?.refundPolicy);
    const acknowledgmentRequired = requiresAcknowledgment(refundPolicy);
    if (acknowledgmentRequired && req.body.refundPolicyAcknowledged !== true) {
      return res.status(400).json({ message: 'Acknowledge this store\'s No Refund policy before confirming the proposal.' });
    }
    let prepared;
    try {
      prepared = await prepareForPayment(booking);
    } catch (error) {
      if (error.expired) {
        booking.status = 'pending';
        booking.lifecycle.confirmationExpiresAt = null;
        await booking.save();
      }
      throw error;
    }
    prepared.booking.status = 'awaiting_payment';
    prepared.booking.paymentStatus = 'pending';
    prepared.booking.lifecycle.customerConfirmedAt = new Date();
    prepared.booking.lifecycle.confirmationExpiresAt = null;
    prepared.booking.refundPolicySnapshot = snapshotRefundPolicy(refundPolicy);
    prepared.booking.refundPolicyAcknowledgment = {
      required: acknowledgmentRequired,
      acknowledged: acknowledgmentRequired ? true : Boolean(req.body.refundPolicyAcknowledged),
      acknowledgedAt: req.body.refundPolicyAcknowledged ? new Date() : undefined,
      acknowledgedBy: req.body.refundPolicyAcknowledged ? req.user._id : undefined
    };
    await prepared.booking.save();
    await createNotification({
      recipient: prepared.booking.customer,
      sender: prepared.booking.addedBy,
      type: 'booking_status',
      title: 'Payment Required',
      message: 'Your proposal is confirmed. Continue securely with PayMongo to finalize the booking.',
      relatedId: prepared.booking._id,
      relatedModel: 'Booking',
      targetUrl: `/bookings?id=${prepared.booking._id}`
    }, req.app.get('socketio'));
    const result = await populateBooking(Booking.findById(prepared.booking._id));
    res.json({ message: 'Booking accepted. Continue to PayMongo to confirm it.', booking: result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Unable to confirm booking.' });
  }
};

const getBookingStaffProfile = async (req, res) => {
  try {
    const { booking, service } = await loadContext(req.params.id);
    await booking.populate('store', 'owner');
    const ownsBooking = String(booking.customer) === String(req.user._id);
    if (!ownsBooking && !isBookingManager(req.user, booking)) return res.status(403).json({ message: 'Access denied.' });
    const candidates = await getEligibleForBooking(booking, service);
    const allowed = String(booking.staff) === String(req.params.staffId)
      || candidates.some(item => String(item.staff._id) === String(req.params.staffId));
    if (!allowed) return res.status(404).json({ message: 'Staff profile is not available for this booking.' });
    const staff = await User.findOne({ _id: req.params.staffId, isDeleted: false, 'professionalProfile.isPublic': { $ne: false } })
      .select('firstName lastName avatar role staffType store professionalProfile');
    if (!staff || !isOperationalStaff(staff) || String(staff.store) !== String(booking.store?._id || booking.store)) {
      return res.status(404).json({ message: 'Staff profile is not available.' });
    }
    const [ratings, services, reviews, completedServices, startedServices] = await Promise.all([
      ratingMapForStaff([staff._id]),
      Service.find({ assignedStaff: staff._id, store: booking.store?._id || booking.store, isActive: true, isDeleted: { $ne: true } }).select('name category duration').lean(),
      Review.find({ targetType: 'Booking', staffId: staff._id, isApproved: true, isDeleted: { $ne: true } })
        .populate('user', 'firstName lastName avatar').select('user rating comment complimentTags isAnonymous createdAt').sort({ createdAt: -1 }).limit(20).lean(),
      Booking.countDocuments({ store: booking.store?._id || booking.store, status: 'completed', $or: [{ staff: staff._id }, { serviceProvider: staff._id }] }),
      Booking.countDocuments({ store: booking.store?._id || booking.store, status: { $in: ['processing', 'finished', 'completed'] }, $or: [{ staff: staff._id }, { serviceProvider: staff._id }] })
    ]);
    const profile = staff.professionalProfile || {};
    res.json({
      staff: {
        ...toPublicStaff(staff, ratings.get(String(staff._id))),
        bio: profile.bio || '',
        qualifications: profile.qualifications || [],
        areasOfExpertise: profile.areasOfExpertise || [],
        certifications: (profile.certifications || []).map(item => ({
          name: item.name,
          issuingBody: item.issuingBody,
          year: item.year,
          verificationStatus: item.isVerified ? 'verified' : 'customer_visible_information_provided'
        })),
        languages: profile.languages || [],
        licenseInformation: getProfessionalVerificationStatus(staff) === 'verified' && profile.registration?.number ? {
          type: profile.registration.type,
          number: profile.registration.number,
          issuingBody: profile.registration.issuingBody,
          expiresAt: profile.registration.expiresAt
        } : null,
        branch: { _id: booking.store?._id || booking.store, name: booking.store?.name || '' },
        completedServices,
        successRate: startedServices ? Math.round((completedServices / startedServices) * 100) : null,
        services
      },
      reviews: reviews.map(review => ({
        ...review,
        user: review.isAnonymous ? null : review.user
      }))
    });
  } catch (error) {
    res.status(error.statusCode || (error.name === 'CastError' ? 404 : 500)).json({ message: error.message || 'Unable to load staff profile.' });
  }
};

// Update booking status (admin only)
const updateBookingStatus = async (req, res) => {
  try {
    const { status, adminNotes } = req.body;

    const booking = await Booking.findById(req.params.id || req.params.bookingId).populate('store');
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Check permissions: Owner, store staff, or super admin
    const isStoreOwner = isStoreAdmin(req.user) && booking.store && booking.store.owner && booking.store.owner.toString() === req.user._id.toString();
    const isStoreStaff = canStaffManageBooking(req.user, booking);

    if (!isPlatformAdmin(req.user) && !isStoreOwner && !isStoreStaff) {
      return res.status(403).json({ message: 'You can only update bookings for your own store' });
    }
    if (status === booking.status) return res.json(booking);

    const transitions = {
      confirmed: ['processing', 'cancelled'],
      approved: ['processing', 'cancelled'], // historical paid bookings
      processing: ['finished'],
      finished: ['completed']
    };
    if (status !== booking.status && !(transitions[booking.status] || []).includes(status)) {
      return res.status(409).json({
        message: booking.status === 'pending'
          ? 'Assign a qualified staff member and send the booking preview instead of manually confirming it.'
          : `Invalid booking transition from ${booking.status} to ${status}.`
      });
    }

    if (['confirmed', 'processing', 'finished', 'completed'].includes(status) && booking.paymentStatus !== 'paid') {
      return res.status(409).json({ message: 'A booking cannot progress until PayMongo confirms payment.' });
    }
    if (status === 'cancelled' && booking.paymentStatus === 'paid') {
      return res.status(409).json({ message: 'A paid booking cannot be marked cancelled until its PayMongo refund is processed.' });
    }

    const oldStatus = booking.status;
    booking.status = status;
    if (!booking.serviceProgress) booking.serviceProgress = {};
    if (adminNotes) booking.adminNotes = adminNotes;
    if (['processing', 'finished', 'completed'].includes(status) && !booking.serviceProvider) {
      if (!booking.staff) return res.status(409).json({ message: 'Assign the staff member who will provide this service first.' });
      booking.serviceProvider = booking.staff;
    }
    const progressTime = new Date();
    if (status === 'processing') {
      booking.serviceProgress.status = 'service_started';
      booking.serviceProgress.startedAt = booking.serviceProgress.startedAt || progressTime;
    } else if (status === 'finished') {
      booking.serviceProgress.status = 'ready_for_pickup';
      booking.serviceProgress.readyAt = booking.serviceProgress.readyAt || progressTime;
    } else if (status === 'completed') {
      booking.lifecycle.completedAt = progressTime;
      booking.serviceProgress.status = 'completed';
      booking.serviceProgress.completedAt = booking.serviceProgress.completedAt || progressTime;
    } else if (status === 'cancelled') {
      booking.serviceProgress.status = 'cancelled';
      booking.serviceProgress.cancelledAt = booking.serviceProgress.cancelledAt || progressTime;
    }

    // Recovery for historical paid bookings that predate centralized reconciliation.
    if (status === 'completed' && oldStatus !== 'completed' && !booking.isRevenueRecorded) {
      await RevenueService.recordPayment('booking', booking._id);
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
      notificationMessage = `${booking.pet.name}'s service has started.`;
    } else if (status === 'finished') {
      notificationTitle = 'Ready for Pickup';
      notificationMessage = `${booking.pet.name} is ready for pickup.`;
    } else if (status === 'completed') {
      notificationTitle = 'Service Complete';
      notificationMessage = 'Your service is complete. You can now rate the staff member who provided it.';
    }

    await createNotification({
      recipient: booking.customer._id,
      sender: req.user._id,
      type: status === 'processing' ? 'service_start' : status === 'completed' ? 'service_complete' : 'service_update',
      title: notificationTitle,
      message: notificationMessage,
      relatedId: booking._id,
      relatedModel: 'Booking',
      targetUrl: status === 'completed' ? `/bookings?id=${booking._id}&review=1` : `/bookings?id=${booking._id}`
    }, req.app.get('socketio'));
    const io = req.app.get('socketio');
    if (io) {
      io.to(`user_${String(booking.customer._id)}`).emit('serviceUpdate', {
        bookingId: String(booking._id), eventType: status, timestamp: progressTime
      });
      io.to(`store_${String(booking.store?._id || booking.store)}`).emit('dashboardUpdate', {
        type: 'booking', id: String(booking._id), status, timestamp: progressTime
      });
      io.to('admin_global').emit('dashboardUpdate', {
        type: 'booking', id: String(booking._id), status, timestamp: progressTime
      });
    }
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Cancel booking
const cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id || req.params.bookingId).populate('service', 'name');
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    if (booking.paymentStatus === 'paid') {
      return res.status(409).json({ message: 'A paid booking must be refunded through PayMongo before cancellation.' });
    }

    // Customer can cancel their own bookings
    if (booking.customer.toString() === req.user._id.toString()) {
      if (!['pending', 'awaiting_customer_confirmation', 'awaiting_payment'].includes(booking.status)) {
        return res.status(409).json({ message: 'This request can no longer be cancelled from the customer booking preview.' });
      }
    }
    // Admin/Staff can cancel bookings for their store
    else if (isStoreAdmin(req.user) || isOperationalStaff(req.user)) {
      const store = await Store.findById(booking.store);
      
      const isStoreOwner = isStoreAdmin(req.user) && store.owner.toString() === req.user._id.toString();
      const isStoreStaff = canStaffManageBooking(req.user, booking);

      if (!isStoreOwner && !isStoreStaff && !isPlatformAdmin(req.user)) {
        return res.status(403).json({ message: 'You can only cancel bookings for your own store' });
      }
    } else {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (booking.status === 'cancelled') return res.json({ message: 'Booking is already cancelled.' });
    const isCustomer = req.user._id.toString() === booking.customer.toString();
    booking.status = 'cancelled';
    if (!booking.serviceProgress) booking.serviceProgress = {};
    booking.lifecycle.cancelledAt = new Date();
    booking.lifecycle.cancellationSource = isCustomer ? 'customer' : (req.user.role === 'staff' ? 'staff' : 'admin');
    booking.serviceProgress.status = 'cancelled';
    booking.serviceProgress.cancelledAt = booking.lifecycle.cancelledAt;
    if (booking.voucher) await Voucher.findByIdAndUpdate(booking.voucher, { $inc: { usedCount: -1 } });
    await booking.save();

    res.json({ message: 'Booking cancelled successfully' });

    // Notify the other party about cancellation
    await createNotification({
      recipient: isCustomer ? booking.addedBy : booking.customer,
      sender: req.user._id,
      type: 'booking_status',
      title: 'Booking Cancelled',
      message: `Booking for ${booking.service?.name || 'service'} has been cancelled by the ${isCustomer ? 'customer' : 'store'}.`,
      relatedId: booking._id,
      relatedModel: 'Booking',
      targetUrl: isCustomer ? `/admin/bookings?id=${booking._id}` : `/bookings?id=${booking._id}`
    });
    if (isCustomer && booking.staff && String(booking.staff) !== String(booking.addedBy)) {
      await createNotification({
        recipient: booking.staff,
        sender: req.user._id,
        type: 'booking_status',
        title: 'Booking Request Cancelled',
        message: `The customer cancelled the booking request for ${booking.service?.name || 'this service'}.`,
        relatedId: booking._id,
        relatedModel: 'Booking',
        targetUrl: `/admin/bookings?id=${booking._id}`
      });
    }
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all bookings (super admin read-only access)
const getAllBookings = async (req, res) => {
  try {
    console.log('📅 getAllBookings called with path:', req.path);

    const { page = 1, limit = 10, status, search } = req.query;
    const skip = (page - 1) * limit;

    const authorizedScope = await getBookingScope(req.user);
    if (!authorizedScope) return res.status(403).json({ message: 'Access denied.' });
    const filter = { $and: [authorizedScope] };

    // Check if this is an admin route (check full original URL)
    const isAdminRoute = req.originalUrl && req.originalUrl.includes('/admin');
    console.log('� Booking request - Original URL:', req.originalUrl);
    console.log('📅 Booking request - Is admin route:', isAdminRoute);

    // If admin route, filter by admin user ID for complete data isolation
    if (false && isAdminRoute && req.user.role === 'admin') {
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

      const searchScope = { $or: [
        { customer: { $in: userIds } },
        { service: { $in: serviceIds } }
      ] };

      // Also check specific booking fields
      if (mongoose.Types.ObjectId.isValid(search)) {
        searchScope.$or.push({ _id: search });
      }
      filter.$and.push(searchScope);
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
    const authorizedScope = await getBookingScope(req.user);
    if (!authorizedScope) return res.status(403).json({ message: 'Access denied.' });

    // Build date range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Last day of previous month

    const bookings = await Booking.find({
      ...authorizedScope,
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

// Validate booking via QR scan (Staff/Admin)
const markBookingCheckedIn = async (booking, req) => {
  if (booking.isScanned || booking.serviceProgress?.status === 'pet_arrived') return false;
  booking.isScanned = true;
  booking.scannedAt = new Date();
  booking.scannedBy = req.user._id;
  booking.serviceProvider = booking.staff || req.user._id;
  if (!booking.serviceProgress) booking.serviceProgress = {};
  booking.serviceProgress.status = 'pet_arrived';
  booking.serviceProgress.arrivedAt = booking.scannedAt;
  await booking.save();
  const specialist = booking.staff
    ? `${booking.staff.firstName || ''} ${booking.staff.lastName || ''}`.trim()
    : 'the assigned specialist';
  const branch = booking.store?.name || 'the selected branch';
  await createNotification({
    recipient: booking.customer?._id || booking.customer,
    sender: req.user._id,
    type: 'service_update',
    title: 'Pet Checked In',
    message: `${booking.pet.name} checked in with ${specialist} at ${branch}.`,
    relatedId: booking._id,
    relatedModel: 'Booking',
    targetUrl: `/bookings?id=${booking._id}`
  }, req.app.get('socketio'));
  const io = req.app.get('socketio');
  if (io) {
    io.to(`user_${String(booking.customer?._id || booking.customer)}`).emit('serviceUpdate', {
      bookingId: String(booking._id), eventType: 'pet_arrived', timestamp: booking.scannedAt
    });
    io.to(`store_${String(booking.store?._id || booking.store)}`).emit('dashboardUpdate', {
      type: 'booking', id: String(booking._id), status: 'pet_arrived', timestamp: booking.scannedAt
    });
    io.to('admin_global').emit('dashboardUpdate', {
      type: 'booking', id: String(booking._id), status: 'pet_arrived', timestamp: booking.scannedAt
    });
  }
  return true;
};

const checkInBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('customer', 'firstName lastName')
      .populate('staff', 'firstName lastName')
      .populate('store', 'name owner')
      .populate('service', 'name');
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });
    if (!['confirmed', 'approved'].includes(booking.status) || booking.paymentStatus !== 'paid') {
      return res.status(409).json({ message: 'Only a paid, confirmed booking can be checked in.' });
    }
    const owner = isStoreAdmin(req.user) && String(booking.store?.owner) === String(req.user._id);
    if (!owner && !canStaffManageBooking(req.user, booking)) return res.status(403).json({ message: 'Only the assigned service team or store owner can check in this pet.' });
    const changed = await markBookingCheckedIn(booking, req);
    res.json({ message: changed ? 'Pet checked in successfully.' : 'This pet is already checked in.', booking });
  } catch (error) {
    res.status(error.name === 'CastError' ? 404 : 500).json({ message: error.name === 'CastError' ? 'Booking not found.' : 'Unable to check in this pet.' });
  }
};

const validateBookingQR = async (req, res) => {
  try {
    const { qrCode } = req.body;
    
    if (!qrCode) {
      return res.status(400).json({ message: 'QR Code is required' });
    }

    const booking = await Booking.findOne({ qrCode })
      .populate('customer', 'firstName lastName email')
      .populate('service', 'name')
      .populate('staff', 'firstName lastName')
      .populate('store', 'name owner');

    if (!booking) {
      return res.status(404).json({ message: 'Invalid QR Code: Booking not found' });
    }

    // NEW: Multi-vendor safety check (Ensure staff scans only their store's bookings)
    const scanner = req.user;
    const isStoreOwner = isStoreAdmin(scanner) && await canAccessStore(scanner, booking.store?._id || booking.store);
    const isStoreStaff = canStaffManageBooking(scanner, booking);
    const isSuperAdmin = isPlatformAdmin(scanner);

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
    await markBookingCheckedIn(booking, req);

    res.json({
      message: 'Booking Validated Successfully!',
      booking: {
        _id: booking._id,
        customerName: `${booking.customer.firstName} ${booking.customer.lastName}`,
        serviceName: booking.service.name,
        petName: booking.pet.name,
        time: `${booking.startTime} - ${booking.endTime}`,
        scannedAt: booking.scannedAt,
        status: booking.status,
        serviceProgressStatus: booking.serviceProgress.status
      }
    });

  } catch (error) {
    console.error('QR Validation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  createBooking,
  getBookingById,
  getCustomerBookings,
  getStoreBookings,
  getAllBookings,
  getCalendarBookings,
  updateBookingStatus,
  cancelBooking,
  validateBookingQR,
  getEligibleBookingStaff,
  assignBookingStaff,
  selectBookingStaff,
  confirmBookingForPayment,
  getBookingStaffProfile,
  expireBookingProposals,
  checkInBooking,
  __test: { toPublicStaff }
};
