const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const StoreApplication = require('../models/StoreApplication');
const {
  applicationValidationErrors,
  appendApplicationReviewEvent,
  buildApplicationData,
  buildOriginalApplicationSelector,
  resetApplicationReviewState,
  toApplicationResponse
} = require('../controllers/storeApplicationController');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

const body = () => ({
  businessName: 'Pawzzle Store',
  registeredBusinessName: 'Pawzzle Store OPC',
  tradeName: 'Pawzzle',
  natureOfBusiness: 'Pet supplies',
  businessType: 'pet_store',
  legalStructure: 'one_person_corporation',
  operationalModules: JSON.stringify(['products']),
  staffingConfiguration: JSON.stringify({ hasStaff: 'yes', staffQuantityRange: '1-5', isStaffVisibleToCustomers: true }),
  staffTypes: JSON.stringify(['inventory']),
  contactInfo: JSON.stringify({
    phone: '09171234567', email: 'store@example.com',
    address: { street: 'Main St', barangay: 'San Jose', city: 'Dasmarinas', province: 'Cavite', zipCode: '4114', coordinates: { lat: 14.3, lng: 120.9 } }
  }),
  representative: JSON.stringify({ fullName: 'Store Owner', role: 'Owner', phone: '09171234567', email: 'owner@example.com', isAuthorizedRepresentative: false }),
  businessRegistration: JSON.stringify({ authority: 'sec', certificateNumber: 'SEC-123', registeredName: 'Pawzzle Store OPC' }),
  taxProfile: JSON.stringify({ birRegistrationStatus: 'not_registered', registeredAddress: {} }),
  declaration: JSON.stringify({ accepted: true, applicantName: 'Store Owner' }),
  references: JSON.stringify([
    { name: 'Reference One', business: 'One Corp', phone: '1', email: 'one@example.com' },
    { name: 'Reference Two', business: 'Two Corp', phone: '2', email: 'two@example.com' }
  ]),
  businessDescription: 'A complete seller application.',
  status: 'approved',
  reviewedBy: '64b000000000000000000999'
});
test('multipart application mappings preserve supported nested fields and staffing configuration', () => {
  const data = buildApplicationData(body(), '64b000000000000000000001');
  assert.deepEqual(data.operationalModules, ['products']);
  assert.equal(data.staffingConfiguration.hasStaff, 'yes');
  assert.equal(data.staffingConfiguration.isStaffVisibleToCustomers, true);
  assert.equal(data.contactInfo.address.province, 'Cavite');
  assert.equal(data.businessRegistration.registeredName, data.registeredBusinessName);
});

test('browser payload cannot assign workflow, ownership, review, or document URL fields', () => {
  const request = body();
  request.applicant = '64b000000000000000000777';
  request.businessRegistration = JSON.stringify({ authority: 'sec', certificateNumber: 'SEC-123', registeredName: 'Pawzzle Store OPC', documentUrl: 'https://attacker.invalid/file' });
  const data = buildApplicationData(request, '64b000000000000000000001');
  assert.equal(data.applicant, '64b000000000000000000001');
  assert.equal(data.applicationType, 'new_store');
  assert.equal(data.status, undefined);
  assert.equal(data.reviewedBy, undefined);
  assert.equal(data.businessRegistration.documentUrl, undefined);
  // The controller restores only the already-owned upload before validation.
  const controller = read('controllers/storeApplicationController.js');
  assert.match(controller, /applicationData\.businessRegistration\.documentUrl = req\.files\?\.businessRegistration[\s\S]*existingApplication\?\.businessRegistration\?\.documentUrl/);
});

test('all required references receive field-specific validation errors', () => {
  const data = buildApplicationData(body(), '64b000000000000000000001');
  data.businessRegistration.documentUrl = 'secure://registration';
  data.references[1].email = 'not-an-email';
  const errors = applicationValidationErrors(data);
  assert.ok(errors.some(error => error.field === 'references.1.email'));
});

test('saved response exposes document presence without leaking document URLs', () => {
  const application = new StoreApplication({
    ...buildApplicationData(body(), '64b000000000000000000001'),
    businessRegistration: { authority: 'sec', certificateNumber: 'SEC-123', registeredName: 'Pawzzle Store OPC', documentUrl: 'secure://registration' },
    taxProfile: { birRegistrationStatus: 'not_registered', tin: '123456789', branchCode: '000' }
  });
  const response = toApplicationResponse(application, { includeSensitiveFields: true });
  assert.equal(response.documentAvailability.businessRegistration, true);
  assert.equal(response.businessRegistration.documentUrl, undefined);
  assert.equal(response.taxProfile.tin, '123456789');
});

