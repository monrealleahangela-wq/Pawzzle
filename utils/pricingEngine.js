/**
 * Pawzzle Dynamic Pricing Engine
 * 
 * Evaluates all applicable pricing rules for a service given a pet profile,
 * booking date/time, selected add-ons, and condition flags.
 * 
 * Returns a complete pricing breakdown object.
 */

/**
 * Calculate the full price breakdown for a service booking.
 * 
 * @param {Object} service       - The full Service document (with pricingRules, addOns, etc.)
 * @param {Object} petData       - Pet info: { size, weight, breed, conditions: [...] }
 * @param {Object} bookingData   - Booking context: { date, startTime, isHomeService }
 * @param {Array}  selectedAddOnIds   - Array of add-on _id strings selected by customer
 * @param {Array}  selectedConditions - Array of condition strings (e.g., ['matted_fur', 'fleas_ticks'])
 * @returns {Object} pricingBreakdown
 */
const calculateServicePrice = (service, petData = {}, bookingData = {}, selectedAddOnIds = [], selectedConditions = []) => {
  const breakdown = {
    basePrice: service.price || 0,
    sizeSurcharge: 0,
    weightSurcharge: 0,
    breedSurcharge: 0,
    conditionFees: 0,
    timePremium: 0,
    addOnsTotal: 0,
    homeServiceFee: 0,
    subtotal: 0,
    discount: 0,
    finalPrice: 0
  };

  const rules = service.pricingRules || {};

  // ── 1. Pet Size Pricing ─────────────────────────────────────────────
  if (rules.petSize && rules.petSize.enabled && petData.size) {
    const sizeMap = {
      'Small':       rules.petSize.small || 0,
      'Medium':      rules.petSize.medium || 0,
      'Large':       rules.petSize.large || 0,
      'Extra Large': rules.petSize.extraLarge || 0
    };
    breakdown.sizeSurcharge = sizeMap[petData.size] || 0;
  }

  // ── 2. Pet Weight Pricing ───────────────────────────────────────────
  if (rules.petWeight && rules.petWeight.enabled && petData.weight && rules.petWeight.ranges) {
    const weight = parseFloat(petData.weight);
    for (const range of rules.petWeight.ranges) {
      if (weight >= range.minWeight && weight <= range.maxWeight) {
        breakdown.weightSurcharge = range.adjustment || 0;
        break;
      }
    }
  }

  // ── 3. Breed-Based Pricing ──────────────────────────────────────────
  if (rules.breed && rules.breed.enabled && petData.breed && rules.breed.breeds) {
    const breedLower = petData.breed.toLowerCase();
    const match = rules.breed.breeds.find(b => b.breed.toLowerCase() === breedLower);
    if (match) {
      breakdown.breedSurcharge = match.adjustment || 0;
    }
  }

  // ── 4. Condition-Based Fees ─────────────────────────────────────────
  if (rules.condition && rules.condition.enabled && selectedConditions.length > 0 && rules.condition.conditions) {
    let totalFees = 0;
    for (const condId of selectedConditions) {
      const condRule = rules.condition.conditions.find(c => c.condition === condId);
      if (condRule) {
        totalFees += condRule.fee || 0;
      }
    }
    breakdown.conditionFees = totalFees;
  }

  // ── 5. Time-Based Pricing ──────────────────────────────────────────
  if (rules.timeBased && rules.timeBased.enabled && bookingData.date) {
    const bookingDate = new Date(bookingData.date);
    const dayOfWeek = bookingDate.getDay(); // 0 = Sunday, 6 = Saturday

    // Check holidays first
    let isHoliday = false;
    if (rules.timeBased.holidays && rules.timeBased.holidays.length > 0) {
      const bookingDateStr = bookingDate.toISOString().split('T')[0];
      isHoliday = rules.timeBased.holidays.some(h => {
        const holidayStr = new Date(h).toISOString().split('T')[0];
        return holidayStr === bookingDateStr;
      });
    }

    if (isHoliday) {
      breakdown.timePremium += rules.timeBased.holidayRate || 0;
    } else if (dayOfWeek === 0 || dayOfWeek === 6) {
      // Weekend
      breakdown.timePremium += rules.timeBased.weekendRate || 0;
    } else {
      // Weekday
      breakdown.timePremium += rules.timeBased.weekdayRate || 0;
    }

    // Peak hours check
    if (bookingData.startTime && rules.timeBased.peakHoursStart && rules.timeBased.peakHoursEnd) {
      const toMinutes = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
      };
      const bookingMinutes = toMinutes(bookingData.startTime);
      const peakStart = toMinutes(rules.timeBased.peakHoursStart);
      const peakEnd = toMinutes(rules.timeBased.peakHoursEnd);

      if (bookingMinutes >= peakStart && bookingMinutes < peakEnd) {
        breakdown.timePremium += rules.timeBased.peakHoursRate || 0;
      }
    }
  }

  // ── 6. Add-Ons ─────────────────────────────────────────────────────
  const resolvedAddOns = [];
  if (selectedAddOnIds.length > 0 && service.addOns) {
    for (const addonId of selectedAddOnIds) {
      const addon = service.addOns.find(a => a._id.toString() === addonId.toString() && a.isActive);
      if (addon) {
        breakdown.addOnsTotal += addon.price || 0;
        resolvedAddOns.push({
          addOnId: addon._id,
          name: addon.name,
          price: addon.price,
          duration: addon.duration || 0
        });
      }
    }
  }

  // ── 7. Home Service Fee ────────────────────────────────────────────
  if (bookingData.isHomeService && service.homeServiceAvailable) {
    breakdown.homeServiceFee = service.homeServicePrice || 0;
  }

  // ── Calculate Totals ──────────────────────────────────────────────
  breakdown.subtotal = breakdown.basePrice
    + breakdown.sizeSurcharge
    + breakdown.weightSurcharge
    + breakdown.breedSurcharge
    + breakdown.conditionFees
    + breakdown.timePremium
    + breakdown.addOnsTotal
    + breakdown.homeServiceFee;

  breakdown.finalPrice = Math.max(0, breakdown.subtotal - breakdown.discount);

  return { breakdown, resolvedAddOns };
};

