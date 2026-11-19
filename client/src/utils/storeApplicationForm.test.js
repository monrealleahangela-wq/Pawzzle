import {
  createStoreApplicationForm,
  firstInvalidStep,
  hydrateStoreApplicationForm,
  validateStoreApplicationForm
} from './storeApplicationForm';

const complete = () => ({
  ...createStoreApplicationForm({ firstName: 'Store', lastName: 'Owner', email: 'owner@example.com', phone: '0917' }),
  businessName: 'Pawzzle Store',
  registeredBusinessName: 'Pawzzle Store',
  businessType: 'pet_store',
  legalStructure: 'sole_proprietorship',
  natureOfBusiness: 'Pet supplies',
  businessDescription: 'A complete application.',
  businessCategories: ['pet_products'],
  operationalModules: ['products'],
  representative: { fullName: 'Store Owner', role: 'Owner', phone: '0917', email: 'owner@example.com', isAuthorizedRepresentative: false },
  contactInfo: {
    phone: '0917', email: 'store@example.com',
    address: { street: 'Main', barangay: 'San Jose', city: 'dasmarinas', province: 'Cavite', zipCode: '4114', coordinates: { lat: 14.3, lng: 120.9 } }
  },
  businessRegistration: { authority: 'dti', certificateNumber: 'DTI-1', registeredName: 'Pawzzle Store', registrationDate: '', expirationDate: '' },
  taxProfile: { birRegistrationStatus: 'registered', tin: '123-456-789', branchCode: '000', registeredName: 'Pawzzle Store', lineOfBusiness: 'Pet supplies', declaredTaxStatus: 'non_vat_registered', registeredAddress: { street: 'Main', barangay: 'San Jose', city: 'Dasmarinas', province: 'Cavite', postalCode: '4114' } },
  declaration: { accepted: true, applicantName: 'Store Owner' },
  references: [
    { name: 'One', business: 'One Co', phone: '1', email: 'one@example.com' },
    { name: 'Two', business: 'Two Co', phone: '2', email: 'two@example.com' }
  ]
});
test('hydrates every nested edit section while retaining safe defaults', () => {
  const hydrated = hydrateStoreApplicationForm({
    businessName: 'Saved Store',
    staffingConfiguration: { hasStaff: 'yes' },
    businessRegistration: { registrationDate: '2025-01-02T00:00:00.000Z' },
    barangayClearance: { number: 'BC-1', issueDate: '2027-01-02T00:00:00.000Z', expiryDate: '2027-12-31T00:00:00.000Z' },
    taxProfile: { birRegistrationStatus: 'registered' },
    contactInfo: { address: { street: 'Saved Street', coordinates: { lat: 14.3, lng: 120.9 } } }
  }, { email: 'owner@example.com' });
  expect(hydrated.staffingConfiguration.hasStaff).toBe('yes');
  expect(hydrated.staffingConfiguration.staffQuantityRange).toBe('1-5');
  expect(hydrated.businessRegistration.registrationDate).toBe('2025-01-02');
  expect(hydrated.barangayClearance).toMatchObject({ number: 'BC-1', issueDate: '2027-01-02', expiryDate: '2027-12-31' });
  expect(hydrated.taxProfile.registeredAddress).toBeDefined();
  expect(hydrated.contactInfo.address.coordinates.lat).toBe(14.3);
});

test('valid application accepts retained registration evidence without a replacement upload', () => {
  expect(validateStoreApplicationForm(complete(), {
    files: {}, documentAvailability: {
      businessRegistration: true,
      mayorsPermit: true,
      governmentId: true,
      birRegistration: true,
      storefrontPhotos: 2,
      categoryDocuments: {}
    }
  })).toEqual({});
});

test('missing fields map to the correct visible step', () => {
  const data = complete();
  data.businessName = '';
  data.contactInfo.address.coordinates = { lat: '', lng: '' };
  const errors = validateStoreApplicationForm(data, { documentAvailability: { businessRegistration: true, mayorsPermit: true, governmentId: true, birRegistration: true, storefrontPhotos: 2, categoryDocuments: {} } });
  expect(errors.businessName).toMatch(/required/i);
  expect(errors['contactInfo.address.coordinates']).toMatch(/location/i);
  expect(firstInvalidStep(errors)).toBe(1);
});

test('editing a saved application preserves document requirements and reference details', () => {
  const hydrated = hydrateStoreApplicationForm({
    ...complete(),
    documentAvailability: { businessRegistration: true, birRegistration: true },
    references: complete().references
  });
  hydrated.declaration.accepted = true;
  expect(hydrated.references[1].email).toBe('two@example.com');
  expect(validateStoreApplicationForm(hydrated, { documentAvailability: { businessRegistration: true, mayorsPermit: true, governmentId: true, birRegistration: true, storefrontPhotos: 2, categoryDocuments: {} } })).toEqual({});
});

test('selected business categories require matching evidence and storefront photos', () => {
  const data = complete();
  data.businessCategories = ['pet_sales'];
  const errors = validateStoreApplicationForm(data, { documentAvailability: { businessRegistration: true, mayorsPermit: true, governmentId: true, birRegistration: true, categoryDocuments: {} } });
  expect(errors.storefrontPhotos).toMatch(/two storefront photos/i);
  expect(errors.categoryDocuments).toMatch(/animal facility/i);
});
