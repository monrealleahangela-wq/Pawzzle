import { isGovernmentIdConfirmed, mergeGovernmentIdFields } from './governmentIdRegistration';

test('fills empty registration identity fields without overwriting user corrections', () => {
  const result = mergeGovernmentIdFields({
    firstName: '',
    middleName: '',
    lastName: 'Corrected surname',
    address: { street: '', barangay: '', city: '', province: '', zipCode: '', country: 'PH' }
  }, {
    firstName: 'Eugene',
    middleName: 'Santos',
    lastName: 'Scanned surname',
    street: 'Block 13 Lot 17',
    barangay: 'Narra II',
    city: 'Dasmarinas',
    province: 'Cavite',
    zipCode: '4114'
  });

  expect(result.firstName).toBe('Eugene');
  expect(result.lastName).toBe('Corrected surname');
  expect(result.address.city).toBe('Dasmarinas');
  expect(result.address.country).toBe('PH');
});

test('requires the confirmed document to match the currently selected type', () => {
  const review = { status: 'matched', selectedType: 'passport' };
  expect(isGovernmentIdConfirmed(review, 'passport')).toBe(true);
  expect(isGovernmentIdConfirmed(review, 'drivers_license')).toBe(false);
});
