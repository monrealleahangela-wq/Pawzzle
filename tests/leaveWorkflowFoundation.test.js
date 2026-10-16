const assert = require('node:assert/strict');
const test = require('node:test');
const ActivityLog = require('../models/ActivityLog');
const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const LeaveOverlapClaim = require('../models/LeaveOverlapClaim');
const service = require('../services/leaveWorkflowService');
const leaveAccess = require('../utils/leaveAccess');
const { buildClaimReconciliationPlan } = require('../services/leaveOverlapReconciliationService');

const employee = (overrides = {}) => ({
  _id: 'employee-1',
  store: 'store-1',
  role: 'staff',
  staffType: 'sales',
  isActive: true,
  isDeleted: false,
  employmentProfile: { employmentStatus: 'active', dateHired: new Date('2024-01-01T00:00:00Z') },
  ...overrides
});

test('leave civil-day claims validate calendar ranges, including inclusive endpoints', () => {
  assert.deepEqual(service.leaveDateKeys('2026-10-30', '2026-11-01'), ['2026-10-30', '2026-10-31', '2026-11-01']);
  assert.throws(() => service.leaveDateKeys('2026-11-02', '2026-11-01'), { code: 'invalid_leave_range' });
  assert.throws(() => service.leaveDateKeys('2026-01-01', '2038-01-01'), { code: 'invalid_leave_range' });
});

test('leave eligibility requires active staff and complete employment date coverage without truncation', () => {
  assert.equal(service.validateEmployeeForLeave(employee(), 'store-1', '2026-10-01', '2026-10-03')._id, 'employee-1');
  assert.throws(() => service.validateEmployeeForLeave(employee(), 'store-2', '2026-10-01', '2026-10-03'), { code: 'leave_employee_store_mismatch' });
  assert.throws(() => service.validateEmployeeForLeave(employee({ isActive: false }), 'store-1', '2026-10-01', '2026-10-03'), { code: 'leave_employee_inactive' });
  assert.throws(() => service.validateEmployeeForLeave(employee({ employmentProfile: { employmentStatus: 'active', dateHired: new Date('2026-10-02T00:00:00Z') } }), 'store-1', '2026-10-01', '2026-10-03'), { code: 'leave_outside_employment' });
  assert.throws(() => service.validateEmployeeForLeave(employee({ employmentProfile: { employmentStatus: 'terminated', dateHired: new Date('2020-01-01') } }), 'store-1', '2026-10-01', '2026-10-03'), { code: 'leave_employment_inactive' });
  assert.throws(() => service.validateEmployeeForLeave(employee({ employmentProfile: { employmentStatus: 'active' } }), 'store-1', '2026-10-01', '2026-10-03'), { code: 'leave_employment_dates_missing' });
});

test('leave attendance provenance, overlap uniqueness, and audit category are represented in schemas', () => {
  assert.equal(Attendance.schema.path('leaveRequest').instance, 'ObjectId');
  assert.equal(Attendance.schema.path('leaveCreatedRecord').defaultValue, false);
  assert.deepEqual(LeaveOverlapClaim.schema.indexes().find(([fields, options]) => fields.store && options.unique), [
    { store: 1, employee: 1, workDate: 1 }, { unique: true, background: true }
  ]);
  assert.ok(LeaveRequest.schema.path('status').enumValues.includes('cancellation_requested'));
  assert.ok(ActivityLog.schema.path('category').enumValues.includes('leave'));
});

