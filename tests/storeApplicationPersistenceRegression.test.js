const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const StoreApplication = require('../models/StoreApplication');
const {
  applicationValidationErrors,
  appendApplicationReviewEvent,
  buildApplicationData,
  buildApplicationDocumentReview,
  buildOriginalApplicationSelector,
  buildResubmissionUpdateFilter,
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
  businessCategories: JSON.stringify(['pet_products']),
  operationalModules: JSON.stringify(['products']),
  staffingConfiguration: JSON.stringify({ hasStaff: 'yes', staffQuantityRange: '1-5', isStaffVisibleToCustomers: true }),
  staffTypes: JSON.stringify(['inventory']),
  contactInfo: JSON.stringify({
    phone: '09171234567', email: 'store@example.com',
    address: { street: 'Main St', barangay: 'San Jose', city: 'Dasmarinas', province: 'Cavite', zipCode: '4114', coordinates: { lat: 14.3, lng: 120.9 } }
  }),
  representative: JSON.stringify({ fullName: 'Store Owner', role: 'Owner', phone: '09171234567', email: 'owner@example.com', isAuthorizedRepresentative: false }),
  businessLicense: JSON.stringify({ number: 'BP-100', issuingAuthority: 'Dasmarinas City', issueDate: '2027-01-02', expiryDate: '2027-12-31' }),
  businessRegistration: JSON.stringify({ authority: 'sec', certificateNumber: 'SEC-123', registeredName: 'Pawzzle Store OPC' }),
  barangayClearance: JSON.stringify({ number: 'BC-100', issuingBarangay: 'San Jose', issueDate: '2027-01-02', expiryDate: '2027-12-31' }),
  taxProfile: JSON.stringify({
    birRegistrationStatus: 'registered',
    tin: '123-456-789',
    branchCode: '000',
    registeredName: 'Pawzzle Store OPC',
    lineOfBusiness: 'Pet supplies',
    declaredTaxStatus: 'non_vat_registered',
    registeredAddress: { street: 'Main St', barangay: 'San Jose', city: 'Dasmarinas', province: 'Cavite', postalCode: '4114', country: 'PH' }
  }),
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
  assert.equal(data.businessLicense.expiryDate, '2027-12-31');
  assert.equal(data.barangayClearance.expiryDate, '2027-12-31');
});

test('approved permit and barangay expiry dates seed compliance monitoring', () => {
  const controller = read('controllers/storeApplicationController.js');
  assert.match(controller, /requirementKey: 'mayors_permit'[\s\S]*?expirationDate: application\.businessLicense\?\.expiryDate/);
  assert.match(controller, /requirementKey: 'barangay_clearance'[\s\S]*?expirationDate: application\.barangayClearance\?\.expiryDate/);
});

test('document assessment remains advisory and detects mismatched or expired evidence', () => {
  const data = buildApplicationData(body(), '64b000000000000000000001');
  data.registeredBusinessName = 'Pawzzle Store OPC';
  data.businessRegistration.registeredName = 'Different Store';
  data.businessLicense.expiryDate = '2026-01-01';
  const review = buildApplicationDocumentReview(data, {}, new Date('2026-11-19T00:00:00.000Z'));
  assert.equal(review.status, 'needs_attention');
  assert.equal(review.manualApprovalRequired, true);
  assert.ok(review.checks.some(check => check.status === 'mismatch'));
  assert.ok(review.checks.some(check => check.status === 'expired'));
});

test('document assessment persists safe suggested values and discrepancy notes for admin review', () => {
  const data = buildApplicationData(body(), '64b000000000000000000001');
  const review = buildApplicationDocumentReview(data, {
    businessRegistration: {
      status: 'review',
      fields: { 'businessRegistration.certificateNumber': 'SEC-123' },
      issues: [{ status: 'mismatch', field: 'businessRegistration.registeredName' }]
    }
  });
  assert.deepEqual(review.extractedInformation[0], {
    documentKey: 'businessRegistration',
    field: 'businessRegistration.certificateNumber',
    label: 'Registration number',
    value: 'SEC-123'
  });
  assert.ok(review.checks.some(check => check.status === 'mismatch'));
  assert.equal(review.manualApprovalRequired, true);
});

test('draft endpoint and category evidence are owner-authenticated but never auto-approved', () => {
  const routes = read('routes/storeApplications.js');
  const controller = read('controllers/storeApplicationController.js');
  assert.match(routes, /router\.post\('\/draft', authenticate, storeApplicationUpload\.fields\(applicationUploadFields\), handleUploadError, saveApplicationDraft\)/);
  assert.match(routes, /router\.patch\('\/my-application\/withdraw', authenticate, withdrawApplication\)/);
  assert.match(controller, /applicationData\.status = 'draft'/);
  assert.match(controller, /application\.status = 'withdrawn'/);
  assert.match(controller, /application\.status = 'pending_review'/);
  assert.match(controller, /manualApprovalRequired: true/);
  assert.doesNotMatch(controller, /documentReview[\s\S]{0,200}status\s*=\s*'approved'/);
  assert.match(controller, /categoryDocuments[\s\S]*requiredForOperation: document\.level === 'required'/);
});

