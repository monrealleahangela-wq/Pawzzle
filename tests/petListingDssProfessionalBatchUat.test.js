const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Pet = require('../models/Pet');
const DecisionSupportService = require('../services/decisionSupportService');
const { isSafePcciCertificateReference } = require('../utils/petListingAttributes');
const { getProfessionalVerificationStatus, isProfessionallyAssignable } = require('../utils/staffSpecialization');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const preferences = overrides => ({
  monthlyBudget: '3000_5000',
  purchaseBudget: '10000_25000',
  space: 'apartment',
  homeOwnership: 'rent',
  livingArrangement: 'family',
  housingType: 'apartment',
  petRestrictions: 'allowed',
  existingPets: 'none',
  householdChildren: 'children',
  careCapacity: 'limited',
  lifestyle: ['calm'],
  preferredSpecies: [],
  preferredSizes: [],
  ...overrides
});

const listing = overrides => ({
  _id: 'pet-1', name: 'Milo', species: 'dog', breed: 'Mixed', age: 2, ageUnit: 'years',
  size: 'small', price: 5000, temperamentTraits: ['calm'], activityLevel: 'low',
  careNeeds: { maintenance: 'high', grooming: 'high', training: 'moderate' },
  petCompatibility: { dogs: 'unknown', cats: 'unknown', otherPets: 'unknown', children: 'compatible' },
  status: 'available', isAvailable: true, listingType: 'sale', isDeleted: false,
  store: { _id: 'store-1', isCustomerVisible: true },
  ...overrides
});

test('PCCI attachments are advertised and opened only through an allowlisted customer-safe route', () => {
  const valid = 'https://res.cloudinary.com/demo/image/upload/v123/pawzzle/documents/certificate.pdf';
  assert.equal(isSafePcciCertificateReference(valid), true);
  for (const unsafe of [
    'http://res.cloudinary.com/demo/image/upload/v123/pawzzle/documents/certificate.pdf',
    'https://evil.example/pawzzle/documents/certificate.pdf',
    'https://res.cloudinary.com/demo/image/upload/v123/pawzzle/private/identity.pdf',
    'javascript:alert(1)'
  ]) assert.equal(isSafePcciCertificateReference(unsafe), false, unsafe);

  const controller = read('controllers/petController.js');
  const routes = read('routes/pets.js');
  const detail = read('client/src/pages/customer/PetDetail.js');
  assert.match(controller, /delete publicPet\.proofOfOwnership/);
  assert.match(controller, /delete publicPet\.permits/);
  assert.match(controller, /certificateAvailable/);
  assert.doesNotMatch(controller.match(/publicPet\.pcciRegistration = \{([\s\S]*?)\};/)?.[1] || '', /certificateUrl/);
  assert.match(routes, /\/:id\/pcci-certificate/);
  assert.match(detail, /View Certificate/);
  assert.match(detail, /has not been independently verified by Pawzzle/);
});

test('availability is explicit while backend purchase and lifecycle protections remain authoritative', () => {
  const controller = read('controllers/petController.js');
  const availability = read('services/petAvailabilityService.js');
  const adoption = read('controllers/adoptionController.js');
  const marketplace = read('client/src/pages/customer/Pets.js');
  assert.match(controller, /hasActivePetCommitment/);
  assert.match(controller, /A \$\{pet\.status\} pet cannot be manually changed/);
  assert.match(availability, /pet\.status !== 'available' \|\| pet\.isAvailable !== true/);
  assert.match(adoption, /getPetAvailabilityIssue\(pet, 1\)/);
  assert.match(marketplace, /includeUnavailable: true/);
  assert.match(marketplace, /'UNAVAILABLE'/);
});

test('home, care, children, other pets, space, and activity use answers plus explicit listing evidence', () => {
  const lowCapacity = DecisionSupportService.petCompatibilityAssessment([listing()], preferences(), []).recommendations[0];
  const highCapacity = DecisionSupportService.petCompatibilityAssessment([listing()], preferences({ careCapacity: 'high' }), []).recommendations[0];
  assert.equal(lowCapacity.calculation.find(row => row.criterion === 'household').score, 100);
  assert.equal(lowCapacity.calculation.find(row => row.criterion === 'care').score, 0);
  assert.equal(highCapacity.calculation.find(row => row.criterion === 'care').score, 100);

  const unknownChildEvidence = DecisionSupportService.petCompatibilityAssessment([
    listing({ petCompatibility: { children: 'unknown' } })
  ], preferences(), []).recommendations[0];
  assert.equal(unknownChildEvidence.calculation.find(row => row.criterion === 'household').score, null);
  assert.ok(unknownChildEvidence.unknowns.some(text => /household members or pets is unknown/i.test(text)));
  assert.ok(!unknownChildEvidence.reasons.some(text => /safe for children/i.test(text)));
});

test('Good with Kids requires an explicit pet-specific compatibility value and legacy defaults are removed', () => {
  const pet = new Pet({
    name: 'Milo', species: 'dog', breed: 'Mixed', age: 2, gender: 'male', size: 'small',
    description: 'A sufficiently described individual pet listing.', price: 5000,
    images: ['https://example.com/milo.jpg'], addedBy: '507f1f77bcf86cd799439011'
  });
  assert.equal(pet.adoptionDetails?.isKidFriendly, undefined);
  assert.equal(pet.petCompatibility.children, 'unknown');
  const detail = read('client/src/pages/customer/PetDetail.js');
  assert.match(detail, /petCompatibility\?\.children === 'compatible'/);
  assert.doesNotMatch(detail, /adoptionDetails\?\.isKidFriendly/);
  assert.match(detail, /Not assessed/);
});

test('DSS recommendation media preserves the upload and provides a responsive fallback', () => {
  const page = read('client/src/pages/customer/DSS.js');
  assert.match(page, /aspect-\[4\/3\]/);
  assert.match(page, /object-contain/);
  assert.match(page, /No photo available/);
  assert.doesNotMatch(page, /item\.pet\.images\?\.\[0\][\s\S]{0,250}object-cover/);
});

test('credential verification and professional portal approval remain separate persisted decisions', () => {
  const staff = {
    role: 'veterinarian',
    professionalProfile: {
      verification: { status: 'pending_verification', isRequired: true },
      credentialDocuments: [{ status: 'verified', documentType: 'professional_license', expiresAt: '2028-01-01T00:00:00.000Z' }]
    }
  };
  const now = new Date('2026-10-12T00:00:00.000Z');
  assert.equal(getProfessionalVerificationStatus(staff, now), 'pending_verification');
  assert.equal(isProfessionallyAssignable(staff, now), false);
  staff.professionalProfile.verification.status = 'verified';
  assert.equal(getProfessionalVerificationStatus(staff, now), 'verified');
  assert.equal(isProfessionallyAssignable(staff, now), true);

  const controller = read('controllers/staffController.js');
  const page = read('client/src/pages/superadmin/SpecializedStaffVerification.js');
  assert.match(controller, /portal access still requires separate approval/);
  assert.match(controller, /reviewedAt/);
  assert.match(controller, /Verify the required current professional credential before approving account access/);
  assert.match(page, /Verify current credential/);
  assert.match(page, /Approve Professional Access/);
});
