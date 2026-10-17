const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const { computePay } = require('../utils/hrPolicy');
const {
  compensationSegmentsForPeriod,
  currentCompensationSummary,
  employmentRanges
} = require('../utils/payrollCompensation');
const { payrollEligibility } = require('../utils/payrollEligibility');
const { updateCompensation, addAdjustment, reviewPeriod } = require('../controllers/hrController');
const ActivityLog = require('../models/ActivityLog');
const PayrollPeriod = require('../models/PayrollPeriod');
const Payslip = require('../models/Payslip');
const Store = require('../models/Store');
const User = require('../models/User');
const { finalizePayrollPayment } = require('../services/payrollFinalizationService');

const settings = {
  payrollFrequency: 'monthly',
  defaultShift: { start: '09:00', end: '17:00', breakMinutes: 60 },
  lateDeductionEnabled: true,
  undertimeDeductionEnabled: true,
  overtime: { enabled: false }
};
const summary = { scheduledWorkDays: 10, daysPresent: 10, paidLeaveDays: 0, unpaidLeaveDays: 0, absences: 0, workedMinutes: 4200, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 0 };

const responseRecorder = () => {
  const result = {};
  result.res = {
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; }
  };
  return result;
};

test('monthly salary normalizes deterministically across monthly, semi-monthly, and weekly payroll', () => {
  const compensation = { compensationType: 'salary', compensationBasis: 'monthly', baseRate: 52000 };
  assert.equal(computePay({ compensation, summary, settings, frequency: 'monthly', periodScheduledWorkDays: 10 }).basePay, 52000);
  assert.equal(computePay({ compensation, summary, settings, frequency: 'semi_monthly', periodScheduledWorkDays: 10 }).basePay, 26000);
  assert.equal(computePay({ compensation, summary, settings, frequency: 'weekly', periodScheduledWorkDays: 10 }).basePay, 12000);
});

test('daily, hourly, and legacy per-period bases retain their established meanings', () => {
  const daily = computePay({ compensation: { compensationType: 'daily', compensationBasis: 'daily', baseRate: 800 }, summary: { ...summary, daysPresent: 8, paidLeaveDays: 1 }, settings, frequency: 'semi_monthly', periodScheduledWorkDays: 10 });
  const hourly = computePay({ compensation: { compensationType: 'hourly', compensationBasis: 'hourly', baseRate: 100 }, summary: { ...summary, workedMinutes: 600, paidLeaveDays: 1 }, settings, frequency: 'weekly', periodScheduledWorkDays: 10 });
  const legacy = computePay({ compensation: { compensationType: 'salary', baseRate: 18000 }, summary, settings, frequency: 'weekly', periodScheduledWorkDays: 10 });
  assert.equal(daily.basePay, 7200);
  assert.equal(hourly.basePay, 1700);
  assert.equal(legacy.compensationBasis, 'legacy_period');
  assert.equal(legacy.basePay, 18000);
  assert.deepEqual(currentCompensationSummary({ compensation: { compensationType: 'salary', baseRate: 18000, effectiveDate: new Date('2025-01-01') } }), {
    compensationType: 'salary', compensationBasis: 'legacy_period', effectiveDate: new Date('2025-01-01'), reviewRequired: true
  });
});

test('monthly salary is prorated by eligible scheduled workdays for partial employment', () => {
  const result = computePay({
    compensation: { compensationType: 'salary', compensationBasis: 'monthly', baseRate: 40000 },
    summary: { ...summary, scheduledWorkDays: 5, daysPresent: 5 },
    settings,
    frequency: 'monthly',
    periodScheduledWorkDays: 20
  });
  assert.equal(result.basePay, 10000);
});

