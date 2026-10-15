const coordinatePair = (lat, lng) => {
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') return null;
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
  INVALID_DELIVERY_ADDRESS: 'Please check your delivery address and try again.',
  CUSTOMER_LOCATION_REQUIRED: 'Select or confirm your delivery location.',
  STORE_LOCATION_REQUIRED: "This Store hasn't configured its pickup location yet. Please contact the Store.",
  DELIVERY_RULE_REQUIRED: 'Delivery pricing is not configured for this store.',
  HOME_DELIVERY_DISABLED: 'Home delivery is currently unavailable for this store.',
  OUTSIDE_DELIVERY_RANGE: "This address is outside the Store's delivery coverage.",
  DELIVERY_PRICING_UNAVAILABLE: 'Delivery pricing is temporarily unavailable. Please try again shortly.',
  DELIVERY_SERVICE_UNAVAILABLE: "We couldn't calculate delivery right now. Please retry in a moment.",
  DELIVERY_QUOTE_CHANGED: 'Delivery pricing changed. Please recreate checkout before paying.',
  MULTI_STORE_DELIVERY_UNSUPPORTED: 'Some items cannot be delivered together. Please review your cart.',
  INVALID_CHECKOUT_ITEMS: 'Please review your cart items and try again.',
  STORE_UNAVAILABLE: 'This Store is not accepting new orders right now.',
  STORE_COMPLIANCE_RESTRICTED: 'This Store is temporarily unable to accept new orders.',
  STORE_COMPLIANCE_DOCUMENT_EXPIRED: 'This Store is temporarily unable to accept new orders.',
  STORE_TAX_VERIFICATION_REQUIRED: 'Payment is unavailable until this Store completes its tax verification.',
  QUOTE_FAILED: 'We could not calculate your order total right now. Please try again.'
});

export const shippingQuoteErrorMessage = code => (
  SHIPPING_ERROR_MESSAGES[code] || SHIPPING_ERROR_MESSAGES.QUOTE_FAILED
);

export const isUsableCheckoutQuote = (quote, requestedMethod, hasPet = false) => {
  const breakdown = quote?.pricingBreakdown;
  const amount = value => value !== null && value !== undefined && value !== ''
    && Number.isFinite(Number(value)) && Number(value) >= 0;
  if (!breakdown?.calculationVersion || !amount(breakdown.subtotal)
      || !amount(breakdown.finalTotal) || !amount(breakdown.deliveryFee)) return false;
  if (quote.deliveryMethod !== requestedMethod
      && !(requestedMethod === 'delivery' && hasPet && quote.deliveryMethod === 'pickup')) return false;
  if (quote.deliveryMethod === 'delivery') {
    const fee = quote.deliveryFeeCalculation?.totalFee;
    if (!amount(fee) || !quote.deliveryFeeCalculation?.rule?.id
        || Math.abs(Number(fee) - Number(breakdown.deliveryFee)) > 0.009) return false;
  }
  return true;
};
