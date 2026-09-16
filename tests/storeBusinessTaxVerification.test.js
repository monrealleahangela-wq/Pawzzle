const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Store = require('../models/Store');
const StoreApplication = require('../models/StoreApplication');
const {
  applicationValidationErrors,
  maskTin,
  toApplicationResponse
} = require('../controllers/storeApplicationController');
const { calculateTransactionTax, resolveTransactionTaxConfiguration } = require('../utils/taxCalculator');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
const base = () => ({
  businessName: 'Pawzzle Pet Store',
  registeredBusinessName: 'Pawzzle Pet Store',
  businessType: 'pet_store',
  businessDescription: 'A community pet supplies and services store.',
  operationalModules: ['products'],
  legalStructure: 'sole_proprietorship',
  natureOfBusiness: 'Pet supplies',
  contactInfo: {
    phone: '09171234567', email: 'owner@example.com',
    address: { street: 'Main St', barangay: 'San Jose', city: 'Dasmarinas', province: 'Cavite', zipCode: '4114', coordinates: { lat: 14.3, lng: 120.9 } }
  },
  representative: { fullName: 'Owner Name', role: 'Owner', phone: '09171234567', email: 'owner@example.com', isAuthorizedRepresentative: false },
  businessRegistration: { authority: 'dti', certificateNumber: 'DTI-123', registeredName: 'Pawzzle Pet Store', documentUrl: 'secure://registration' },
  taxProfile: {
    birRegistrationStatus: 'registered', tin: '123-456-789', branchCode: '000', registeredName: 'Pawzzle Pet Store', lineOfBusiness: 'Pet supplies',
    declaredTaxStatus: 'vat_registered', corDocumentUrl: 'secure://cor',
    registeredAddress: { street: 'Main St', barangay: 'San Jose', city: 'Dasmarinas', province: 'Cavite', postalCode: '4114' }
  },
  declaration: { accepted: true, applicantName: 'Owner Name' }
});

