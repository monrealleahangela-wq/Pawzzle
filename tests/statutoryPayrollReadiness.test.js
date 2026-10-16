const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const { assessStatutoryPayrollReadiness, deriveReadinessStatus, isStatutoryPayrollReady, statutoryReadinessMessage } = require('../utils/statutoryPayrollReadiness');
const { reviewPeriod, approvePeriod } = require('../controllers/hrController');
const PayrollPeriod = require('../models/PayrollPeriod');
const Store = require('../models/Store');

const responseRecorder = () => {
  const result = {};
  result.res = {
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; }
  };
  return result;
};

test('statutory payroll readiness fails closed with agency-specific blockers', () => {
  const readiness = assessStatutoryPayrollReadiness();
  assert.equal(readiness.status, 'blocked_missing_rules');
  assert.equal(readiness.reviewedOn, '2026-10-14');
  assert.deepEqual(readiness.blockingReasons.map(item => item.agency), ['SSS', 'PhilHealth', 'Pag-IBIG', 'BIR', 'BIR', 'Payroll', 'Payroll']);
  assert.match(statutoryReadinessMessage(readiness), /PhilHealth:.*first-party advisory itself was not obtained/);
  assert.match(statutoryReadinessMessage(readiness), /SSS:.*standalone SSS Circular 2024-006 calculator/);
  assert.match(statutoryReadinessMessage({ status: 'unassessed' }), /no verified calculation snapshot/i);
});

test('readiness distinguishes missing rules, employee data, and calculation failures', () => {
  assert.equal(deriveReadinessStatus({ blockers: [{ category: 'rules' }] }), 'blocked_missing_rules');
  assert.equal(deriveReadinessStatus({ blockers: [{ category: 'employee_data' }] }), 'blocked_missing_employee_data');
  assert.equal(deriveReadinessStatus({ blockers: [{ category: 'calculation_error' }] }), 'blocked_calculation_error');
  assert.equal(deriveReadinessStatus(), 'blocked_missing_rules');
});

test('a ready label with unresolved blockers is not accepted as payroll-ready', () => {
  const period = { periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-01-31') };
  assert.equal(isStatutoryPayrollReady({ status: 'ready', blockingReasons: [] }, period), false);
  assert.equal(isStatutoryPayrollReady({ status: 'ready', blockingReasons: [{ code: 'missing_rule' }] }, period), false);
  assert.equal(isStatutoryPayrollReady({ status: 'blocked_missing_rules', blockingReasons: [] }, period), false);
});

test('new payroll schemas retain a persisted statutory readiness decision', () => {
  assert.ok(PayrollPeriod.schema.path('statutoryReadiness.status'));
  assert.ok(PayrollPeriod.schema.path('statutoryReadiness.blockingReasons'));
  assert.ok(PayrollPeriod.schema.path('statutoryReadiness.verifiedSnapshot.ruleVersions'));
  assert.equal(PayrollPeriod.schema.path('statutoryReadiness.status').defaultValue, 'unassessed');
  assert.ok(PayrollPeriod.schema.path('statutoryReadiness.blockingReasons.category'));
});

test('review and approval endpoints reject blocked payroll and a forged ready label without snapshot evidence', async () => {
  const originals = { store: Store.findById, period: PayrollPeriod.findOne, transaction: mongoose.connection.transaction, error: console.error };
  try {
    mongoose.connection.transaction = async callback => callback({ id: 'session-a' });
    Store.findById = async id => ({ _id: id });
    PayrollPeriod.findOne = filter => ({ session: async () => ({
      _id: filter._id,
      status: filter._id === 'period-computed' ? 'computed' : 'reviewed',
      statutoryReadiness: filter._id === 'period-computed'
        ? assessStatutoryPayrollReadiness()
        : { status: 'ready', blockingReasons: [] }
    }) });
    console.error = () => {};

    const review = responseRecorder();
    await reviewPeriod({
      params: { id: 'period-computed' }, body: {},
      user: { _id: 'owner-a', role: 'store_owner', store: 'store-a' }
    }, review.res);
    assert.equal(review.status, 409);
    assert.match(review.body.message, /Statutory payroll is blocked/);

    const approval = responseRecorder();
    await approvePeriod({
      params: { id: 'period-reviewed' }, body: {},
      user: { _id: 'owner-a', role: 'store_owner', store: 'store-a' }
    }, approval.res);
    assert.equal(approval.status, 409);
    assert.match(approval.body.message, /Statutory payroll is blocked/);
  } finally {
    Store.findById = originals.store;
    PayrollPeriod.findOne = originals.period;
    mongoose.connection.transaction = originals.transaction;
    console.error = originals.error;
  }
});
