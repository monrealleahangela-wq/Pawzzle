const coordinatePair = (lat, lng) => {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { lat: latitude, lng: longitude };
};

export const getAddressCoordinates = (address = {}) => {
  const direct = address?.coordinates;
  const location = address?.location;

  if (Array.isArray(direct)) return coordinatePair(direct[1], direct[0]);
  if (Array.isArray(direct?.coordinates)) {
    return coordinatePair(direct.coordinates[1], direct.coordinates[0]);
  }
  if (Array.isArray(location?.coordinates)) {
    return coordinatePair(location.coordinates[1], location.coordinates[0]);
  }

  return coordinatePair(
    direct?.lat ?? direct?.latitude ?? location?.lat ?? location?.latitude ?? address?.lat ?? address?.latitude,
    direct?.lng ?? direct?.lon ?? direct?.longitude
      ?? location?.lng ?? location?.lon ?? location?.longitude
      ?? address?.lng ?? address?.lon ?? address?.longitude
  );
};

export const hasValidAddressCoordinates = address => Boolean(getAddressCoordinates(address));

export const normalizeDeliveryAddress = (address = {}) => ({
  street: address?.street || '',
  city: address?.city || '',
  province: address?.province || address?.state || 'cavite',
  barangay: address?.barangay || '',
  zipCode: address?.zipCode || address?.postalCode || '',
  country: address?.country || 'PH',
  coordinates: getAddressCoordinates(address) || undefined
});

export const formatDeliveryAddress = (address = {}) => [
  address.street,
  address.barangay,
  address.city,
  address.province,
  address.zipCode,
  address.country === 'PH' ? 'Philippines' : address.country
].filter(Boolean).join(', ');

const SHIPPING_ERROR_MESSAGES = Object.freeze({
  CUSTOMER_LOCATION_REQUIRED: 'Select or confirm your delivery location.',
  STORE_LOCATION_REQUIRED: 'This store has not configured its delivery location.',
  DELIVERY_RULE_REQUIRED: 'Delivery pricing is not configured for this store.',
  HOME_DELIVERY_DISABLED: 'Home delivery is currently unavailable for this store.',
  OUTSIDE_DELIVERY_RANGE: 'Home delivery is unavailable for the selected destination.',
  QUOTE_FAILED: 'Unable to calculate delivery right now. Please try again.'
});

export const shippingQuoteErrorMessage = (code, fallback) => (
  SHIPPING_ERROR_MESSAGES[code] || fallback || SHIPPING_ERROR_MESSAGES.QUOTE_FAILED
);
