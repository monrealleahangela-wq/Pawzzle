const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Store = require('../models/Store');
const {
  resolveAuthoritativeTaxProfile,
  applyAuthoritativeTaxFilters
} = require('../controllers/storeApplicationController');

const source = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
const application = status => ({
  _id: 'application-1',
  taxProfile: {
    birRegistrationStatus: 'registered',
    declaredTaxStatus: 'vat_registered',
    verifiedTaxStatus: status === 'verified' ? 'vat_registered' : null,
    verificationStatus: status,
    registeredName: 'Historical Application Name',
    tin: '123456789'
  }
});
const store = (status, verifiedTaxStatus = null) => ({
  _id: 'store-1',
  taxProfile: {
    birRegistered: true,
    declaredTaxStatus: verifiedTaxStatus || 'vat_registered',
    verifiedTaxStatus,
    verificationStatus: status,
    registeredName: 'Current Store Name',
    tin: '123456789'
  }
});

test('approved Store tax profile overrides a stale pending onboarding application', () => {
  const result = resolveAuthoritativeTaxProfile(application('pending'), store('verified', 'vat_registered'));
  assert.equal(result.verificationStatus, 'verified');
  assert.equal(result.verifiedTaxStatus, 'vat_registered');
  assert.equal(result.registeredName, 'Current Store Name');
  assert.equal(result.source, 'store');
  assert.equal(result.tin, undefined);
  assert.equal(result.tinMasked, '123-***-***');
});

test('pending and rejected Store states are not masked by an older verified application', () => {
  assert.equal(resolveAuthoritativeTaxProfile(application('verified'), store('pending')).verificationStatus, 'pending');
  assert.equal(resolveAuthoritativeTaxProfile(application('verified'), store('rejected')).verificationStatus, 'rejected');
});

test('pre-approval sellers continue using the StoreApplication tax state', () => {
  const result = resolveAuthoritativeTaxProfile(application('pending'), null);
  assert.equal(result.verificationStatus, 'pending');
  assert.equal(result.source, 'application');
});

test('Superadmin tax filters use Store state for approved sellers and application state only before Store creation', async () => {
  const originalFind = Store.find;
  Store.find = () => ({
    select: () => ({
      lean: async () => [
        { owner: 'owner-verified', taxProfile: { verificationStatus: 'verified', verifiedTaxStatus: 'vat_registered' } },
        { owner: 'owner-pending', taxProfile: { verificationStatus: 'pending', verifiedTaxStatus: null } }
      ]
    })
  });
  try {
    const filter = { $or: [{ businessName: /pawzzle/i }] };
    await applyAuthoritativeTaxFilters(filter, { taxVerificationStatus: 'verified' });
    assert.deepEqual(filter.$or, [{ businessName: /pawzzle/i }]);
    assert.deepEqual(filter.$and[0].$or[0], { applicant: { $in: ['owner-verified'] } });
    assert.deepEqual(filter.$and[0].$or[1].applicant, { $nin: ['owner-verified', 'owner-pending'] });
    assert.equal(filter.$and[0].$or[1]['taxProfile.verificationStatus'], 'verified');
  } finally {
    Store.find = originalFind;
  }
});

test('Seller and Superadmin UIs both consume the authoritative tax profile', () => {
  const seller = source('client/src/components/settings/BusinessTaxComplianceSettings.js');
  const superadmin = source('client/src/pages/admin/StoreApplications.js');
  const controller = source('controllers/storeApplicationController.js');
  assert.match(seller, /data\?\.currentProfile\?\.tax/);
  assert.doesNotMatch(seller, /data\?\.compliance\?\.status \|\| profile\.tax\?\.verificationStatus/);
  assert.match(seller, /Tax: \{labelize\(taxVerificationStatus\)\}/);
  assert.match(superadmin, /application\?\.currentTaxProfile \|\| application\?\.taxProfile/);
  assert.match(controller, /currentTaxProfile: resolveAuthoritativeTaxProfile/);
  assert.match(controller, /store: storeSummary/);
  assert.match(controller, /attachStoreSummaries\(application, \{ includeDocuments: true \}\)/);
});