/**
 * Check if a time slot is available for a given staff member.
 * Ensures no overlapping bookings.
 * 
 * @param {String} staffId     - Staff user ID
 * @param {Date}   bookingDate - The date
 * @param {String} startTime   - HH:MM
 * @param {String} endTime     - HH:MM
 * @param {Number} bufferTime  - Buffer minutes between bookings
 * @returns {Boolean} true if available
 */
const checkStaffAvailability = async (staffId, bookingDate, startTime, endTime, bufferTime = 0, excludeBookingId = null) => {
  const Booking = require('../models/Booking');
  const User = require('../models/User');
  const { isWithinStaffSchedule } = require('./staffSpecialization');

  const staff = await User.findById(staffId).select('isActive isDeleted staffStatus professionalProfile.availability');
  if (!staff || !staff.isActive || staff.isDeleted || ['inactive', 'suspended'].includes(staff.staffStatus)) return false;
  if (!isWithinStaffSchedule(staff, bookingDate, startTime, endTime)) return false;

  const toMinutes = (timeStr) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  const requestedStart = toMinutes(startTime) - bufferTime;
  const requestedEnd = toMinutes(endTime) + bufferTime;

  // Find all non-cancelled bookings for this staff on this date
  const dateStart = new Date(bookingDate);
  dateStart.setHours(0, 0, 0, 0);
  const dateEnd = new Date(bookingDate);
  dateEnd.setHours(23, 59, 59, 999);

  const bookingQuery = {
    staff: staffId,
    bookingDate: { $gte: dateStart, $lte: dateEnd },
    status: { $nin: ['cancelled', 'confirmation_expired', 'rejected', 'no_show'] }
  };
  if (excludeBookingId) bookingQuery._id = { $ne: excludeBookingId };
  const existingBookings = await Booking.find(bookingQuery);

  for (const booking of existingBookings) {
    const existingStart = toMinutes(booking.startTime);
    const existingEnd = toMinutes(booking.endTime);

    // Check overlap (with buffer)
    if (requestedStart < existingEnd && requestedEnd > existingStart) {
      return false; // Overlap detected
    }
  }

  return true;
};

/**
 * Return every active, service-assigned, role-qualified and schedule-available
 * staff member for a booking slot. This is the single eligibility source used
 * by automatic assignment, administrator assignment, and customer reassignment.
 */
const getEligibleStaff = async (service, bookingDate, startTime, endTime, excludeBookingId = null) => {
  const Booking = require('../models/Booking');
  const User = require('../models/User');
  const { hasPermission } = require('../config/permissions');
  const { isRoleEligibleForService, isWithinStaffSchedule } = require('./staffSpecialization');
  const candidates = [];
  const bufferTime = service.bufferTime || 0;

  for (const staffId of service.assignedStaff || []) {
    const staff = await User.findById(staffId)
      .select('firstName lastName avatar store staffType staffStatus isActive isDeleted professionalProfile');
    if (!staff || !staff.isActive || staff.isDeleted || ['inactive', 'suspended'].includes(staff.staffStatus)) continue;
    if (String(staff.store) !== String(service.store?._id || service.store)) continue;
    if (!isRoleEligibleForService(staff.staffType, service)) continue;
    if (!hasPermission(staff, 'bookings.assigned')) continue;
    if (!isWithinStaffSchedule(staff, bookingDate, startTime, endTime)) continue;
    if (!(await checkStaffAvailability(staff._id, bookingDate, startTime, endTime, bufferTime, excludeBookingId))) continue;

    const dateStart = new Date(bookingDate); dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(bookingDate); dateEnd.setHours(23, 59, 59, 999);
    const countQuery = {
      staff: staff._id,
      bookingDate: { $gte: dateStart, $lte: dateEnd },
      status: { $nin: ['cancelled', 'confirmation_expired', 'rejected', 'no_show'] }
    };
    if (excludeBookingId) countQuery._id = { $ne: excludeBookingId };
    const bookingCount = await Booking.countDocuments(countQuery);
    candidates.push({ staff, bookingCount });
  }

  return candidates.sort((a, b) => a.bookingCount - b.bookingCount);
};