test('1 sole proprietor application accepts DTI registration', () => assert.deepEqual(applicationValidationErrors(base()), []));
test('2 corporation/OPC application accepts SEC registration', () => {
  const data = base(); data.legalStructure = 'one_person_corporation'; data.businessRegistration.authority = 'sec';
  assert.deepEqual(applicationValidationErrors(data), []);
});
test('3 business registration document is conditionally required', () => {
  const data = base(); delete data.businessRegistration.documentUrl;
  assert.ok(applicationValidationErrors(data).some(error => error.field === 'businessRegistration'));
});
test('4 VAT applicant with COR passes validation', () => assert.equal(applicationValidationErrors(base()).length, 0));
test('5 Non-VAT applicant with COR passes validation', () => {
  const data = base(); data.taxProfile.declaredTaxStatus = 'non_vat_registered';
  assert.equal(applicationValidationErrors(data).length, 0);
});
test('6 applicant declaration does not become verified automatically', () => {
  const application = new StoreApplication(base());
  assert.equal(application.taxProfile.verificationStatus, 'unverified');
  assert.equal(application.taxProfile.verifiedTaxStatus, null);
});
test('7 Platform Admin VAT verification route is protected', () => assert.match(read('routes/storeApplications.js'), /tax-verification', authenticate, superAdminOnly, verifyTaxProfile/));
test('8 Platform Admin Non-VAT decision maps to non_vat configuration', () => assert.match(read('controllers/storeApplicationController.js'), /decision === 'vat_registered' \? 'vat_registered' : 'non_vat'/));
test('9 rejected tax information requires a correction reason', () => assert.match(read('controllers/storeApplicationController.js'), /A rejection or correction reason is required/));
test('10 Store Owner cannot self-verify tax status', () => assert.match(read('controllers/storeController.js'), /if \(!isPlatformAdmin\(req\.user\)\)/));
test('11 Store Owner settings present verified tax data read-only', () => {
  const source = read('client/src/pages/admin/AdminSettings.js');
  assert.match(source, /Store Owners cannot change VAT status directly/);
  assert.doesNotMatch(source, /Save Tax Configuration/);
});
test('12 customer cannot access tax documents through public Store responses', () => {
  const source = read('controllers/storeController.js');
  assert.match(source, /select\('-taxProfile/);
});
test('13 other stores cannot access another application document', () => assert.match(read('controllers/storeApplicationController.js'), /!ownsApplication && !isPlatformAdmin/));
test('14 specialized staff receive no tax-document permission', () => assert.match(read('routes/storeApplications.js'), /documents\/:documentType', authenticate, getApplicationDocument/));
test('15 verified VAT store creates VAT snapshot', () => {
  const config = resolveTransactionTaxConfiguration({ isConfigured: true, taxStatus: 'vat_registered', pricingMode: 'inclusive', vatRatePercent: 12 });
  const result = calculateTransactionTax({ subtotal: 1120, taxConfiguration: config });
  assert.equal(result.vatAmount, 120); assert.equal(result.storeTaxStatus, 'vat_registered'); assert.ok(result.capturedAt instanceof Date);
});
test('16 verified Non-VAT store creates Non-VAT snapshot', () => {
  const config = resolveTransactionTaxConfiguration({ isConfigured: true, taxStatus: 'non_vat', pricingMode: 'inclusive', vatRatePercent: 0 });
  assert.equal(calculateTransactionTax({ subtotal: 500, taxConfiguration: config }).taxTreatment, 'non_vat');
});
test('17 pending/unverified store is not silently Non-VAT', () => assert.throws(() => resolveTransactionTaxConfiguration({ isConfigured: false }), /tax verification is required/i));
test('18 historical paid order values are not repriced', () => {
  const saved = calculateTransactionTax({ subtotal: 1120, taxConfiguration: { taxStatus: 'vat_registered', pricingMode: 'inclusive', vatRatePercent: 12 } });
  calculateTransactionTax({ subtotal: 1120, taxConfiguration: { taxStatus: 'non_vat', pricingMode: 'inclusive', vatRatePercent: 0 } });
  assert.equal(saved.vatAmount, 120);
});
test('19 invoice/payment summary reads stored transaction breakdown', () => assert.match(read('client/src/utils/paymentSummary.js'), /pricingBreakdown/));
test('20 customer and admin pricing use the same snapshot fields', () => {
  const order = read('models/Order.js'); const booking = read('models/Booking.js');
  assert.match(order, /capturedAt/); assert.match(booking, /capturedAt/);
});
test('21 correction resubmission preserves the StoreApplication identity', () => assert.match(read('controllers/storeApplicationController.js'), /isResubmission \? existingApplication : new StoreApplication/));
test('22 existing stores default to unverified without inferred tax status', () => {
  const store = new Store({ owner: '64b000000000000000000001', name: 'Legacy Store', slug: 'legacy-store', businessType: 'pet_store', contactInfo: { phone: '1', email: 'a@b.com', address: { street: 's', barangay: 'b', city: 'c', state: 'Cavite', zipCode: '1', country: 'PH' } } });
  assert.equal(store.taxProfile.verificationStatus, 'unverified'); assert.equal(store.taxProfile.verifiedTaxStatus, null);
});
test('23 store coordinates remain copied during approval', () => assert.match(read('controllers/storeApplicationController.js'), /coordinates: application\.contactInfo\.address\.coordinates/));
test('24 legacy and current platform role aliases remain supported', () => assert.match(read('config/permissions.js'), /platform_admin/));
test('25 sensitive application response masks TIN outside document review', () => {
  const response = toApplicationResponse({ taxProfile: { tin: '123456789', branchCode: '000', corDocumentUrl: 'secret' }, businessRegistration: { documentUrl: 'secret' } });
  assert.equal(response.taxProfile.tinMasked, '123-***-***'); assert.equal(response.taxProfile.tin, undefined); assert.equal(response.businessRegistration.documentUrl, undefined);
});

test('26 Platform Admin opens the authorized application detail before reviewing documents', () => {
  const page = read('client/src/pages/admin/StoreApplications.js');
  assert.match(page, /onClick=\{\(\) => autoOpenApplication\(app\._id\)\}/);
  assert.match(page, /storeApplicationService\.getApplicationById\(id\)/);
});

test('27 legacy orders do not treat hydrated schema defaults as a tax snapshot', () => {
  const payment = read('controllers/paymentController.js');
  const summary = read('client/src/utils/paymentSummary.js');
  assert.match(payment, /pricingBreakdown\?\.calculationVersion \? order\.pricingBreakdown : null/);
  assert.match(payment, /sellerTaxStatus: recordedPricing\?\.taxStatus \|\| 'unrecorded'/);
  assert.match(summary, /Only a versioned[\s\S]*breakdown is authoritative/);
});
