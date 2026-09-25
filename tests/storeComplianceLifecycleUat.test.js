const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  evaluateDocumentExpiration,
  getComplianceSummary,
  assertStoreTransactionEligible,
  configuredThresholds
} = require('../services/storeComplianceService');

const source = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
const verifiedStore = overrides => ({
  isActive: true,
  isDeleted: false,
  verificationStatus: 'verified',
  taxProfile: { verificationStatus: 'verified', verifiedTaxStatus: 'vat_registered' },
  taxConfiguration: { isConfigured: true, taxStatus: 'vat_registered' },
  businessCompliance: { status: 'verified', documents: [], restrictionReasons: [], ...(overrides?.businessCompliance || {}) },
  ...overrides
});

test('documents without an explicit expiry never receive an invented expiry', () => {
  assert.deepEqual(evaluateDocumentExpiration({ hasExpiration: false }), { state: 'valid', daysRemaining: null });
  assert.deepEqual(evaluateDocumentExpiration({ hasExpiration: true }), { state: 'valid', daysRemaining: null });
});

test('explicit document expiration supports upcoming and expired boundaries', () => {
  const now = new Date('2026-09-17T00:00:00.000Z');
  assert.equal(evaluateDocumentExpiration({ hasExpiration: true, expirationDate: '2026-10-17T00:00:00.000Z' }, now).state, 'expiring_soon');
  assert.equal(evaluateDocumentExpiration({ hasExpiration: true, expirationDate: now }, now).state, 'expired');
  assert.deepEqual(configuredThresholds(), [...configuredThresholds()].sort((a, b) => a - b));
  assert.equal(evaluateDocumentExpiration({ hasExpiration: true, expirationDate: '2026-09-30T00:00:00.000Z' }, now).thresholdDays, 14);
});

test('an expired optional document does not restrict commercial operations', () => {
  const store = verifiedStore({ businessCompliance: { status: 'verified', restrictionReasons: [], documents: [{ requirementKey: 'mayors_permit', label: "Mayor's Permit", requiredForOperation: false, currentVersion: 1, versions: [{ version: 1, verificationStatus: 'verified', hasExpiration: true, expirationDate: '2020-01-01' }] }] } });
  assert.equal(getComplianceSummary(store).restricted, false);
  assert.doesNotThrow(() => assertStoreTransactionEligible(store));
});

test('an expired required document blocks new transactions with a safe code', () => {
  const store = verifiedStore({ businessCompliance: { status: 'verified', restrictionReasons: [], documents: [{ requirementKey: 'business_registration', label: 'Business Registration', requiredForOperation: true, currentVersion: 1, versions: [{ version: 1, verificationStatus: 'verified', hasExpiration: true, expirationDate: '2020-01-01' }] }] } });
  assert.throws(() => assertStoreTransactionEligible(store), error => error.code === 'STORE_COMPLIANCE_DOCUMENT_EXPIRED' && !/TIN|documentUrl|Cloudinary/i.test(error.message));
});

test('tax verification remains independently required for payment', () => {
  const store = verifiedStore({ taxProfile: { verificationStatus: 'pending' }, taxConfiguration: { isConfigured: false } });
  assert.throws(() => assertStoreTransactionEligible(store), error => error.code === 'STORE_TAX_VERIFICATION_REQUIRED');
});

test('manual store suspension cannot be cleared by compliance renewal evaluation', () => {
  const store = verifiedStore({ isActive: false, verificationStatus: 'suspended' });
  assert.throws(() => assertStoreTransactionEligible(store), error => error.code === 'STORE_UNAVAILABLE');
});

test('post-registration updates use a distinct request model and never create another StoreApplication', () => {
  const controller = source('controllers/storeComplianceController.js');
  assert.match(controller, /StoreComplianceRequest/);
  assert.doesNotMatch(controller, /new StoreApplication/);
  assert.match(controller, /currentSnapshot/);
  assert.match(controller, /proposedProfile/);
});

test('store owner cannot submit authoritative verified status', () => {
  const controller = source('controllers/storeComplianceController.js');
  assert.match(controller, /delete proposedProfile\.tax\.verifiedTaxStatus/);
  assert.match(controller, /delete proposedProfile\.tax\.verificationStatus/);
  assert.match(controller, /Explicitly verify the Store as VAT or Non-VAT/);
});

