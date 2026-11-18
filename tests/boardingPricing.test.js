const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateServicePrice } = require('../utils/pricingEngine');
const Service = require('../models/Service');
const Booking = require('../models/Booking');

const boardingService = overrides => ({
  category: 'boarding_hotel',
  price: 450,
  pricingConfiguration: {
    pricingBasis: 'per_night',
    pricePerNight: 450,
    petSizePricingEnabled: false,
    petSizeRates: { small: 400, medium: 500, large: 650 },
    minimumNights: 0,
    maximumNights: 0,
    ...(overrides || {})
  }
});

test('boarding uses calendar nights and the standard nightly rate', () => {
  const result = calculateServicePrice(
    boardingService(),
    { size: 'Medium' },
    { checkInDate: '2026-11-20', checkOutDate: '2026-11-23' }
  );
  assert.equal(result.breakdown.numberOfNights, 3);
  assert.equal(result.breakdown.applicableNightlyRate, 450);
  assert.equal(result.breakdown.subtotal, 1350);
  assert.equal(result.breakdown.pricingBasis, 'per_night');
  assert.deepEqual(result.resolvedAddOns, []);
});

test('boarding selects the saved pet-size nightly rate', () => {
  const result = calculateServicePrice(
    boardingService({ petSizePricingEnabled: true }),
    { size: 'Medium' },
    { checkInDate: '2026-11-20', checkOutDate: '2026-11-23' }
  );
  assert.equal(result.breakdown.applicableNightlyRate, 500);
  assert.equal(result.breakdown.subtotal, 1500);
  assert.equal(result.breakdown.boardingPetSize, 'medium');
});

test('boarding enforces date order and configured stay limits', () => {
  assert.throws(() => calculateServicePrice(
    boardingService(), {}, { checkInDate: '2026-11-23', checkOutDate: '2026-11-23' }
  ), /later than check-in/);
  assert.throws(() => calculateServicePrice(
    boardingService({ minimumNights: 3 }), {}, { checkInDate: '2026-11-20', checkOutDate: '2026-11-22' }
  ), /minimum stay of 3 nights/);
  assert.throws(() => calculateServicePrice(
    boardingService({ maximumNights: 2 }), {}, { checkInDate: '2026-11-20', checkOutDate: '2026-11-23' }
  ), /maximum stay of 2 nights/);
});

test('legacy boarding services fall back to their existing service price', () => {
  const result = calculateServicePrice(
    { category: 'boarding_hotel', price: 375 },
    { size: 'Small' },
    { checkInDate: '2026-11-20', checkOutDate: '2026-11-22' }
  );
  assert.equal(result.breakdown.applicableNightlyRate, 375);
  assert.equal(result.breakdown.subtotal, 750);
});

test('service configuration and booking price snapshots are persisted by the schemas', () => {
  for (const path of [
    'pricingConfiguration.pricingBasis',
    'pricingConfiguration.pricePerNight',
    'pricingConfiguration.petSizeRates.small',
    'pricingConfiguration.minimumNights',
    'pricingConfiguration.maximumNights'
  ]) assert.ok(Service.schema.path(path), `missing Service path: ${path}`);
  for (const path of [
    'boardingStay.checkInDate',
    'boardingStay.checkOutDate',
    'boardingStay.numberOfNights',
    'boardingStay.applicableNightlyRate',
    'pricingBreakdown.numberOfNights'
  ]) assert.ok(Booking.schema.path(path), `missing Booking path: ${path}`);
});
