const Booking = require('../models/Booking');
const Service = require('../models/Service');
const Store = require('../models/Store');
const User = require('../models/User');
const Voucher = require('../models/Voucher');
const { calculateServicePrice, getEligibleStaff, validateBookingRules } = require('../utils/pricingEngine');
const { calculateTransactionTax, resolveTransactionTaxConfiguration } = require('../utils/taxCalculator');

const inactiveStatuses = ['cancelled', 'confirmation_expired', 'rejected', 'no_show', 'completed'];

const loadContext = async bookingOrId => {
  const booking = typeof bookingOrId === 'string' || bookingOrId?._bsontype
    ? await Booking.findById(bookingOrId)
    : bookingOrId;
  if (!booking || booking.isDeleted) throw Object.assign(new Error('Booking not found.'), { statusCode: 404 });
  const [service, store] = await Promise.all([
    Service.findById(booking.service),
    Store.findById(booking.store)
  ]);
  if (!service || !service.isActive || service.isDeleted) {
    throw Object.assign(new Error('The selected service is no longer available.'), { statusCode: 409 });
  }
  if (!store || store.isActive === false || store.isDeleted
      || (store.verificationStatus && store.verificationStatus !== 'verified')) {
    throw Object.assign(new Error('The selected store or branch is no longer available.'), { statusCode: 409 });
  }
  return { booking, service, store };
};

const getConfirmationExpiry = store => {
  const configured = Number(store?.bookingSettings?.confirmationWindowMinutes);
  const minutes = Number.isFinite(configured) && configured >= 15 ? configured : 1440;
  return new Date(Date.now() + minutes * 60000);
};

const recalculateBooking = async (booking, service, store) => {
  const { breakdown, resolvedAddOns } = calculateServicePrice(
    service,
    booking.pet || {},
    { date: booking.bookingDate, startTime: booking.startTime, isHomeService: booking.isHomeService },
    (booking.selectedAddOns || []).map(item => item.addOnId),
    (booking.selectedConditions || []).map(item => item.condition)
  );

  let discountAmount = 0;
  if (booking.voucher) {
    const voucher = await Voucher.findById(booking.voucher);
    const now = new Date();
    if (voucher && voucher.isActive && now >= voucher.startDate && now <= voucher.endDate && breakdown.subtotal >= voucher.minPurchase) {
      discountAmount = voucher.discountType === 'percentage'
        ? breakdown.subtotal * (voucher.discountValue / 100)
        : voucher.discountValue;
      discountAmount = Math.min(discountAmount, breakdown.subtotal);
    }
  }

  const taxConfiguration = resolveTransactionTaxConfiguration(store.taxConfiguration);
  const tax = calculateTransactionTax({
    subtotal: breakdown.subtotal,
    discountAmount,
    deliveryFee: 0,
    taxConfiguration
  });
  Object.assign(breakdown, {
    discount: tax.discountAmount,
    calculationVersion: tax.calculationVersion,
    discountedSubtotal: tax.discountedSubtotal,
    deliveryFee: tax.deliveryFee,
    deliveryFeeTaxable: tax.deliveryFeeTaxable,
    taxStatus: tax.taxStatus,
    pricingMode: tax.pricingMode,
    vatRatePercent: tax.vatRatePercent,
    vatExclusiveAmount: tax.vatExclusiveAmount,
    vatAmount: tax.vatAmount,
    nonTaxableAmount: tax.nonTaxableAmount,
    configuredAt: tax.configuredAt,
    finalPrice: tax.finalTotal
  });
  return { breakdown, resolvedAddOns, discountAmount };
};

const getEligibleForBooking = async (booking, service) => getEligibleStaff(
  service,
  booking.bookingDate,
  booking.startTime,
  booking.endTime,
  booking._id
);

const assertBookingIsCurrent = booking => {
  if (inactiveStatuses.includes(booking.status)) {
    throw Object.assign(new Error('This booking is no longer eligible for confirmation or payment.'), { statusCode: 409 });
  }
  if (booking.lifecycle?.confirmationExpiresAt && booking.lifecycle.confirmationExpiresAt <= new Date()) {
    throw Object.assign(new Error('This booking proposal has expired. Please contact the store for a new schedule.'), { statusCode: 409, expired: true });
  }
  const [hours, minutes] = String(booking.startTime).split(':').map(Number);
  const scheduled = new Date(booking.bookingDate);
  scheduled.setHours(hours, minutes, 0, 0);
  if (scheduled <= new Date()) {
    throw Object.assign(new Error('The booking schedule has already passed.'), { statusCode: 409 });
  }
};

const validateAssignedStaff = async (booking, service) => {
  if (!booking.staff) throw Object.assign(new Error('A qualified staff member must be assigned first.'), { statusCode: 409 });
  const candidates = await getEligibleForBooking(booking, service);
  const match = candidates.find(item => String(item.staff._id) === String(booking.staff));
  if (!match) throw Object.assign(new Error('The assigned staff member is no longer qualified or available for this schedule.'), { statusCode: 409 });
  return { staff: match.staff, candidates };
};

const prepareForPayment = async bookingOrId => {
  const { booking, service, store } = await loadContext(bookingOrId);
  assertBookingIsCurrent(booking);
  const bookingRules = await validateBookingRules(service, booking.bookingDate, booking.startTime, booking._id);
  if (!bookingRules.valid) throw Object.assign(new Error(bookingRules.reason), { statusCode: 409 });
  const { staff } = await validateAssignedStaff(booking, service);
  const pricing = await recalculateBooking(booking, service, store);
  booking.selectedAddOns = pricing.resolvedAddOns;
  booking.pricingBreakdown = pricing.breakdown;
  booking.discountAmount = pricing.discountAmount;
  booking.totalPrice = pricing.breakdown.finalPrice;
  booking.staffRoleSnapshot = staff.staffType || '';
  booking.staffSpecialtySnapshot = staff.professionalProfile?.specialty || '';
  return { booking, service, store, staff };
};

module.exports = {
  loadContext,
  getConfirmationExpiry,
  getEligibleForBooking,
  validateAssignedStaff,
  prepareForPayment,
  recalculateBooking,
  assertBookingIsCurrent
};