test('effective-dated revisions select historical rates and split mid-period changes', () => {
  const profile = {
    employmentStatus: 'active',
    dateHired: new Date('2025-01-01'),
    compensationHistory: [{ compensationType: 'salary', compensationBasis: 'monthly', baseRate: 20000, effectiveDate: new Date('2025-01-01') }],
    compensation: { compensationType: 'salary', compensationBasis: 'monthly', baseRate: 30000, effectiveDate: new Date('2025-02-01') }
  };
  const january = compensationSegmentsForPeriod(profile, new Date('2025-01-01'), new Date('2025-01-31'));
  const february = compensationSegmentsForPeriod(profile, new Date('2025-02-01'), new Date('2025-02-28'));
  assert.equal(january.segments.length, 1);
  assert.equal(january.segments[0].compensation.baseRate, 20000);
  assert.equal(february.segments[0].compensation.baseRate, 30000);

  profile.compensation.effectiveDate = new Date('2025-01-16');
  const split = compensationSegmentsForPeriod(profile, new Date('2025-01-01'), new Date('2025-01-31'));
  assert.deepEqual(split.segments.map(item => [item.start.toISOString().slice(0, 10), item.end.toISOString().slice(0, 10), item.compensation.baseRate]), [
    ['2025-01-01', '2025-01-15', 20000],
    ['2025-01-16', '2025-01-31', 30000]
  ]);
});

test('employment start and termination bound payroll eligibility without changing finalized snapshots', () => {
  const profile = {
    employmentStatus: 'terminated',
    dateHired: new Date('2025-01-16'),
    employmentEndDate: new Date('2025-01-31'),
    compensation: { compensationType: 'salary', compensationBasis: 'monthly', baseRate: 40000, effectiveDate: new Date('2025-01-16') }
  };
  assert.deepEqual(employmentRanges(profile, new Date('2025-01-01'), new Date('2025-01-31')).map(item => [item.start.toISOString().slice(0, 10), item.end.toISOString().slice(0, 10)]), [['2025-01-16', '2025-01-31']]);
  const employee = { role: 'staff', staffType: 'cashier', isActive: false, staffStatus: 'inactive', employmentProfile: profile };
  assert.equal(payrollEligibility(employee, new Date('2025-01-31'), new Date('2025-01-01')).eligible, true);
  assert.equal(payrollEligibility(employee, new Date('2025-02-28'), new Date('2025-02-01')).code, 'account_inactive');
  assert.ok(Payslip.schema.path('employeeSnapshot.compensationSegments'));
});

test('Finance cannot change its own compensation through the backend', async () => {
  const originals = { store: Store.findById, user: User.findOne, log: ActivityLog.create, error: console.error };
  try {
    Store.findById = async id => ({ _id: id });
    User.findOne = () => ({ select: async () => ({ _id: '507f191e810c19729de860ea', role: 'staff', staffType: 'finance_staff', employmentProfile: { employmentStatus: 'active' } }) });
    ActivityLog.create = async () => ({});
    console.error = () => {};
    const result = responseRecorder();
    await updateCompensation({
      params: { employeeId: '507f191e810c19729de860ea' },
      body: { compensation: { compensationBasis: 'monthly', baseRate: 30000, effectiveDate: '2026-01-01' }, changeReason: 'Self change attempt' },
      user: { _id: '507f191e810c19729de860ea', role: 'finance_staff', store: '507f191e810c19729de860eb' }
    }, result.res);
    assert.equal(result.status, 403);
    assert.match(result.body.message, /cannot change their own/);
  } finally {
    Store.findById = originals.store; User.findOne = originals.user; ActivityLog.create = originals.log; console.error = originals.error;
  }
});

