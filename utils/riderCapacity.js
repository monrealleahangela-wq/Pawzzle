const { RIDER_VEHICLE_TYPES } = require('../config/riderVehicles');

const finiteNonNegative = value => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

const getRiderCapacitySummary = profile => {
  const vehicleType = String(profile?.vehicleType || '').trim();
  const maxWeightKg = finiteNonNegative(profile?.vehicleCapacity?.maxWeightKg);
  const maxParcelCount = finiteNonNegative(profile?.vehicleCapacity?.maxParcelCount);
  const reservedWeightKg = finiteNonNegative(profile?.currentLoad?.weightKg);
  const reservedParcelCount = finiteNonNegative(profile?.currentLoad?.parcelCount);
  const configured = RIDER_VEHICLE_TYPES.includes(vehicleType)
    && maxWeightKg > 0 && Number.isInteger(maxParcelCount) && maxParcelCount > 0;

  return {
    configured,
    vehicleType: vehicleType || undefined,
    maxWeightKg,
    maxParcelCount,
    reservedWeightKg,
    reservedParcelCount,
    remainingWeightKg: Math.max(0, maxWeightKg - reservedWeightKg),
    remainingParcelCount: Math.max(0, maxParcelCount - reservedParcelCount)
  };
};

const capacitySupportsParcel = (summary, parcel) => summary.configured
  && Number(parcel?.weightKg) <= summary.maxWeightKg
  && Number(parcel?.parcelCount) <= summary.maxParcelCount;

const capacityHasRoomForParcel = (summary, parcel) => capacitySupportsParcel(summary, parcel)
  && Number(parcel?.weightKg) <= summary.remainingWeightKg
  && Number(parcel?.parcelCount) <= summary.remainingParcelCount;

const capacityCanContainReservedLoad = profile => {
  const summary = getRiderCapacitySummary(profile);
  return summary.reservedWeightKg <= summary.maxWeightKg
    && summary.reservedParcelCount <= summary.maxParcelCount;
};

module.exports = {
  getRiderCapacitySummary,
  capacitySupportsParcel,
  capacityHasRoomForParcel,
  capacityCanContainReservedLoad
};
