import { isGovernmentIdConfirmed } from './governmentIdRegistration';

test('requires the confirmed document to match the currently selected type', () => {
  const review = { status: 'matched', selectedType: 'passport' };
  expect(isGovernmentIdConfirmed(review, 'passport')).toBe(true);
  expect(isGovernmentIdConfirmed(review, 'drivers_license')).toBe(false);
});

test('allows manual ID confirmation for the currently selected type', () => {
  const review = { status: 'manual', selectedType: 'philhealth_id' };
  expect(isGovernmentIdConfirmed(review, 'philhealth_id')).toBe(true);
  expect(isGovernmentIdConfirmed(review, 'passport')).toBe(false);
});