test('compensation updates cannot target an employee from another Store', async () => {
  const originals = { store: Store.findById, user: User.findOne, error: console.error };
  let employeeFilter;
  try {
    Store.findById = async id => ({ _id: id });
    User.findOne = filter => {
      employeeFilter = filter;
      return { select: async () => null };
    };
    console.error = () => {};
    const result = responseRecorder();
    await updateCompensation({
      params: { employeeId: '507f191e810c19729de860ea' },
      body: { compensation: { compensationBasis: 'monthly', baseRate: 30000, effectiveDate: '2026-01-01' }, changeReason: 'Cross Store attempt' },
      user: { _id: '507f191e810c19729de860ec', role: 'finance_staff', store: '507f191e810c19729de860eb' }
    }, result.res);
    assert.equal(result.status, 404);
    assert.equal(String(employeeFilter.store), '507f191e810c19729de860eb');
    assert.match(result.body.message, /not found in this Store/);
  } finally {
    Store.findById = originals.store; User.findOne = originals.user; console.error = originals.error;
  }
});

test('Finance cannot adjust or review a payroll containing its own salary', async () => {
  const originals = { transaction: mongoose.connection.transaction, store: Store.findById, slip: Payslip.findOne, period: PayrollPeriod.findOne, exists: Payslip.exists, error: console.error };
  try {
    Store.findById = async id => ({ _id: id });
    Payslip.findOne = async () => ({ _id: 'slip-a', employee: 'finance-a' });
    PayrollPeriod.findOne = async () => ({ _id: 'period-a', status: 'computed' });
    Payslip.exists = async () => ({ _id: 'slip-a' });
    console.error = () => {};
    const adjustment = responseRecorder();
    await addAdjustment({ params: { payslipId: 'slip-a' }, body: { amount: 100, reason: 'Self adjustment' }, user: { _id: 'finance-a', role: 'finance_staff', store: 'store-a' } }, adjustment.res);
    assert.equal(adjustment.status, 403);
    assert.match(adjustment.body.message, /own payslip/);
    mongoose.connection.transaction = async callback => callback({ id: 'session-review' });
    PayrollPeriod.findOne = () => ({ session: async () => ({ _id: 'period-a', status: 'computed' }) });
    Payslip.exists = () => ({ session: async () => ({ _id: 'slip-a' }) });
    const review = responseRecorder();
    await reviewPeriod({ params: { id: 'period-a' }, body: {}, user: { _id: 'finance-a', role: 'finance_staff', store: 'store-a' } }, review.res);
    assert.equal(review.status, 403);
    assert.match(review.body.message, /includes their own salary/);
  } finally {
    mongoose.connection.transaction = originals.transaction; Store.findById = originals.store; Payslip.findOne = originals.slip; PayrollPeriod.findOne = originals.period; Payslip.exists = originals.exists; console.error = originals.error;
  }
});

test('Finance cannot finalize a period-wide payment containing its own salary', async () => {
  const originals = { transaction: mongoose.connection.transaction, period: PayrollPeriod.findOne, slips: Payslip.find };
  try {
    mongoose.connection.transaction = async callback => callback({ id: 'session-a' });
    PayrollPeriod.findOne = () => ({ session: async () => ({ _id: 'period-a', status: 'approved' }) });
    Payslip.find = () => ({ session: async () => [{ _id: 'slip-a', employee: 'finance-a', additions: [] }] });
    await assert.rejects(() => finalizePayrollPayment({
      periodId: 'period-a',
      storeId: 'store-a',
      actor: { _id: 'finance-a', role: 'finance_staff' },
      payment: { method: 'bank_transfer', referenceNumber: 'SELF-PAY' }
    }), error => error.statusCode === 403 && /includes their own salary/.test(error.message));
  } finally {
    mongoose.connection.transaction = originals.transaction; PayrollPeriod.findOne = originals.period; Payslip.find = originals.slips;
  }
});

test('schemas retain effective-dated history and structured compensation audit fields', () => {
  assert.ok(User.schema.path('employmentProfile.compensationHistory'));
  assert.ok(User.schema.path('employmentProfile.employmentHistory'));
  assert.ok(User.schema.path('employmentProfile.employmentEndDate'));
  assert.ok(ActivityLog.schema.path('changes.before'));
  assert.ok(ActivityLog.schema.path('changes.after'));
  assert.ok(PayrollPeriod.schema.path('paymentRecord.referenceNumber'));
});