test('category expansion requires new evidence and promotes approved permits into renewal tracking', () => {
  const routes = read('routes/storeApplications.js');
  const controller = read('controllers/storeApplicationController.js');
  assert.match(routes, /router\.post\('\/expansion', authenticate, storeOwnerOnly, storeApplicationUpload\.fields\(applicationUploadFields\)/);
  assert.match(controller, /requestedCategories[\s\S]*approvedBusinessCategories[\s\S]*Select at least one new business category/);
  assert.match(controller, /business_category_expansion_approved/);
  assert.match(controller, /requirementKey = `category_\$\{document\.requirementKey\}`[\s\S]*expirationDate: document\.expiryDate/);
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

test('business references are optional and do not block an otherwise complete application', () => {
  const data = buildApplicationData(body(), '64b000000000000000000001');
  data.businessRegistration.documentUrl = 'secure://registration';
  data.references = [];
  const errors = applicationValidationErrors(data);
  assert.ok(!errors.some(error => error.field.startsWith('references')));
});

test('registration number is optional while the registration document remains required', () => {
  const data = buildApplicationData(body(), '64b000000000000000000001');
  data.businessRegistration.certificateNumber = '';
  data.businessRegistration.documentUrl = 'secure://registration';
  const errors = applicationValidationErrors(data);
  assert.ok(!errors.some(error => error.field === 'businessRegistration.certificateNumber'));
  assert.ok(!errors.some(error => error.field === 'businessRegistration'));
});

test('unregistered and pending BIR applicants cannot submit a store application', () => {
  for (const birRegistrationStatus of ['not_registered', 'pending_registration']) {
    const data = buildApplicationData({
      ...body(),
      taxProfile: JSON.stringify({ birRegistrationStatus, registeredAddress: {} })
    }, '64b000000000000000000001');
    data.businessRegistration.documentUrl = 'secure://registration';
    data.mayorsPermitUrl = 'secure://permit';
    data.governmentIdUrl = 'secure://government-id';
    data.storefrontPhotoUrls = ['secure://storefront-1', 'secure://storefront-2'];
    const errors = applicationValidationErrors(data);
    assert.ok(errors.some(error => error.field === 'taxProfile.birRegistrationStatus' && /BIR-registered business is required/i.test(error.msg)));
    assert.ok(errors.some(error => error.field === 'taxProfile.tin'));
    assert.ok(errors.some(error => error.field === 'birRegistration'));
  }
});

test('registered BIR details and Form 2303 satisfy mandatory tax requirements', () => {
  const data = buildApplicationData(body(), '64b000000000000000000001');
  data.businessRegistration.documentUrl = 'secure://registration';
  data.mayorsPermitUrl = 'secure://permit';
  data.governmentIdUrl = 'secure://government-id';
  data.storefrontPhotoUrls = ['secure://storefront-1', 'secure://storefront-2'];
  const errors = applicationValidationErrors(data, { birRegistration: [{ path: 'secure://bir-2303' }] });
  assert.ok(!errors.some(error => error.field.startsWith('taxProfile.') || error.field === 'birRegistration'));
});

test('retained BAI and animal welfare files satisfy pet-sale document requirements', () => {
  const data = buildApplicationData({
    ...body(),
    businessCategories: JSON.stringify(['pet_sales'])
  }, '64b000000000000000000001');
  data.businessRegistration.documentUrl = 'secure://registration';
  data.mayorsPermitUrl = 'secure://permit';
  data.governmentIdUrl = 'secure://government-id';
  data.storefrontPhotoUrls = ['secure://storefront-1', 'secure://storefront-2'];
  data.categoryDocuments = [
    { requirementKey: 'animal_facility_registration', documentUrl: 'secure://facility' },
    { requirementKey: 'animal_welfare_compliance', documentUrl: 'secure://welfare' }
  ];

  const errors = applicationValidationErrors(data);
  assert.ok(!errors.some(error => error.field.startsWith('categoryDocument__')));
});

test('saved category documents are reported as available without exposing their private URLs', () => {
  const application = new StoreApplication({
    ...buildApplicationData({
      ...body(),
      businessCategories: JSON.stringify(['pet_sales'])
    }, '64b000000000000000000001'),
    categoryDocuments: [
      {
        requirementKey: 'animal_facility_registration',
        label: 'BAI animal facility registration or license to operate',
        level: 'required',
        categories: ['pet_sales'],
        documentUrl: 'secure://facility'
      },
      {
        requirementKey: 'animal_welfare_compliance',
        label: 'Animal welfare compliance document',
        level: 'required',
        categories: ['pet_sales'],
        documentUrl: 'secure://welfare'
      }
    ]
  });

  const response = toApplicationResponse(application);
  assert.equal(response.documentAvailability.categoryDocuments.animal_facility_registration, true);
  assert.equal(response.documentAvailability.categoryDocuments.animal_welfare_compliance, true);
  assert.ok(response.categoryDocuments.every(document => document.documentUrl === undefined));
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

test('resubmission update keeps the original review status after the document is prepared', () => {
  const application = StoreApplication.hydrate({
    _id: '64b000000000000000010',
    applicant: '64b000000000000000001',
    businessName: 'Rejected Store',
    businessType: 'pet_store',
    status: 'rejected'
  });
  const filter = buildResubmissionUpdateFilter(application, application.applicant);

  application.status = 'under_review';

  assert.equal(filter.status, 'rejected');
  assert.equal(application.status, 'under_review');
  assert.equal(String(filter._id), String(application._id));
  assert.equal(String(filter.applicant), String(application.applicant));
});

test('Profile delegates creation and correction to the canonical complete application form', () => {
  const profile = read('client/src/pages/customer/Profile.js');
  assert.match(profile, /to="\/account-upgrade"[\s\S]*Apply to become a seller/);
  assert.match(profile, /StoreApplicationProfileDetails application=\{application\}/);
  assert.doesNotMatch(profile, /onClick=\{\(\) => setShowUpgradeForm\(true\)\}/);
});