test('resubmission preserves existing upload-backed metadata unless a replacement is supplied', () => {
  const controller = read('controllers/storeApplicationController.js');
  assert.match(controller, /savedInsurance[\s\S]*applicationData\.insurance = \{ \.\.\.savedInsurance, \.\.\.\(applicationData\.insurance \|\| \{\}\) \}/);
  assert.match(controller, /existingApplication\?\.businessLicense\?\.documentUrl/);
  assert.match(controller, /existingApplication\?\.taxProfile\?\.corDocumentUrl/);
  assert.match(controller, /existingApplication\?\.representative\?\.authorityDocumentUrl/);
});

test('legacy original applications remain discoverable without matching expansion requests', () => {
  const applicant = '64b000000000000000000001';
  const selector = buildOriginalApplicationSelector(applicant);
  assert.equal(selector.applicant, applicant);
  assert.ok(selector.$or.some(condition => condition.applicationType === 'new_store'));
  assert.ok(selector.$or.some(condition => condition.applicationType === null));
  assert.ok(selector.$or.some(condition => condition.applicationType === ''));
  assert.ok(selector.$or.some(condition => condition.applicationType?.$exists === false));
  assert.ok(!selector.$or.some(condition => condition.applicationType === 'expansion'));
  const controller = read('controllers/storeApplicationController.js');
  assert.match(controller, /StoreApplication\.findOneAndUpdate\([\s\S]*\$push: \{ reviewHistory: reviewEvent \}/);
  assert.match(controller, /\{ _id: existingApplication\._id, reviewHistory: null \}/);
});

test('notification failures cannot change a successfully persisted application response', () => {
  const controller = read('controllers/storeApplicationController.js');
  assert.match(controller, /res\.status\(isResubmission \? 200 : 201\)\.json\([\s\S]*try \{[\s\S]*await createNotification/);
  assert.match(controller, /if \(res\.headersSent\) return/);
});

test('legacy applications with null audit history can be resubmitted safely', () => {
  const application = StoreApplication.hydrate({
    _id: '64b000000000000000000010',
    applicant: '64b000000000000000000001',
    businessName: 'Legacy Store',
    businessType: 'pet_store',
    contactInfo: { phone: '09171234567', email: 'store@example.com' },
    status: 'requires_more_info',
    reviewHistory: null
  });

  appendApplicationReviewEvent(application, {
    action: 'resubmitted',
    actor: '64b000000000000000000001',
    notes: 'Applicant resubmitted requested corrections.'
  });

  assert.equal(application.reviewHistory.length, 1);
  assert.equal(application.reviewHistory[0].action, 'resubmitted');
});

test('resubmission starts a clean review cycle without deleting audit history', () => {
  const application = StoreApplication.hydrate({
    _id: '64b000000000000000000010',
    applicant: '64b000000000000000000001',
    businessName: 'Legacy Store',
    status: 'requires_more_info',
    requiredCorrections: ['businessName'],
    rejectionReason: 'Update the registration details.',
    reviewedBy: '64b000000000000000000002',
    reviewedAt: new Date('2026-11-01T00:00:00.000Z'),
    reviewHistory: [{
      action: 'needs_correction',
      actor: '64b000000000000000000002',
      notes: 'Update the registration details.'
    }]
  });

  resetApplicationReviewState(application);

  assert.deepEqual(application.requiredCorrections, []);
  assert.equal(application.rejectionReason, undefined);
  assert.equal(application.reviewedBy, undefined);
  assert.equal(application.reviewedAt, undefined);
  assert.equal(application.reviewHistory.length, 1);
  assert.equal(application.reviewHistory[0].action, 'needs_correction');
});

test('Profile delegates creation and correction to the canonical complete application form', () => {
  const profile = read('client/src/pages/customer/Profile.js');
  assert.match(profile, /to="\/account-upgrade"[\s\S]*Apply to become a seller/);
  assert.match(profile, /StoreApplicationProfileDetails application=\{application\}/);
  assert.doesNotMatch(profile, /onClick=\{\(\) => setShowUpgradeForm\(true\)\}/);
});
