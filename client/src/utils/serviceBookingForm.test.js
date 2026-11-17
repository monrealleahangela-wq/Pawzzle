import { buildServiceIntake, SERVICE_BOOKING_KINDS, validateServiceDetails } from './serviceBookingForm';
import { calculateServicePrice } from './pricingEngine';

describe('grooming booking applicability', () => {
  const service = {
    _id: 'service-full-groom',
    name: 'Full Grooming',
    category: 'grooming',
    price: 700,
    addOns: [{ _id: 'nail-art', name: 'Nail art', price: 100, duration: 10, isActive: true }]
  };

  test('the selected Service supplies the package and optional preferences may be omitted', () => {
    const details = { coatCondition: 'Healthy', behaviorConcern: 'no' };
    expect(validateServiceDetails(SERVICE_BOOKING_KINDS.GROOMING, details)).toEqual({});
    expect(buildServiceIntake(SERVICE_BOOKING_KINDS.GROOMING, details, service)).toEqual({
      kind: 'grooming',
      details: { coatCondition: 'Healthy', behaviorConcern: 'no', groomingPackage: 'Full Grooming' }
    });
  });

  test('safety answers remain required and optional preferences do not change price', () => {
    expect(validateServiceDetails(SERVICE_BOOKING_KINDS.GROOMING, {})).toEqual(expect.objectContaining({
      coatCondition: expect.any(String),
      behaviorConcern: expect.any(String)
    }));
    expect(calculateServicePrice(service).breakdown.finalPrice).toBe(700);
    expect(calculateServicePrice(service, {}, {}, ['nail-art']).breakdown.finalPrice).toBe(800);
  });
});

describe('boarding booking dates', () => {
  const completeDetails = {
    checkInDate: '2026-11-18',
    checkOutDate: '2026-11-20',
    feedingSchedule: 'Morning and evening',
    foodProvided: 'yes',
    takesMedication: 'no',
    specialCareInstructions: 'None',
    emergencyContact: 'Owner 09170000000'
  };

  test('allows today or future dates and rejects past stay dates', () => {
    expect(validateServiceDetails(SERVICE_BOOKING_KINDS.BOARDING, completeDetails, { today: '2026-11-17' })).toEqual({});
    expect(validateServiceDetails(SERVICE_BOOKING_KINDS.BOARDING, {
      ...completeDetails,
      checkInDate: '2026-11-16'
    }, { today: '2026-11-17' })).toEqual(expect.objectContaining({
      checkInDate: 'Check-in date cannot be in the past.'
    }));
    expect(validateServiceDetails(SERVICE_BOOKING_KINDS.BOARDING, {
      ...completeDetails,
      checkInDate: '2026-11-15',
      checkOutDate: '2026-11-16'
    }, { today: '2026-11-17' })).toEqual(expect.objectContaining({
      checkOutDate: 'Check-out date cannot be in the past.'
    }));
  });
});
