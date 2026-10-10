const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  activePayrollEmployeeFilter,
  payrollEligibility,
  payrollEmployeeQuery,
  payrollRosterFilter
} = require('../utils/payrollEligibility');
const User = require('../models/User');
const Store = require('../models/Store');
const { listEmployees } = require('../controllers/hrController');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const compensation = { compensationType: 'salary', baseRate: 18000, effectiveDate: new Date('2026-01-01') };
const rider = overrides => ({
  _id: 'rider-a',
  store: 'store-a',
  role: 'staff',
  staffType: 'delivery_rider',
  firstName: 'Rina',
  lastName: 'Rider',
  isActive: true,
  isDeleted: false,
  staffStatus: 'active',
  employmentProfile: { employmentStatus: 'active', compensation },
  ...overrides
});
test('payroll-eligible Rider is included through the canonical same-Store query', () => {
  const query = payrollEmployeeQuery('store-a');
  assert.equal(query.store, 'store-a');
  assert.ok(query.$or.some(item => item.role === 'staff'));
  assert.ok(query.$or.some(item => item.role?.$in?.includes('delivery_rider')));
  assert.deepEqual(payrollEligibility(rider(), new Date('2026-10-01')), {
    eligible: true, code: 'eligible', message: 'Payroll setup is complete.'
  });
});

test('HR roster returns an eligible same-Store Rider with server-authoritative readiness', async () => {
  const originalFind = User.find;
  const originalFindStore = Store.findById;
  let capturedQuery;
  try {
    Store.findById = async id => ({ _id: id });
    User.find = query => {
      capturedQuery = query;
      return {
        select() { return this; },
        sort() { return this; },
        lean: async () => [rider()]
      };
    };
    const response = {};
    await listEmployees(
      { user: { _id: 'owner-a', role: 'store_owner', store: 'store-a' } },
      { json: body => { response.body = body; }, status: code => ({ json: body => { response.status = code; response.body = body; } }) }
    );
    assert.equal(capturedQuery.store, 'store-a');
    assert.equal(response.body.employees.length, 1);
    assert.equal(response.body.employees[0].staffType, 'delivery_rider');
    assert.equal(response.body.employees[0].payrollEligibility.eligible, true);
    assert.equal(response.body.employees[0].employmentProfile.compensation, undefined);
  } finally {
    User.find = originalFind;
    Store.findById = originalFindStore;
  }
});

test('legacy Rider lifecycle omissions retain active defaults but explicit inactive states do not', () => {
  const filter = activePayrollEmployeeFilter();
  assert.deepEqual(filter.isDeleted, { $ne: true });
  assert.deepEqual(filter.isActive, { $ne: false });
  assert.equal(payrollEligibility(rider({ isActive: undefined, isDeleted: undefined, staffStatus: undefined }), new Date('2026-10-01')).eligible, true);
  assert.equal(payrollEligibility(rider({ isActive: false }), new Date('2026-10-01')).code, 'account_inactive');
  assert.equal(payrollEligibility(rider({ staffStatus: 'suspended' }), new Date('2026-10-01')).code, 'account_inactive');
});

test('Rider without employment compensation receives an actionable setup requirement', () => {
  const result = payrollEligibility(rider({ employmentProfile: { employmentStatus: 'active' } }), new Date('2026-10-01'));
  assert.equal(result.eligible, false);
  assert.equal(result.code, 'compensation_missing');
  assert.match(result.message, /Configure a positive salary, daily, or hourly base rate/);
});

test('inactive employment stays in the HR setup roster but is excluded from payroll', () => {
  assert.deepEqual(payrollRosterFilter().staffStatus, { $ne: 'archived' });
  const result = payrollEligibility(rider({ employmentProfile: { employmentStatus: 'inactive', compensation } }), new Date('2026-10-01'));
  assert.equal(result.eligible, false);
  assert.equal(result.code, 'employment_inactive');
});

test('cross-Store payroll selection remains impossible', () => {
  assert.equal(payrollEmployeeQuery('store-a').store, 'store-a');
  assert.notEqual(payrollEmployeeQuery('store-a').store, rider({ store: 'store-b' }).store);
  assert.match(read('controllers/hrController.js'), /payrollEmployeeQuery\(store\._id\)/);
});

test('existing non-Rider Staff follows the same explicit compensation contract', () => {
  const employee = rider({ _id: 'staff-a', role: 'staff', staffType: 'cashier', firstName: 'Casey', lastName: 'Cashier' });
  assert.equal(payrollEligibility(employee, new Date('2026-10-01')).eligible, true);
  assert.equal(payrollEligibility({ ...employee, employmentProfile: { employmentStatus: 'active' } }, new Date('2026-10-01')).code, 'compensation_missing');
});

test('payroll generation and Rider payslip visibility preserve finalized-paid policy', () => {
  const controller = read('controllers/hrController.js');
  assert.match(controller, /payrollEligibility\(employee, period\.periodEnd\)/);
  assert.match(controller, /employee: req\.user\._id, store: req\.user\.store, paymentStatus: 'recorded_paid'/);
  assert.match(controller, /employeeName: name, code: eligibility\.code/);
  assert.match(read('models/PayrollPeriod.js'), /employeeName:/);
});