/**
 * Auto-assign the best available staff member for a booking.
 * Selects based on: availability → specialization match → fewest bookings (load balancing).
 * 
 * @param {Object} service      - Service document with assignedStaff
 * @param {Date}   bookingDate  - Date of booking
 * @param {String} startTime    - HH:MM
 * @param {String} endTime      - HH:MM
 * @returns {String|null} Staff user ID or null
 */
const autoAssignStaff = async (service, bookingDate, startTime, endTime) => {
  if (!service.assignedStaff || service.assignedStaff.length === 0) {
    return null;
  }
  const candidates = await getEligibleStaff(service, bookingDate, startTime, endTime);

  if (candidates.length === 0) return null;

  // Sort by fewest bookings (load balancing)
  candidates.sort((a, b) => a.bookingCount - b.bookingCount);

  return candidates[0].staff._id;
};

/**
 * Validate booking rules for a service.
 * Checks: minimum notice, max daily bookings, capacity per slot.
 * 
 * @param {Object} service     - Service document
 * @param {Date}   bookingDate - The date
 * @param {String} startTime   - HH:MM
 * @returns {Object} { valid: Boolean, reason: String }
 */
const validateBookingRules = async (service, bookingDate, startTime, excludeBookingId = null) => {
  const Booking = require('../models/Booking');
  const rules = service.bookingRules || {};

  // 1. Minimum booking notice
  if (rules.minBookingNotice && rules.minBookingNotice > 0) {
    const now = new Date();
    const [year, month, day] = new Date(bookingDate).toISOString().split('T')[0].split('-').map(Number);
    const [hour, minute] = startTime.split(':').map(Number);
    const bookingDateTime = new Date(year, month - 1, day, hour, minute);

    const diffMs = bookingDateTime.getTime() - now.getTime();
    const diffMinutes = diffMs / (1000 * 60);

    if (diffMinutes < rules.minBookingNotice) {
      const hoursNotice = Math.ceil(rules.minBookingNotice / 60);
      return {
        valid: false,
        reason: `This service requires at least ${hoursNotice} hour(s) advance notice for bookings.`
      };
    }
  }

  // 2. Max daily bookings
  if (rules.maxDailyBookings && rules.maxDailyBookings > 0) {
    const dateStart = new Date(bookingDate);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(bookingDate);
    dateEnd.setHours(23, 59, 59, 999);

    const dailyQuery = {
      service: service._id,
      bookingDate: { $gte: dateStart, $lte: dateEnd },
      status: { $nin: ['cancelled', 'confirmation_expired', 'rejected', 'no_show'] }
    };
    if (excludeBookingId) dailyQuery._id = { $ne: excludeBookingId };
    const dailyCount = await Booking.countDocuments(dailyQuery);

    if (dailyCount >= rules.maxDailyBookings) {
      return {
        valid: false,
        reason: `This service has reached its maximum of ${rules.maxDailyBookings} bookings for this day.`
      };
    }
  }

  // 3. Capacity per slot
  if (rules.capacityPerSlot && rules.capacityPerSlot > 0) {
    const dateStart = new Date(bookingDate);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(bookingDate);
    dateEnd.setHours(23, 59, 59, 999);

    const slotQuery = {
      service: service._id,
      bookingDate: { $gte: dateStart, $lte: dateEnd },
      startTime: startTime,
      status: { $nin: ['cancelled', 'confirmation_expired', 'rejected', 'no_show'] }
    };
    if (excludeBookingId) slotQuery._id = { $ne: excludeBookingId };
    const slotCount = await Booking.countDocuments(slotQuery);

    if (slotCount >= rules.capacityPerSlot) {
      return {
        valid: false,
        reason: `This time slot is fully booked. Maximum capacity: ${rules.capacityPerSlot}.`
      };
    }
  }

  return { valid: true, reason: null };
};

module.exports = {
  calculateServicePrice,
  checkStaffAvailability,
  getEligibleStaff,
  autoAssignStaff,
  validateBookingRules
};
