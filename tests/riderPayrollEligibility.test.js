const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  activePayrollEmployeeFilter,
  PAYROLL_STAFF_TYPES,
  payrollEligibility,
  payrollEmployeeQuery,
  payrollRosterFilter
} = require('../utils/payrollEligibility');
const User = require('../models/User');
const Store = require('../models/Store');
const { listEmployees, updateCompensation } = require('../controllers/hrController');

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
  assert.ok(query.$or.some(item => item.role === 'staff' && item.staffType?.$in?.includes('delivery_rider')));
  assert.ok(query.$or.some(item => item.role?.$in?.includes('delivery_rider')));
  assert.ok(PAYROLL_STAFF_TYPES.includes('delivery_rider'));
  assert.deepEqual(payrollEligibility(rider(), new Date('2026-10-01')), {
    eligible: true, code: 'eligible', message: 'Payroll setup is complete.'
  });
  assert.equal(payrollEligibility(rider({ role: 'delivery_rider', staffType: undefined }), new Date('2026-10-01')).eligible, true);
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
  assert.equal(payrollEligibility(rider({ isDeleted: true }), new Date('2026-10-01')).code, 'account_archived');
  assert.equal(payrollEligibility(rider({ staffStatus: 'archived' }), new Date('2026-10-01')).code, 'account_archived');
});

test('legacy Rider with compensation but optional employment lifecycle fields missing remains eligible', () => {
  const legacy = rider({
    isActive: undefined,
    isDeleted: undefined,
    staffStatus: undefined,
    employmentProfile: { compensation }
  });
  assert.equal(payrollEligibility(legacy, new Date('2026-10-01')).eligible, true);
});

test('Rider without an employment record is distinguished from missing compensation', () => {
  const missingEmployment = payrollEligibility(rider({ employmentProfile: undefined }), new Date('2026-10-01'));
  const missingCompensation = payrollEligibility(rider({ employmentProfile: { employmentStatus: 'active' } }), new Date('2026-10-01'));
  assert.equal(missingEmployment.code, 'employment_missing');
  assert.equal(missingCompensation.code, 'compensation_missing');
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

test('retired Dispatcher identities remain explainable in HR but are excluded from new payroll', () => {
  for (const dispatcher of [
    rider({ role: 'delivery_dispatcher', staffType: undefined }),
    rider({ role: 'staff', staffType: 'delivery_dispatcher' }),
    rider({ role: 'staff', staffType: 'logistics_staff' })
  ]) {
    const result = payrollEligibility(dispatcher, new Date('2026-10-01'));
    assert.equal(result.eligible, false);
    assert.equal(result.code, 'role_retired');
    assert.match(result.message, /excluded from new payroll/);
  }
  const generationFilter = activePayrollEmployeeFilter();
  assert.ok(!generationFilter.$or.some(item => item.staffType?.$in?.includes('delivery_dispatcher')));
  assert.ok(payrollRosterFilter().$or.some(item => item.role === 'staff'));
});

test('server rejects compensation enrollment for a retired Dispatcher identity', async () => {
  const originalFindOne = User.findOne;
  const originalFindStore = Store.findById;
  const originalError = console.error;
  try {
    Store.findById = async id => ({ _id: id });
    User.findOne = () => ({
      select: async () => rider({ role: 'staff', staffType: 'delivery_dispatcher' })
    });
    console.error = () => {};
    const response = {};
    await updateCompensation(
      {
        params: { employeeId: '507f1f77bcf86cd799439011' },
        body: { employmentStatus: 'active', compensation },
        user: { _id: 'owner-a', role: 'store_owner', store: '507f1f77bcf86cd799439012' }
      },
      { json: body => { response.body = body; }, status: code => ({ json: body => { response.status = code; response.body = body; } }) }
    );
    assert.equal(response.status, 409);
    assert.match(response.body.message, /retired role/);
  } finally {
    User.findOne = originalFindOne;
    Store.findById = originalFindStore;
    console.error = originalError;
  }
});

test('employment and compensation effective dates prevent post-period inclusion', () => {
  assert.equal(payrollEligibility(rider({ employmentProfile: { dateHired: new Date('2026-10-02'), compensation } }), new Date('2026-10-01')).code, 'employment_not_started');
  assert.equal(payrollEligibility(rider({ employmentProfile: { dateHired: new Date('2026-01-01'), compensation: { ...compensation, effectiveDate: new Date('2026-10-02') } } }), new Date('2026-10-01')).code, 'compensation_not_effective');
});

test('cross-Store payroll selection remains impossible', () => {
  assert.equal(payrollEmployeeQuery('store-a').store, 'store-a');
  assert.notEqual(payrollEmployeeQuery('store-a').store, rider({ store: 'store-b' }).store);
  assert.match(read('controllers/hrController.js'), /payrollEmployeeQuery\(store\._id, \{ includeInactive: true \}\)/);
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
