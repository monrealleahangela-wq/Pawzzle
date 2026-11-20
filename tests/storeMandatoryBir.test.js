const test = require('node:test');
const assert = require('node:assert/strict');
const { __test: { validateProposal } } = require('../controllers/storeComplianceController');

const profile = () => ({
  business: {
    registeredBusinessName: 'Pawzzle Store',
    tradeName: 'Pawzzle',
    legalStructure: 'sole_proprietorship',
    natureOfBusiness: 'Pet supplies',
    registrationAuthority: 'dti',
    registrationNumber: 'DTI-100',
    registeredAddress: { street: 'Main', barangay: 'San Jose', city: 'Dasmarinas' }
  },
  representative: {
    fullName: 'Store Owner',
    role: 'Owner',
    phone: '09171234567',
    email: 'owner@example.com'
  },
  tax: {
    birRegistrationStatus: 'registered',
    tin: '123-456-789',
    branchCode: '000',
    registeredName: 'Pawzzle Store',
    lineOfBusiness: 'Pet supplies',
    declaredTaxStatus: 'non_vat_registered',
    registeredAddress: {
      street: 'Main', barangay: 'San Jose', city: 'Dasmarinas', province: 'Cavite', postalCode: '4114'
    }
  }
});

const validate = proposedProfile => validateProposal({
  proposedProfile,
  reason: 'Submit complete BIR information.',
  files: {},
  existingDocuments: { businessRegistration: true, birCertificate: true }
});

test('complete registered BIR profile is accepted for store compliance', () => {
  assert.deepEqual(validate(profile()), []);
});

for (const birRegistrationStatus of ['not_registered', 'pending_registration', '']) {
  test(`store compliance rejects BIR status ${birRegistrationStatus || 'blank'}`, () => {
    const proposedProfile = profile();
    proposedProfile.tax.birRegistrationStatus = birRegistrationStatus;
    assert.ok(validate(proposedProfile).some(error => (
      error.field === 'tax.birRegistrationStatus' && /BIR-registered business is required/i.test(error.message)
    )));
  });
}

test('store compliance always requires Form 2303', () => {
  const errors = validateProposal({
    proposedProfile: profile(),
    reason: 'Submit complete BIR information.',
    files: {},
    existingDocuments: { businessRegistration: true, birCertificate: false }
  });
  assert.ok(errors.some(error => error.field === 'birCertificate' && /Form 2303/i.test(error.message)));
});
