const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const {
  getProfessionalVerificationStatus,
  hasCurrentVerifiedProfessionalCredential,
  isProfessionallyAssignable,
  requiresPlatformVerification
} = require('../utils/staffSpecialization');

const at = value => new Date(value);
const profile = ({ status = 'verified', documents = [] } = {}) => ({
  role: 'veterinarian',
  professionalProfile: {
    verification: { status, isRequired: true },
    credentialDocuments: documents
  }
});

test('account authentication remains separate from professional credential eligibility', () => {
  const staff = profile({ status: 'pending_verification' });
  assert.equal(requiresPlatformVerification(staff), true);
  assert.equal(getProfessionalVerificationStatus(staff), 'pending_verification');
  assert.equal(isProfessionallyAssignable(staff), false);
});

test('a current approved credential is authoritative over an older expired document', () => {
  const staff = profile({ status: 'expired', documents: [
    { status: 'verified', documentType: 'professional_license', expiresAt: '2026-01-01T00:00:00.000Z' },
    { status: 'verified', documentType: 'professional_license', expiresAt: '2028-01-01T00:00:00.000Z' }
  ] });
  const now = at('2026-09-19T00:00:00.000Z');
  assert.equal(hasCurrentVerifiedProfessionalCredential(staff, now), true);
  assert.equal(getProfessionalVerificationStatus(staff, now), 'verified');
  assert.equal(isProfessionallyAssignable(staff, now), true);
});

test('an expired credential cannot become current through generic account approval', () => {
  const staff = profile({ status: 'verified', documents: [
    { status: 'verified', documentType: 'professional_license', expiresAt: '2026-01-01T00:00:00.000Z' }
  ] });
  const now = at('2026-09-19T00:00:00.000Z');
  assert.equal(getProfessionalVerificationStatus(staff, now), 'expired');
  assert.equal(isProfessionallyAssignable(staff, now), false);
});

test('pending replacement remains restricted and approved replacement restores access', () => {
  const staff = profile({ status: 'pending_verification', documents: [
    { status: 'archived', documentType: 'professional_license', expiresAt: '2026-01-01T00:00:00.000Z' },
    { status: 'pending_verification', documentType: 'professional_license', expiresAt: '2028-01-01T00:00:00.000Z', replacesDocument: 'old-id' }
  ] });
  const now = at('2026-09-19T00:00:00.000Z');
  assert.equal(getProfessionalVerificationStatus(staff, now), 'pending_verification');
  assert.equal(isProfessionallyAssignable(staff, now), false);
  staff.professionalProfile.credentialDocuments[1].status = 'verified';
  staff.professionalProfile.verification.status = 'verified';
  assert.equal(getProfessionalVerificationStatus(staff, now), 'verified');
  assert.equal(isProfessionallyAssignable(staff, now), true);
});

test('veterinarian requires a current license while other gated roles accept current approved credentials', () => {
  const now = at('2026-09-19T00:00:00.000Z');
  const veterinarian = profile({ documents: [{ status: 'verified', documentType: 'certification', expiresAt: '2028-01-01T00:00:00.000Z' }] });
  assert.equal(getProfessionalVerificationStatus(veterinarian, now), 'pending_verification');
  for (const role of ['groomer', 'trainer', 'boarding_staff']) {
    const staff = { ...profile({ documents: [{ status: 'verified', documentType: 'certification', expiresAt: '2028-01-01T00:00:00.000Z' }] }), role };
    assert.equal(getProfessionalVerificationStatus(staff, now), 'verified', role);
  }
});

test('current-user refresh returns the same derived state used by login and backend authorization', () => {
  const auth = read('controllers/authController.js');
  const middleware = read('middleware/auth.js');
  const client = read('client/src/utils/authorization.js');
  assert.match(auth, /withProfessionalVerificationState\(sanitizeUser\(user\), user\)/);
  assert.match(auth, /professionalVerificationStatus: getProfessionalVerificationStatus\(sourceUser\)/);
  assert.match(middleware, /getProfessionalVerificationStatus\(user\) !== 'verified'/);
  assert.match(client, /user\?\.professionalVerificationStatus/);
});

test('credential review rejects expired evidence and shares the authoritative current-credential helper', () => {
  const controller = read('controllers/staffController.js');
  assert.match(controller, /status === 'verified' && isCredentialExpired\(document\)/);
  assert.match(controller, /hasCurrentVerifiedProfessionalCredential\(staff\)/);
  assert.doesNotMatch(controller, /const hasSufficientVerifiedCredential/);
});

test('restricted professionals can submit a renewal through the existing embedded credential workflow', () => {
  const routes = read('routes/staff.js');
  const middleware = read('middleware/auth.js');
  const controller = read('controllers/staffController.js');
  const service = read('client/src/services/apiService.js');
  assert.match(routes, /post\('\/me\/credentials'.*authorizeOwnCredentialManagement.*uploadCredentialDocument/);
  assert.match(middleware, /'\/me\/credentials'/);
  assert.match(controller, /replaced\.status = 'archived'/);
  assert.match(controller, /replacesDocument: replaced\?\._id/);
  assert.match(service, /uploadMyCredential/);
  assert.doesNotMatch(controller, /new ProfessionalVerification|ProfessionalVerification\.create/);
});

test('restricted screen offers renewal, status refresh, accurate verified copy, and Logout wording', () => {
  const page = read('client/src/pages/staff/ProfessionalVerificationStatus.js');
  for (const text of ['Credential Expired', 'Update Credentials', 'Check Status', 'Logout', 'Professional Credential Verified', 'Continue', 'Submit for Review']) {
    assert.match(page, new RegExp(text));
  }
  assert.match(page, /staffService\.uploadMyCredential/);
  assert.match(page, /refreshUserRole\(\)/);
  assert.doesNotMatch(page, />\s*Sign out\s*</);
});

test('login explains restricted professional access instead of showing an unqualified success toast', () => {
  const login = read('client/src/pages/auth/Login.js');
  assert.match(login, /Professional access is restricted until credential review is complete/);
  assert.match(login, /requiresProfessionalVerification\(currentUser\)/);
  assert.doesNotMatch(login, /else if \(result\.success\) \{\s*toast\.success\('Login successful!'/);
});

test('assignment, HTTP authorization, and socket authorization keep using the shared resolver', () => {
  assert.match(read('utils/pricingEngine.js'), /isProfessionallyAssignable/);
  assert.match(read('middleware/auth.js'), /getProfessionalVerificationStatus/);
  assert.match(read('services/socketAuthorization.js'), /getProfessionalVerificationStatus/);
  assert.match(read('services/staffCredentialMonitoringService.js'), /hasCurrentVerifiedProfessionalCredential/);
});

test('customer, supplier, and ordinary store staff are not professional-verification gated', () => {
  for (const user of [
    { role: 'customer' },
    { role: 'supplier' },
    { role: 'staff', staffType: 'cashier' },
    { role: 'manager' }
  ]) {
    assert.equal(requiresPlatformVerification(user), false);
  }
});
