import {
  getAddressCoordinates,
  isSavedDeliveryAddressReady,
  isUsableCheckoutQuote,
  shippingQuoteErrorMessage
} from './deliveryAddress';

const quote = {
  deliveryMethod: 'delivery',
  pricingBreakdown: { calculationVersion: 1, subtotal: 100, deliveryFee: 45, finalTotal: 145 },
  deliveryFeeCalculation: { totalFee: 45, rule: { id: 'rule-1' } }
};

test('missing and empty coordinates are unknown, not a fabricated zero-degree location', () => {
  expect(getAddressCoordinates({ coordinates: { lat: null, lng: null } })).toBeNull();
  expect(getAddressCoordinates({ coordinates: { lat: '', lng: '' } })).toBeNull();
  expect(getAddressCoordinates({ coordinates: { lat: 14.3, lng: 120.9 } })).toEqual({ lat: 14.3, lng: 120.9 });
});

test('only complete saved addresses with valid map coordinates are ready for automatic shipping', () => {
  const saved = {
    street: '123 Test Street', city: 'bacoor', barangay: 'molino',
    coordinates: { lat: 14.412, lng: 120.974 }
  };

  expect(isSavedDeliveryAddressReady(saved)).toBe(true);
  expect(isSavedDeliveryAddressReady({ ...saved, street: '' })).toBe(false);
  expect(isSavedDeliveryAddressReady({ ...saved, barangay: '' })).toBe(false);
  expect(isSavedDeliveryAddressReady({ ...saved, coordinates: undefined })).toBe(false);
  expect(isSavedDeliveryAddressReady({ ...saved, coordinates: { lat: 95, lng: 120.974 } })).toBe(false);
});

test('only a complete server delivery quote can enable checkout', () => {
  expect(isUsableCheckoutQuote(quote, 'delivery')).toBe(true);
  expect(isUsableCheckoutQuote({ ...quote, deliveryFeeCalculation: null }, 'delivery')).toBe(false);
  expect(isUsableCheckoutQuote({ ...quote, pricingBreakdown: { ...quote.pricingBreakdown, finalTotal: null } }, 'delivery')).toBe(false);
  expect(isUsableCheckoutQuote({ ...quote, pricingBreakdown: { ...quote.pricingBreakdown, deliveryFee: 0 } }, 'delivery')).toBe(false);
  expect(isUsableCheckoutQuote({ ...quote, deliveryMethod: 'pickup' }, 'delivery')).toBe(false);
});

test('safe error codes have specific messages and raw server details are not displayed', () => {
  expect(shippingQuoteErrorMessage('STORE_LOCATION_REQUIRED')).toMatch(/pickup location/);
  expect(shippingQuoteErrorMessage('MULTI_STORE_DELIVERY_UNSUPPORTED')).toMatch(/cannot be delivered together/);
  expect(shippingQuoteErrorMessage('DELIVERY_PRICING_UNAVAILABLE')).toMatch(/temporarily unavailable/);
  expect(shippingQuoteErrorMessage('UNEXPECTED_INTERNAL_ERROR')).toMatch(/could not calculate your order total/);
});