test('document access endpoints are authenticated and role scoped', () => {
  const routes = source('routes/storeApplications.js');
  assert.match(routes, /compliance\/my-store\/documents\/:requirementKey', authenticate, storeOwnerOnly/);
  assert.match(routes, /compliance\/admin\/stores\/:storeId\/documents\/:requirementKey', authenticate, superAdminOnly/);
  assert.match(routes, /compliance\/requests\/:id\/documents\/:documentId', authenticate/);
});

test('replacement approval preserves earlier document versions', () => {
  const controller = source('controllers/storeComplianceController.js');
  assert.match(controller, /prior\.verificationStatus = 'superseded'/);
  assert.match(controller, /document\.versions\.push/);
  assert.doesNotMatch(controller, /document\.versions\s*=\s*\[\]/);
});

test('current verified profile is only promoted during Platform Admin approval', () => {
  const routes = source('routes/storeApplications.js');
  const controller = source('controllers/storeComplianceController.js');
  assert.match(routes, /review', authenticate, superAdminOnly/);
  assert.match(controller, /if \(decision === 'approved'\)/);
  assert.match(controller, /store\.taxProfile\.verifiedTaxStatus = verifiedTaxStatus/);
});

test('reason-aware compliance restriction is separate from manual active and verification flags', () => {
  const model = source('models/Store.js');
  const service = source('services/storeComplianceService.js');
  assert.match(model, /restrictionReasons/);
  assert.match(model, /manual_platform_suspension/);
  assert.doesNotMatch(service, /store\.isActive\s*=\s*true/);
  assert.doesNotMatch(service, /store\.verificationStatus\s*=\s*'verified'/);
});

test('new order quotes, booking payment preparation, and PayMongo sessions enforce compliance', () => {
  assert.match(source('services/orderPricingService.js'), /assertStoreTransactionEligible\(store/);
  assert.match(source('services/bookingLifecycleService.js'), /assertStoreTransactionEligible\(store/);
  const payment = source('controllers/paymentController.js');
  assert.ok((payment.match(/assertStoreTransactionEligible\(/g) || []).length >= 2);
});

test('customer discovery excludes active compliance restrictions while management history remains', () => {
  const visibility = source('utils/storeVisibility.js');
  assert.match(visibility, /businessCompliance\.restrictionReasons/);
  assert.match(visibility, /\$elemMatch: \{ active: true \}/);
  assert.doesNotMatch(source('services/storeComplianceService.js'), /Order\.delete|Booking\.delete|Product\.delete|Service\.delete/);
});

test('Store settings direct update cannot bypass verified compliance fields', () => {
  const controller = source('controllers/storeController.js');
  assert.match(controller, /'taxProfile', 'businessProfile', 'businessCompliance'/);
});

test('owner UI exposes current profile, updates, corrections, renewals, and explicit expiry input', () => {
  const component = source('client/src/components/settings/BusinessTaxComplianceSettings.js');
  for (const text of ['Business & Tax Information', 'Request update or renewal', 'Resubmit corrections', 'Has an explicit expiry', 'Current verified business profile', 'Verified documents']) assert.match(component, new RegExp(text));
  assert.match(component, /Platform Admin must review and approve/);
});

test('Platform Admin review compares current and proposed data and requires a tax decision', () => {
  const component = source('client/src/components/admin/StoreComplianceReviewPanel.js');
  assert.match(component, /Current authoritative value/);
  assert.match(component, /Proposed value/);
  assert.match(component, /Verify as VAT Registered/);
  assert.match(component, /Request correction/);
});

test('daily monitor, idempotent reminder log, and dashboard notice are wired', () => {
  assert.match(source('server.js'), /processStoreComplianceExpirations/);
  assert.match(source('services/storeComplianceService.js'), /compliance\.reminderLog\.some/);
  assert.match(source('client/src/pages/admin/Dashboard.js'), /Review Business & Tax/);
});

test('public Store responses explicitly exclude private compliance metadata', () => {
  const controller = source('controllers/storeController.js');
  const visibility = source('utils/storeVisibility.js');
  assert.match(controller, /select\(CUSTOMER_VISIBLE_STORE_FIELDS\)/);
  assert.doesNotMatch(visibility, /CUSTOMER_VISIBLE_STORE_FIELDS[\s\S]*'businessCompliance'/);
  assert.doesNotMatch(visibility, /CUSTOMER_VISIBLE_STORE_FIELDS[\s\S]*'taxProfile'/);
  assert.match(source('controllers/storeComplianceController.js'), /tinMasked/);
});

test('historical tax and order snapshots are not rewritten by compliance approval', () => {
  const controller = source('controllers/storeComplianceController.js');
  assert.doesNotMatch(controller, /Order\.update|Booking\.update|pricingBreakdown|invoiceSnapshot/);
});
