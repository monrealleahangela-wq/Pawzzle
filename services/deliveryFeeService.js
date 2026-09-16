const DeliveryFeeRule = require('../models/DeliveryFeeRule');

const toRadians = (degrees) => degrees * Math.PI / 180;
const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const haversineKm = (origin, destination) => {
  const earthRadiusKm = 6371;
  const dLat = toRadians(destination.lat - origin.lat);
  const dLng = toRadians(destination.lng - origin.lng);
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(destination.lat);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const validateCoordinates = ({ lat, lng } = {}) =>
  lat !== null && lat !== undefined && lat !== ''
  && lng !== null && lng !== undefined && lng !== ''
  && Number.isFinite(Number(lat)) && Number(lat) >= -90 && Number(lat) <= 90
  && Number.isFinite(Number(lng)) && Number(lng) >= -180 && Number(lng) <= 180;

const deliveryPricingError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 400;
  return error;
};

const calculateBreakdown = ({ rule, distanceKm, itemQuantity = 1, surcharge = 0, discount = 0 }) => {
  const quantity = Number(itemQuantity);
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Delivery item quantity must be a positive whole number.');
  const billableKm = Math.max(0, Number(distanceKm) - Number(rule.includedKilometers || 0));
  const distanceCharge = billableKm * Number(rule.ratePerKilometer || 0);
  const additionalItemQuantity = Math.max(0, quantity - 1);
  const itemCharge = additionalItemQuantity * Number(rule.additionalItemFee || 0);
  let total = Number(rule.baseFee || 0) + distanceCharge + itemCharge + Number(surcharge) - Number(discount);
  total = Math.max(Number(rule.minimumFee || 0), total);
  if (rule.maximumFee != null) total = Math.min(Number(rule.maximumFee), total);
  return {
    itemQuantity: quantity,
    finalShippingFee: roundCurrency(total),
    breakdown: {
      baseFee: roundCurrency(rule.baseFee),
      includedKilometers: Number(rule.includedKilometers || 0),
      billableKilometers: roundCurrency(billableKm),
      ratePerKilometer: Number(rule.ratePerKilometer || 0),
      distanceCharge: roundCurrency(distanceCharge),
      itemQuantity: quantity,
      additionalItemQuantity,
      additionalItemFee: roundCurrency(rule.additionalItemFee || 0),
      itemCharge: roundCurrency(itemCharge),
      surcharge: roundCurrency(surcharge),
      discount: roundCurrency(discount)
    }
  };
};

class DeliveryFeeService {
  static async calculate({ store, origin, destination, itemQuantity = 1, surcharge = 0, discount = 0 }) {
    if (!validateCoordinates(origin)) {
      throw deliveryPricingError('STORE_LOCATION_REQUIRED', 'This store has not configured its delivery location.');
    }
    if (!validateCoordinates(destination)) {
      throw deliveryPricingError('CUSTOMER_LOCATION_REQUIRED', 'Select or confirm your delivery location.');
    }
    const now = new Date();
    const rule = await DeliveryFeeRule.findOne({
      store, isActive: true, effectiveFrom: { $lte: now },
      $or: [{ effectiveUntil: null }, { effectiveUntil: { $gte: now } }]
    }).sort({ effectiveFrom: -1, version: -1 });
    if (!rule) {
      const hasConfiguredRule = await DeliveryFeeRule.exists({ store });
      if (hasConfiguredRule) {
        throw deliveryPricingError('HOME_DELIVERY_DISABLED', 'Home delivery is currently unavailable for this store.');
      }
      throw deliveryPricingError('DELIVERY_RULE_REQUIRED', 'Delivery pricing is not configured for this store.');
    }

    // Haversine is an explicit fallback. A routing provider can replace distanceKm later.
    const distanceKm = haversineKm(
      { lat: Number(origin.lat), lng: Number(origin.lng) },
      { lat: Number(destination.lat), lng: Number(destination.lng) }
    );
    if (rule.maximumDistanceKm && distanceKm > rule.maximumDistanceKm) {
      throw deliveryPricingError(
        'OUTSIDE_DELIVERY_RANGE',
        `Delivery is unavailable because this destination is outside the ${rule.maximumDistanceKm} km delivery area.`
      );
    }
    const fee = calculateBreakdown({ rule, distanceKm, itemQuantity, surcharge, discount });
    return {
      distanceKm: roundCurrency(distanceKm),
      distanceMethod: 'haversine_fallback',
      rule: { id: rule._id, name: rule.name, version: rule.version },
      itemQuantity: fee.itemQuantity,
      breakdown: fee.breakdown,
      finalShippingFee: fee.finalShippingFee,
      totalFee: fee.finalShippingFee,
      calculatedAt: now
    };
  }
}

DeliveryFeeService.__test = { calculateBreakdown, haversineKm, validateCoordinates };
DeliveryFeeService.isValidCoordinates = validateCoordinates;

module.exports = DeliveryFeeService;