test('leave projections redact attachments and Finance reason details; Finance cannot review their own leave', () => {
  const record = {
    _id: 'leave-1', reason: 'Sensitive reason', attachmentUrl: 'https://files.example.invalid/private',
    reviewComment: 'Sensitive review note', cancellationComment: 'Sensitive cancellation note',
    history: [{ action: 'submitted', comment: 'Private history detail' }]
  };
  const finance = { _id: 'finance-1', role: 'staff', staffType: 'finance_staff' };
  const financeProjection = leaveAccess.projectLeaveForStore(record, leaveAccess.canReadSensitiveLeave(finance));
  assert.equal(financeProjection.reason, undefined);
  assert.equal(financeProjection.reviewComment, undefined);
  assert.equal(financeProjection.cancellationComment, undefined);
  assert.equal(financeProjection.attachmentUrl, undefined);
  assert.equal(financeProjection.history[0].comment, '');
  assert.equal(leaveAccess.financeSelfReviewDenied(finance, 'finance-1'), true);
  assert.equal(leaveAccess.financeSelfReviewDenied(finance, 'employee-2'), false);
  const managerProjection = leaveAccess.projectLeaveForStore(record, leaveAccess.canReadSensitiveLeave({ role: 'manager' }));
  assert.equal(managerProjection.reason, 'Sensitive reason');
  assert.equal(managerProjection.attachmentUrl, undefined);
});

test('legacy overlap reconciliation reports conflicts without dropping requests and plans only safe claims idempotently', () => {
  const request = (id, startDate, endDate = startDate) => ({
    _id: id, store: 'store-1', employee: 'employee-1', status: 'approved', startDate, endDate
  });
  const requests = [
    request('legacy-a', '2026-11-01', '2026-11-03'),
    request('legacy-b', '2026-11-03', '2026-11-04'),
    request('legacy-c', '2026-11-06')
  ];
  const plan = buildClaimReconciliationPlan(requests, []);
  assert.equal(plan.activeRequestCount, 3);
  assert.equal(plan.conflicts.length, 1);
  assert.deepEqual(plan.conflicts[0].leaveRequestIds, ['legacy-a', 'legacy-b']);
  assert.equal(plan.conflicts[0].requiresManualResolution, true);
  assert.equal(plan.plannedClaims.length, 1);
  assert.equal(plan.plannedClaims[0].leaveRequest, 'legacy-c');

  const alreadyClaimed = buildClaimReconciliationPlan(requests, [{
    _id: 'claim-c', store: 'store-1', employee: 'employee-1', workDate: '2026-11-06', leaveRequest: 'legacy-c'
  }]);
  assert.equal(alreadyClaimed.plannedClaimCount, 0);
  assert.equal(alreadyClaimed.conflicts.length, 1);
  assert.equal(alreadyClaimed.activeRequestCount, 3);
  assert.equal(alreadyClaimed.invalidRanges.length, 0);

  const orphanedClaim = buildClaimReconciliationPlan(requests.slice(2), [{
    _id: 'orphan-claim', store: 'store-1', employee: 'employee-1', workDate: '2026-11-06', leaveRequest: 'missing-request'
  }]);
  assert.equal(orphanedClaim.orphanClaims.length, 1);
  assert.equal(orphanedClaim.conflicts.length, 1);
  assert.equal(orphanedClaim.plannedClaimCount, 0);
  assert.equal(orphanedClaim.orphanClaims[0].requiresManualResolution, true);
});

test('leave controller delegates approval and reversal through transaction-backed service operations', async () => {
  const fs = require('node:fs');
  const controller = fs.readFileSync(require.resolve('../controllers/hrController'), 'utf8');
  const routes = fs.readFileSync(require.resolve('../routes/hr'), 'utf8');
  assert.match(controller, /createLeaveRequest\(/);
  assert.match(controller, /decideLeaveRequest\(/);
  assert.match(controller, /reviewLeaveCancellation\(/);
  assert.match(controller, /invalidatePayrollInputForEmployeeDates/);
  assert.match(controller, /Finance cannot approve, reject, or confirm cancellation of its own leave request/);
  assert.match(require('node:fs').readFileSync(require.resolve('../utils/leaveAccess'), 'utf8'), /delete item\.attachmentUrl/);
  assert.match(controller, /canReviewSensitive/);
  assert.match(routes, /requirePermission\('leave\.approve'\), hr\.reviewLeave/);
  assert.match(require('node:fs').readFileSync(require.resolve('../services/leaveWorkflowService'), 'utf8'), /mongoose\.connection\.transaction\(/);
});
