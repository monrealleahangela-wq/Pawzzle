const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const ActivityLog = require('../models/ActivityLog');
const Attendance = require('../models/Attendance');
const LeaveOverlapClaim = require('../models/LeaveOverlapClaim');
const LeaveRequest = require('../models/LeaveRequest');
const PayrollPeriod = require('../models/PayrollPeriod');
const Payslip = require('../models/Payslip');
const Store = require('../models/Store');
const User = require('../models/User');
const {
  createLeaveRequest, decideLeaveRequest, requestLeaveCancellation, reviewLeaveCancellation
} = require('../services/leaveWorkflowService');
const { reconcileLegacyLeaveClaims } = require('../services/leaveOverlapReconciliationService');
const { computePayrollPeriodAtomically } = require('../services/payrollComputationService');

const configuredUri = process.env.MONGODB_TRANSACTION_TEST_URI;
const waitWithTimeout = (promise, message, duration = 10000) => {
  let timer;
  return Promise.race([promise, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error(message)), duration); })])
    .finally(() => clearTimeout(timer));
};
const parsedConfiguredUri = configuredUri ? (() => { try { return new URL(configuredUri); } catch (_error) { return null; } })() : null;
const baseDatabaseName = parsedConfiguredUri?.pathname.replace(/^\//, '') || '';
const isolatedTargetError = configuredUri && (
  !parsedConfiguredUri
  || !['127.0.0.1', 'localhost', '[::1]'].includes(parsedConfiguredUri.hostname)
  || !/^pawzzle.*test/i.test(baseDatabaseName)
  || parsedConfiguredUri.username
  || parsedConfiguredUri.password
  || parsedConfiguredUri.searchParams.get('replicaSet') !== 'pawzzleTestRS'
) ? 'Refusing destructive leave integration cleanup: URI must target an unauthenticated loopback pawzzle test database on replica set pawzzleTestRS.' : null;
const isolatedUri = parsedConfiguredUri && !isolatedTargetError ? (() => {
  parsedConfiguredUri.pathname = `/${baseDatabaseName}_leave_batch4b_${process.pid}`;
  return parsedConfiguredUri.toString();
})() : null;

test('leave approval/reversal is atomic, overlap claims serialize requests, and finalized payroll is protected', {
  skip: !configuredUri ? 'MONGODB_TRANSACTION_TEST_URI is unset; isolated MongoDB transaction verification skipped.' : false
}, async () => {
  if (isolatedTargetError) throw new Error(isolatedTargetError);
  await mongoose.connect(isolatedUri, { autoIndex: false });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  assert.equal(hello.setName, 'pawzzleTestRS', 'integration tests require the isolated pawzzleTestRS replica set');
  assert.equal(hello.isWritablePrimary, true, 'isolated test replica set must be writable');
  assert.match(mongoose.connection.name, /^pawzzle.*test_leave_batch4b_\d+$/i, 'test cleanup is limited to its PID-scoped isolated database');
  await mongoose.connection.dropDatabase();
  try {
    await Promise.all([LeaveOverlapClaim.createIndexes(), Attendance.createIndexes()]);
    const storeId = new mongoose.Types.ObjectId();
    const employeeId = new mongoose.Types.ObjectId();
    const actorId = new mongoose.Types.ObjectId();
    const ownerId = new mongoose.Types.ObjectId();
    await Store.collection.insertOne({
      _id: storeId, owner: ownerId, name: 'Isolated leave test', slug: `leave-test-${process.pid}`,
      description: 'Isolated transaction fixture', businessType: 'other', operationalModules: [],
      hrSettings: { timezone: 'Asia/Manila', defaultWorkDays: [1, 2, 3, 4, 5], defaultShift: { start: '09:00', end: '17:00', breakMinutes: 0 } }
    });
    await User.collection.insertOne({
      _id: employeeId, username: `leave-test-${process.pid}`, email: `leave-test-${process.pid}@example.invalid`,
      role: 'staff', staffType: 'sales', store: storeId, isActive: true, isDeleted: false,
      employmentProfile: { employmentStatus: 'active', dateHired: new Date('2024-01-01T00:00:00Z') },
      professionalProfile: { leaveSchedule: [] }
    });
    const policy = { key: 'vacation', name: 'Vacation Leave', isPaid: true };
    const create = (startDate, endDate = startDate, reason = 'Personal leave request') => createLeaveRequest({
      storeId, employeeId, actorId: employeeId, startDate: new Date(`${startDate}T00:00:00Z`),
      endDate: new Date(`${endDate}T23:59:59.999Z`), leaveTypeKey: policy.key, policy, reason
    });

    const legacyLeaveId = new mongoose.Types.ObjectId();
    const legacyHistory = [{ action: 'submitted', actor: employeeId, at: new Date('2025-01-01T00:00:00Z'), comment: 'Original record' }];
    await LeaveRequest.collection.insertOne({
      _id: legacyLeaveId, store: storeId, employee: employeeId, leaveTypeKey: 'vacation',
      leaveTypeName: 'Vacation Leave', isPaid: true, startDate: new Date('2026-10-09T00:00:00Z'),
      endDate: new Date('2026-10-09T23:59:59.999Z'), reason: 'Legacy approved leave', status: 'approved', history: legacyHistory
    });
    await assert.rejects(() => create('2026-10-09'), { code: 'leave_overlap' });
    assert.equal(await LeaveOverlapClaim.countDocuments({ leaveRequest: legacyLeaveId }), 0);
    const dryRun = await reconcileLegacyLeaveClaims({ storeId, apply: false });
    assert.equal(dryRun.plannedClaimCount, 1);
    assert.equal(dryRun.applied, false);
    assert.equal(await LeaveOverlapClaim.countDocuments({ leaveRequest: legacyLeaveId }), 0);
    const backfill = await reconcileLegacyLeaveClaims({ storeId, apply: true });
    assert.equal(backfill.insertedClaimCount, 1);
    const repeatedBackfill = await reconcileLegacyLeaveClaims({ storeId, apply: true });
    assert.equal(repeatedBackfill.insertedClaimCount, 0);
    const legacyAfterBackfill = await LeaveRequest.findById(legacyLeaveId).lean();
    assert.equal(legacyAfterBackfill.status, 'approved');
    assert.equal(legacyAfterBackfill.history[0].comment, 'Original record');

    const created = await create('2026-10-19');
    const duplicate = await create('2026-10-19');
    assert.equal(duplicate.idempotent, true);
    assert.equal(created.leave.isPaid, true);
    await decideLeaveRequest({ storeId, leaveId: created.leave._id, actorId, decision: 'approved' });
    assert.equal((await LeaveRequest.findById(created.leave._id).lean()).status, 'approved');
    assert.equal(await Attendance.countDocuments({ store: storeId, employee: employeeId, leaveRequest: created.leave._id, status: 'on_leave' }), 1);
    assert.equal((await User.findById(employeeId).lean()).professionalProfile.leaveSchedule.length, 1);
    assert.equal(await ActivityLog.countDocuments({ store: storeId, category: 'leave' }), 2);

    const cancellation = await requestLeaveCancellation({ storeId, employeeId, leaveId: created.leave._id, actorId: employeeId });
    assert.equal(cancellation.leave.status, 'cancellation_requested');
    const repeatedCancellation = await requestLeaveCancellation({ storeId, employeeId, leaveId: created.leave._id, actorId: employeeId });
    assert.equal(repeatedCancellation.idempotent, true);
    const periodId = new mongoose.Types.ObjectId();
    const slipId = new mongoose.Types.ObjectId();
    await PayrollPeriod.collection.insertOne({
      _id: periodId, store: storeId, frequency: 'weekly', periodStart: new Date('2026-10-19'),
      periodEnd: new Date('2026-10-25'), payDate: new Date('2026-10-27'), status: 'approved',
      policySnapshot: {}, generatedBy: ownerId, approvedBy: ownerId, approvedAt: new Date(), payrollInputRevision: 0, computedInputRevision: 0
    });
    await Payslip.collection.insertOne({
      _id: slipId, payrollPeriod: periodId, store: storeId, employee: employeeId,
      employeeSnapshot: { name: 'Isolated Employee', compensationType: 'salary', baseRate: 1 },
      attendanceSummary: {}, basePay: 1, grossPay: 1, netPay: 1
    });
    await assert.rejects(() => reviewLeaveCancellation({ storeId, leaveId: created.leave._id, actorId, decision: 'cancelled' }), { code: 'leave_payroll_finalized' });
    assert.equal((await LeaveRequest.findById(created.leave._id).lean()).status, 'cancellation_requested');
    assert.equal(await Attendance.countDocuments({ leaveRequest: created.leave._id }), 1);
    assert.equal((await User.findById(employeeId).lean()).professionalProfile.leaveSchedule.length, 1);

    await PayrollPeriod.deleteOne({ _id: periodId });
    const draftPeriodId = new mongoose.Types.ObjectId();
    const draftSlipId = new mongoose.Types.ObjectId();
    await PayrollPeriod.collection.insertOne({
      _id: draftPeriodId, store: storeId, frequency: 'weekly', periodStart: new Date('2026-10-19'),
      periodEnd: new Date('2026-10-25'), payDate: new Date('2026-10-27'), status: 'reviewed',
      policySnapshot: {}, generatedBy: ownerId, reviewedBy: ownerId, reviewedAt: new Date(), reviewIssues: [], payrollInputRevision: 0, computedInputRevision: 0
    });
    await Payslip.collection.insertOne({
      _id: draftSlipId, payrollPeriod: draftPeriodId, store: storeId, employee: employeeId,
      employeeSnapshot: { name: 'Isolated Employee', compensationType: 'salary', baseRate: 1 },
      attendanceSummary: {}, basePay: 1, grossPay: 1, netPay: 1
    });
    const revisionBeforeRollback = (await PayrollPeriod.findById(draftPeriodId).lean()).payrollInputRevision || 0;
    const attendanceDelete = Attendance.deleteOne;
    Attendance.deleteOne = async () => { throw new Error('forced cancellation reversal failure'); };
    try {
      await assert.rejects(() => reviewLeaveCancellation({ storeId, leaveId: created.leave._id, actorId, decision: 'cancelled' }), /forced cancellation reversal failure/);
    } finally { Attendance.deleteOne = attendanceDelete; }
    assert.equal((await PayrollPeriod.findById(draftPeriodId).lean()).status, 'reviewed');
    assert.deepEqual((await PayrollPeriod.findById(draftPeriodId).lean()).reviewIssues, []);
    assert.equal((await PayrollPeriod.findById(draftPeriodId).lean()).payrollInputRevision || 0, revisionBeforeRollback, 'failed reversal rolls back the payroll dependency revision');
    assert.equal((await LeaveRequest.findById(created.leave._id).lean()).status, 'cancellation_requested');
    assert.equal(await Attendance.countDocuments({ leaveRequest: created.leave._id }), 1);

    await reviewLeaveCancellation({ storeId, leaveId: created.leave._id, actorId, decision: 'cancelled' });
    assert.equal((await LeaveRequest.findById(created.leave._id).lean()).status, 'cancelled');
    assert.equal(await Attendance.countDocuments({ leaveRequest: created.leave._id }), 0);
    assert.equal((await User.findById(employeeId).lean()).professionalProfile.leaveSchedule.length, 0);
    assert.equal(await LeaveOverlapClaim.countDocuments({ leaveRequest: created.leave._id }), 0);
    assert.equal((await PayrollPeriod.findById(draftPeriodId).lean()).status, 'computed');
    assert.equal((await PayrollPeriod.findById(draftPeriodId).lean()).reviewIssues[0].code, 'approved_leave_cancelled_recompute');
    assert.equal((await PayrollPeriod.findById(draftPeriodId).lean()).payrollInputRevision, revisionBeforeRollback + 1);
    await assert.rejects(() => reviewLeaveCancellation({ storeId, leaveId: created.leave._id, actorId, decision: 'cancelled' }), { code: 'leave_cancellation_not_pending' });
    assert.equal((await create('2026-10-19')).idempotent, false);

    // Hold a real payroll-computation transaction after it reads approved leave.
    // Cancellation commits first; the period write conflict must retry computation
    // so only the cancelled leave state can be published.
    const racePeriodId = new mongoose.Types.ObjectId();
    const raceEmployeeSlipId = new mongoose.Types.ObjectId();
    await PayrollPeriod.collection.insertOne({
      _id: racePeriodId, store: storeId, frequency: 'weekly', periodStart: new Date('2026-11-09'),
      periodEnd: new Date('2026-11-15'), payDate: new Date('2026-11-17'), status: 'computed',
      policySnapshot: {}, generatedBy: ownerId, reviewIssues: [], payrollInputRevision: 0, computedInputRevision: 0
    });
    await Payslip.collection.insertOne({
      _id: raceEmployeeSlipId, payrollPeriod: racePeriodId, store: storeId, employee: employeeId,
      employeeSnapshot: { name: 'Isolated Employee', compensationType: 'salary', baseRate: 1 },
      attendanceSummary: {}, basePay: 1, grossPay: 1, netPay: 1
    });
    const raceLeave = await create('2026-11-09');
    await decideLeaveRequest({ storeId, leaveId: raceLeave.leave._id, actorId, decision: 'approved' });
    await requestLeaveCancellation({ storeId, employeeId, leaveId: raceLeave.leave._id, actorId: employeeId });
    let releaseFirstCompute;
    let firstComputeRead;
    const firstRead = new Promise(resolve => { firstComputeRead = resolve; });
    const release = new Promise(resolve => { releaseFirstCompute = resolve; });
    const releaseRaceWatchdog = setTimeout(releaseFirstCompute, 10000);
    let computeAttempts = 0;
    let finalAttemptStatus;
    const computation = computePayrollPeriodAtomically({
      periodId: racePeriodId, storeId,
      calculate: async ({ session, period }) => {
        computeAttempts += 1;
        const currentLeave = await LeaveRequest.findById(raceLeave.leave._id).session(session).lean();
        if (computeAttempts === 1) { firstComputeRead(); await release; }
        await Payslip.updateOne({ _id: raceEmployeeSlipId }, { $set: { attendanceSummary: { unpaidLeaveDays: currentLeave.status === 'approved' ? 1 : 0 } } }, { session });
        period.reviewIssues = [];
        finalAttemptStatus = currentLeave.status;
        return { leaveStatus: currentLeave.status };
      }
    });
    await waitWithTimeout(firstRead, 'Payroll/cancellation race barrier was not reached within 10 seconds.');
    let cancellationAssertionFailure;
    try {
      await reviewLeaveCancellation({ storeId, leaveId: raceLeave.leave._id, actorId, decision: 'cancelled' });
      const invalidated = await PayrollPeriod.findById(racePeriodId).lean();
      assert.equal(invalidated.payrollInputRevision, 2, 'approval and cancellation each advance the input revision');
      assert.equal(invalidated.computedInputRevision, 0, 'the stale computed snapshot remains behind the invalidation');
      assert.ok(invalidated.reviewIssues.some(issue => issue.code === 'approved_leave_cancelled_recompute'), 'the newer blocker is committed before stale computation resumes');
    } catch (error) { cancellationAssertionFailure = error; }
    finally { releaseFirstCompute(); }
    await computation;
    clearTimeout(releaseRaceWatchdog);
    if (cancellationAssertionFailure) throw cancellationAssertionFailure;
    assert.ok(computeAttempts >= 2, 'a transient conflict retried the calculation from a fresh snapshot');
    assert.equal(finalAttemptStatus, 'cancelled');
    const recomputedPeriod = await PayrollPeriod.findById(racePeriodId).lean();
    const recomputedSlip = await Payslip.findById(raceEmployeeSlipId).lean();
    assert.equal(recomputedSlip.attendanceSummary.unpaidLeaveDays, 0, 'stale leave-dependent payslip data was not published');
    assert.equal(recomputedPeriod.computedInputRevision, recomputedPeriod.payrollInputRevision);
    assert.deepEqual(recomputedPeriod.reviewIssues, [], 'a blocker is cleared only by a fresh computation at the latest revision');

    // Concurrent recomputations of the same period serialize on its document;
    // both may complete only with a snapshot of the same input revision.
    const parallelPeriodId = new mongoose.Types.ObjectId();
    await PayrollPeriod.collection.insertOne({
      _id: parallelPeriodId, store: storeId, frequency: 'weekly', periodStart: new Date('2026-11-16'),
      periodEnd: new Date('2026-11-22'), payDate: new Date('2026-11-24'), status: 'draft',
      policySnapshot: {}, generatedBy: ownerId, payrollInputRevision: 3, computedInputRevision: 0
    });
    let parallelArrivals = 0;
    let releaseParallel;
    let bothParallelReady;
    const parallelGate = new Promise(resolve => { releaseParallel = resolve; });
    const parallelReady = new Promise(resolve => { bothParallelReady = resolve; });
    const releaseParallelWatchdog = setTimeout(releaseParallel, 10000);
    const parallelAttempts = [0, 0];
    const runParallel = slot => computePayrollPeriodAtomically({
      periodId: parallelPeriodId, storeId,
      calculate: async ({ period }) => {
        parallelAttempts[slot] += 1;
        if (parallelAttempts[slot] === 1) {
          parallelArrivals += 1;
          if (parallelArrivals === 2) bothParallelReady();
          await parallelGate;
        }
        period.totals = { employeeCount: 1, grossPay: 100, netPay: 100, deductions: 0 };
        return { inputRevision: Number(period.payrollInputRevision || 0) };
      }
    });
    const parallelComputations = [runParallel(0), runParallel(1)];
    let parallelBarrierFailure;
    try {
      await waitWithTimeout(parallelReady, 'Concurrent recomputation barrier was not reached within 10 seconds.');
    } catch (error) { parallelBarrierFailure = error; }
    finally { releaseParallel(); }
    const parallelSettled = await Promise.allSettled(parallelComputations);
    clearTimeout(releaseParallelWatchdog);
    if (parallelBarrierFailure) throw parallelBarrierFailure;
    const parallelFailure = parallelSettled.find(item => item.status === 'rejected');
    if (parallelFailure) throw parallelFailure.reason;
    const parallelResults = parallelSettled.map(item => item.value);
    assert.ok(parallelAttempts[0] + parallelAttempts[1] >= 3, 'at least one competing transaction recalculates after conflict');
    assert.ok(parallelResults.every(item => item.result.inputRevision === 3));
    const parallelPeriod = await PayrollPeriod.findById(parallelPeriodId).lean();
    assert.equal(parallelPeriod.computedInputRevision, parallelPeriod.payrollInputRevision);
    assert.equal(parallelPeriod.status, 'computed');

    const preexistingDate = '2026-10-30';
    await Attendance.collection.insertOne({
      store: storeId, employee: employeeId, workDate: preexistingDate,
      schedule: { isWorkDay: true, start: '09:00', end: '17:00', breakMinutes: 0, timezone: 'Asia/Manila' },
      status: 'absent', workedMinutes: 0, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 0
    });
    const priorAttendanceRequest = await create(preexistingDate);
    await decideLeaveRequest({ storeId, leaveId: priorAttendanceRequest.leave._id, actorId, decision: 'approved' });
    const overlaidAttendance = await Attendance.findOne({ store: storeId, employee: employeeId, workDate: preexistingDate }).lean();
    assert.equal(overlaidAttendance.status, 'on_leave');
    assert.equal(overlaidAttendance.leaveOriginalStatus, 'absent');
    assert.equal(overlaidAttendance.leaveCreatedRecord, false);
    await requestLeaveCancellation({ storeId, employeeId, leaveId: priorAttendanceRequest.leave._id, actorId: employeeId });
    await reviewLeaveCancellation({ storeId, leaveId: priorAttendanceRequest.leave._id, actorId, decision: 'cancelled' });
    const restoredAttendance = await Attendance.findOne({ store: storeId, employee: employeeId, workDate: preexistingDate }).lean();
    assert.equal(restoredAttendance.status, 'absent');
    assert.equal(restoredAttendance.leaveRequest, null);

    const racingRequest = await create('2026-11-02');
    await Promise.allSettled([
      decideLeaveRequest({ storeId, leaveId: racingRequest.leave._id, actorId, decision: 'approved' }),
      requestLeaveCancellation({ storeId, employeeId, leaveId: racingRequest.leave._id, actorId: employeeId })
    ]);
    const racedLeave = await LeaveRequest.findById(racingRequest.leave._id).lean();
    assert.ok(['approved', 'cancellation_requested', 'cancelled'].includes(racedLeave.status));
    const isStillActive = ['approved', 'cancellation_requested'].includes(racedLeave.status);
    assert.equal(await Attendance.countDocuments({ leaveRequest: racingRequest.leave._id }), isStillActive ? 1 : 0);
    assert.equal(await LeaveOverlapClaim.countDocuments({ leaveRequest: racingRequest.leave._id }), isStillActive ? 1 : 0);
    const leaveSchedule = (await User.findById(employeeId).lean()).professionalProfile.leaveSchedule;
    assert.equal(leaveSchedule.some(item => String(item.leaveRequest) === String(racingRequest.leave._id)), isStillActive);

    const rollback = await create('2026-10-20');
    const attendanceCreate = Attendance.create;
    Attendance.create = async () => { throw new Error('forced attendance failure'); };
    try {
      await assert.rejects(() => decideLeaveRequest({ storeId, leaveId: rollback.leave._id, actorId, decision: 'approved' }), /forced attendance failure/);
    } finally { Attendance.create = attendanceCreate; }
    assert.equal((await LeaveRequest.findById(rollback.leave._id).lean()).status, 'pending');
    assert.equal((await User.findById(employeeId).lean()).professionalProfile.leaveSchedule.length, 0);
    assert.equal(await Attendance.countDocuments({ leaveRequest: rollback.leave._id }), 0);

    const outcomes = await Promise.allSettled([create('2026-10-21', '2026-10-22'), create('2026-10-22', '2026-10-23')]);
    assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(item => item.status === 'rejected').length, 1);
    assert.equal(await LeaveOverlapClaim.countDocuments({ store: storeId, employee: employeeId, workDate: '2026-10-22' }), 1);

    const concurrentlyReviewed = await create('2026-10-26');
    await Promise.allSettled([
      decideLeaveRequest({ storeId, leaveId: concurrentlyReviewed.leave._id, actorId, decision: 'approved' }),
      decideLeaveRequest({ storeId, leaveId: concurrentlyReviewed.leave._id, actorId, decision: 'approved' })
    ]);
    assert.equal((await LeaveRequest.findById(concurrentlyReviewed.leave._id).lean()).status, 'approved');
    assert.equal(await Attendance.countDocuments({ leaveRequest: concurrentlyReviewed.leave._id, status: 'on_leave' }), 1);

    const terminatedEmployeeRequest = await create('2026-10-27');
    await User.updateOne({ _id: employeeId }, { $set: { 'employmentProfile.employmentStatus': 'terminated' } });
    await assert.rejects(() => decideLeaveRequest({ storeId, leaveId: terminatedEmployeeRequest.leave._id, actorId, decision: 'approved' }), { code: 'leave_employment_inactive' });
    assert.equal((await LeaveRequest.findById(terminatedEmployeeRequest.leave._id).lean()).status, 'pending');
    await User.updateOne({ _id: employeeId }, { $set: { 'employmentProfile.employmentStatus': 'active' } });

    const reassignedEmployeeRequest = await create('2026-10-28');
    await User.updateOne({ _id: employeeId }, { $set: { store: new mongoose.Types.ObjectId() } });
    await assert.rejects(() => decideLeaveRequest({ storeId, leaveId: reassignedEmployeeRequest.leave._id, actorId, decision: 'approved' }), { code: 'leave_employee_store_mismatch' });
    assert.equal((await LeaveRequest.findById(reassignedEmployeeRequest.leave._id).lean()).status, 'pending');
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
