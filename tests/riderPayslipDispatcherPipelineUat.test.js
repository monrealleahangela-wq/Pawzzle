const assert = require('node:assert/strict');
const test = require('node:test');
const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const PayrollPeriod = require('../models/PayrollPeriod');
const Payslip = require('../models/Payslip');
const RiderEarning = require('../models/RiderEarning');
const Store = require('../models/Store');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { computePeriod, myPayslips } = require('../controllers/hrController');

const compensation = { compensationType: 'salary', baseRate: 18000, effectiveDate: new Date('2026-01-01') };
const employee = overrides => ({
  _id: 'rider-staff',
  store: 'store-a',
  role: 'staff',
  staffType: 'delivery_rider',
  firstName: 'Rina',
  lastName: 'Rider',
  isActive: true,
  isDeleted: false,
  staffStatus: 'active',
  employmentProfile: { employmentStatus: 'active', dateHired: new Date('2025-01-01'), compensation },
  professionalProfile: { availability: {} },
  ...overrides
});

const responseRecorder = () => {
  const result = {};
  result.res = {
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return body; }
  };
  return result;
};

test('new payroll computation snapshots both Rider identity forms and excludes retired Dispatcher', async () => {
  const originals = {
    attendanceFind: Attendance.find,
    leaveFind: LeaveRequest.find,
    periodFindOne: PayrollPeriod.findOne,
    payslipFindOne: Payslip.findOne,
    payslipFindOneAndUpdate: Payslip.findOneAndUpdate,
    payslipDeleteOne: Payslip.deleteOne,
    payslipDeleteMany: Payslip.deleteMany,
    payslipAggregate: Payslip.aggregate,
    earningFind: RiderEarning.find,
    storeFindById: Store.findById,
    userFind: User.find,
    activityCreate: ActivityLog.create
  };
  const directRider = employee({ _id: 'rider-direct', role: 'delivery_rider', staffType: undefined, firstName: 'Dina' });
  const staffRider = employee({ _id: 'rider-staff' });
  const dispatcher = employee({ _id: 'dispatcher-legacy', staffType: 'delivery_dispatcher', firstName: 'Dex' });
  const period = {
    _id: 'period-a',
    status: 'draft',
    periodStart: new Date('2026-09-01T00:00:00.000Z'),
    periodEnd: new Date('2026-09-01T00:00:00.000Z'),
    policySnapshot: { timezone: 'Asia/Manila', defaultWorkDays: [], overtime: { enabled: false } },
    save: async () => period
  };
  const upserts = [];
  const deletedIndividuals = [];
  let cleanupFilter;
  let employeeQuery;
  try {
    Store.findById = async () => ({ _id: 'store-a', hrSettings: period.policySnapshot });
    PayrollPeriod.findOne = async () => period;
    User.find = query => ({
      select(selection) {
        if (selection.includes('+employmentProfile.compensation')) {
          employeeQuery = query;
          return Promise.resolve([directRider, staffRider, dispatcher]);
        }
        return { lean: async () => [] };
      }
    });
    Attendance.find = () => ({ lean: async () => [] });
    LeaveRequest.find = () => ({ lean: async () => [] });
    Payslip.findOne = async () => null;
    Payslip.findOneAndUpdate = async (filter, update) => { upserts.push({ filter, update }); return update; };
    Payslip.deleteOne = async filter => { deletedIndividuals.push(filter); };
    Payslip.deleteMany = async filter => { cleanupFilter = filter; };
    Payslip.aggregate = async () => [{ employeeCount: 2, grossPay: 36000, deductions: 0, netPay: 36000 }];
    RiderEarning.find = () => ({ lean: async () => [] });
    ActivityLog.create = async () => ({});

    const result = responseRecorder();
    await computePeriod({ params: { id: 'period-a' }, user: { _id: 'owner-a', role: 'store_owner', store: 'store-a' }, app: { get: () => null } }, result.res);

    assert.equal(result.status, undefined);
    assert.equal(result.body.period.status, 'computed');
    assert.equal(upserts.length, 2);
    assert.deepEqual(upserts.map(item => item.filter.employee).sort(), ['rider-direct', 'rider-staff']);
    assert.deepEqual(upserts.map(item => item.update.employeeSnapshot.role).sort(), ['delivery_rider', 'delivery_rider']);
    assert.ok(result.body.issues.some(issue => issue.employeeId === 'dispatcher-legacy' && issue.code === 'role_retired'));
    assert.ok(deletedIndividuals.some(filter => filter.employee === 'dispatcher-legacy'));
    assert.deepEqual(cleanupFilter.employee.$nin.sort(), ['rider-direct', 'rider-staff']);
    assert.equal(employeeQuery.store, 'store-a');
    assert.ok(employeeQuery.$or.some(row => row.role === 'staff'));
  } finally {
    Attendance.find = originals.attendanceFind;
    LeaveRequest.find = originals.leaveFind;
    PayrollPeriod.findOne = originals.periodFindOne;
    Payslip.findOne = originals.payslipFindOne;
    Payslip.findOneAndUpdate = originals.payslipFindOneAndUpdate;
    Payslip.deleteOne = originals.payslipDeleteOne;
    Payslip.deleteMany = originals.payslipDeleteMany;
    Payslip.aggregate = originals.payslipAggregate;
    RiderEarning.find = originals.earningFind;
    Store.findById = originals.storeFindById;
    User.find = originals.userFind;
    ActivityLog.create = originals.activityCreate;
  }
});

