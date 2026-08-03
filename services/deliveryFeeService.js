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
  Number.isFinite(Number(lat)) && Number(lat) >= -90 && Number(lat) <= 90
  && Number.isFinite(Number(lng)) && Number(lng) >= -180 && Number(lng) <= 180;

class DeliveryFeeService {
  static async calculate({ store, origin, destination, surcharge = 0, discount = 0 }) {
    if (!validateCoordinates(origin) || !validateCoordinates(destination)) {
      throw new Error('Valid origin and destination coordinates are required.');
    }
    const now = new Date();
    const rule = await DeliveryFeeRule.findOne({
      store, isActive: true, effectiveFrom: { $lte: now },
      $or: [{ effectiveUntil: null }, { effectiveUntil: { $gte: now } }]
    }).sort({ effectiveFrom: -1, version: -1 });
    if (!rule) throw new Error('No active delivery fee rule is configured for this store.');

    // Haversine is an explicit fallback. A routing provider can replace distanceKm later.
    const distanceKm = haversineKm(
      { lat: Number(origin.lat), lng: Number(origin.lng) },
      { lat: Number(destination.lat), lng: Number(destination.lng) }
    );
    if (rule.maximumDistanceKm && distanceKm > rule.maximumDistanceKm) {
      throw new Error(`Destination is outside the ${rule.maximumDistanceKm} km delivery radius.`);
    }
    const billableKm = Math.max(0, distanceKm - rule.includedKilometers);
    const distanceCharge = billableKm * rule.ratePerKilometer;
    let total = rule.baseFee + distanceCharge + Number(surcharge) - Number(discount);
    total = Math.max(rule.minimumFee || 0, total);
    if (rule.maximumFee != null) total = Math.min(rule.maximumFee, total);
    return {
      distanceKm: roundCurrency(distanceKm),
      distanceMethod: 'haversine_fallback',
      rule: { id: rule._id, name: rule.name, version: rule.version },
      breakdown: {
        baseFee: roundCurrency(rule.baseFee),
        includedKilometers: rule.includedKilometers,
        billableKilometers: roundCurrency(billableKm),
        ratePerKilometer: rule.ratePerKilometer,
        distanceCharge: roundCurrency(distanceCharge),
        surcharge: roundCurrency(surcharge),
        discount: roundCurrency(discount)
      },
      totalFee: roundCurrency(total),
      calculatedAt: now
    };
  }
}

module.exports = DeliveryFeeService;
