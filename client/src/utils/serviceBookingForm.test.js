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