test('paid Rider and historical Dispatcher snapshots remain employee-owned and retrievable', async () => {
  const originalFind = Payslip.find;
  const originalFindOne = Payslip.findOne;
  const captured = [];
  try {
    Payslip.find = query => {
      captured.push(query);
      if (query.paymentStatus?.$ne === 'recorded_paid') return {
        populate() { return this; },
        sort() { return this; },
        lean: async () => []
      };
      return {
        populate() { return this; },
        sort: async () => [{ _id: `slip-${query.employee}`, employee: query.employee, paymentStatus: 'recorded_paid' }]
      };
    };
    Payslip.findOne = query => ({
      populate() { return this; },
      sort() { return this; },
      lean: async () => null
    });

    for (const user of [
      { _id: 'rider-direct', role: 'delivery_rider', store: 'store-a' },
      { _id: 'rider-staff', role: 'staff', staffType: 'delivery_rider', store: 'store-a' },
      { _id: 'dispatcher-legacy', role: 'staff', staffType: 'delivery_dispatcher', store: 'store-a' }
    ]) {
      const result = responseRecorder();
      await myPayslips({ user }, result.res);
      assert.equal(result.body.payslips.length, 1);
      assert.equal(result.body.payslips[0].employee, user._id);
    }
    assert.ok(captured.every(query => query.store === 'store-a'));
    assert.equal(captured[0].paymentStatus, 'recorded_paid');
    assert.ok(captured.some(query => query.paymentStatus?.$ne === 'recorded_paid'));
  } finally {
    Payslip.find = originalFind;
    Payslip.findOne = originalFindOne;
  }
});

test('approved and paid historical payroll periods cannot be recomputed or mutated', async () => {
  const originalStoreFindById = Store.findById;
  const originalPeriodFindOne = PayrollPeriod.findOne;
  const originalUpsert = Payslip.findOneAndUpdate;
  const originalError = console.error;
  let writes = 0;
  try {
    Store.findById = async () => ({ _id: 'store-a', hrSettings: {} });
    Payslip.findOneAndUpdate = async () => { writes += 1; };
    console.error = () => {};
    for (const status of ['approved', 'paid']) {
      PayrollPeriod.findOne = async () => ({ _id: 'period-a', status, periodEnd: new Date('2026-09-01') });
      const result = responseRecorder();
      await computePeriod({ params: { id: 'period-a' }, user: { _id: 'owner-a', role: 'store_owner', store: 'store-a' } }, result.res);
      assert.equal(result.status, 409);
      assert.match(result.body.message, /Only Draft or Computed payroll can be recomputed/);
    }
    assert.equal(writes, 0);
  } finally {
    Store.findById = originalStoreFindById;
    PayrollPeriod.findOne = originalPeriodFindOne;
    Payslip.findOneAndUpdate = originalUpsert;
    console.error = originalError;
  }
});
