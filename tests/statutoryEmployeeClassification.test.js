const assert = require('node:assert/strict');
const test = require('node:test');
const User = require('../models/User');
const Store = require('../models/Store');
const ActivityLog = require('../models/ActivityLog');
const { updateStatutoryClassification, updateCompensationTaxClassification } = require('../controllers/hrController');
const { buildStatutoryClassification, buildCompensationTaxClassification } = require('../utils/statutoryEmployeeClassification');

const responseRecorder = () => {
  const result = {};
  result.res = { status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; } };
  return result;
};
const base = { effectiveFrom: '2026-01-01', sourceReference: 'https://agency.gov.ph/official-rule', reason: 'Reviewed current official employee classification guidance.' };

test('statutory and tax classifications require evidence, explicit dates, and non-overlapping immutable periods', () => {
  const current = buildStatutoryClassification({ ...base, agency: 'SSS', employeeCategory: 'private_sector_employed', coverageStatus: 'covered' }, 'owner-id');
  assert.equal(current.verifiedBy, 'owner-id');
  assert.ok(current.verifiedAt instanceof Date);
  assert.throws(() => buildStatutoryClassification({ ...base, agency: 'SSS', employeeCategory: 'private_sector_employed', coverageStatus: 'exempt' }, 'owner-id', [current]), error => error.code === 'overlapping_classification');
  assert.throws(() => buildStatutoryClassification({ ...base, agency: 'Pag-IBIG', employeeCategory: 'employed_member', coverageStatus: 'covered', sourceReference: 'http://example.com' }, 'owner-id'), error => error.code === 'classification_source_required');
  const tax = buildCompensationTaxClassification({ ...base, componentCode: 'uniform_allowance', compensationType: 'regular', taxTreatment: 'exempt' }, 'owner-id');
  assert.equal(tax.taxTreatment, 'exempt');
  assert.throws(() => buildCompensationTaxClassification({ ...base, componentCode: 'uniform_allowance', compensationType: 'regular', taxTreatment: 'taxable' }, 'owner-id', [tax]), error => error.code === 'overlapping_classification');
  assert.throws(() => buildStatutoryClassification({ ...base, agency: 'BIR', employeeCategory: 'private_compensation_employee', coverageStatus: 'covered' }, 'owner-id'), error => error.code === 'missing_minimum_wage_classification');
  const bir = buildStatutoryClassification({ ...base, agency: 'BIR', employeeCategory: 'private_compensation_employee', coverageStatus: 'covered', minimumWageEarnerStatus: 'verified_no' }, 'owner-id');
  assert.equal(bir.minimumWageEarnerStatus, 'verified_no');
});

test('classification histories are excluded from ordinary User selections and never store statutory identifiers', () => {
  const agencyPath = User.schema.path('employmentProfile.statutoryClassifications');
  const taxPath = User.schema.path('employmentProfile.compensationTaxClassifications');
  assert.equal(agencyPath.options.select, false);
  assert.equal(taxPath.options.select, false);
  const paths = Object.keys(User.schema.paths).join(' ');
  assert.doesNotMatch(paths, /employmentProfile\.(?:tin|sssNumber|philHealthNumber|pagIbigNumber)\b/i);
});

test('only a same-Store Owner/Admin can append statutory classifications; Finance is denied server-side', async () => {
  const originals = { store: Store.findById, user: User.findOne, audit: ActivityLog.create, error: console.error };
  const queryFilters = [];
  let saved = 0;
  try {
    Store.findById = async id => ({ _id: id });
    User.findOne = filter => {
      queryFilters.push(filter);
      return { select: async () => ({
        _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', employmentProfile: { statutoryClassifications: [], compensationTaxClassifications: [] },
        set(path, value) { this.employmentProfile[path.split('.')[1]] = value; },
        async save() { saved += 1; }
      }) };
    };
    ActivityLog.create = async () => {};
    console.error = () => {};
    const owner = responseRecorder();
    await updateStatutoryClassification({ user: { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', role: 'store_owner', store: 'cccccccccccccccccccccccc' }, params: { employeeId: 'aaaaaaaaaaaaaaaaaaaaaaaa' }, body: { ...base, agency: 'SSS', employeeCategory: 'private_sector_employed', coverageStatus: 'covered', verificationAttestation: true }, ip: '127.0.0.1' }, owner.res);
    assert.equal(owner.status, 201);
    assert.equal(saved, 1);
    assert.equal(String(queryFilters[0].store), 'cccccccccccccccccccccccc');

    const finance = responseRecorder();
    await updateCompensationTaxClassification({ user: { _id: 'dddddddddddddddddddddddd', role: 'finance_staff', store: 'cccccccccccccccccccccccc' }, params: { employeeId: 'aaaaaaaaaaaaaaaaaaaaaaaa' }, body: { ...base, componentCode: 'bonus', compensationType: 'supplementary', taxTreatment: 'taxable', verificationAttestation: true } }, finance.res);
    assert.equal(finance.status, 403);
    assert.equal(saved, 1);
    assert.equal(queryFilters.length, 1);

    const crossStore = responseRecorder();
    User.findOne = filter => { queryFilters.push(filter); return { select: async () => null }; };
    await updateStatutoryClassification({ user: { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', role: 'store_owner', store: 'cccccccccccccccccccccccc' }, params: { employeeId: 'eeeeeeeeeeeeeeeeeeeeeeee' }, body: { ...base, agency: 'SSS', employeeCategory: 'private_sector_employed', coverageStatus: 'covered', verificationAttestation: true } }, crossStore.res);
    assert.equal(crossStore.status, 404);
    assert.equal(String(queryFilters.at(-1).store), 'cccccccccccccccccccccccc');
  } finally {
    Store.findById = originals.store;
    User.findOne = originals.user;
    ActivityLog.create = originals.audit;
    console.error = originals.error;
  }
});
