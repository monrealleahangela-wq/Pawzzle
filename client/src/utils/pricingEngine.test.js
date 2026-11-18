import { calculateServicePrice } from './pricingEngine';

test('matches the per-night boarding formula used by the server', () => {
  const service = {
    category: 'boarding_hotel',
    price: 400,
    pricingConfiguration: {
      pricingBasis: 'per_night',
      pricePerNight: 400,
      petSizePricingEnabled: true,
      petSizeRates: { small: 400, medium: 500, large: 650 },
      minimumNights: 1,
      maximumNights: 14
    }
  };
  const result = calculateServicePrice(service, { size: 'Medium' }, {
    checkInDate: '2026-11-20',
    checkOutDate: '2026-11-23'
  });
  expect(result.breakdown).toMatchObject({
    pricingBasis: 'per_night',
    numberOfNights: 3,
    applicableNightlyRate: 500,
    subtotal: 1500,
    finalPrice: 1500
  });
});
