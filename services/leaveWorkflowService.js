const mongoose = require('mongoose');
const ActivityLog = require('../models/ActivityLog');
const Attendance = require('../models/Attendance');
const LeaveOverlapClaim = require('../models/LeaveOverlapClaim');
const LeaveRequest = require('../models/LeaveRequest');
const PayrollPeriod = require('../models/PayrollPeriod');
const Payslip = require('../models/Payslip');
const Store = require('../models/Store');
const User = require('../models/User');
const { isOperationalStaff } = require('../config/permissions');
const { getScheduleForDate } = require('../utils/hrPolicy');
const { invalidatePayrollInputForEmployeeDates } = require('./payrollComputationService');

const ACTIVE_EMPLOYMENT = new Set(['active', 'probationary', 'part_time', 'contract']);
const ACTIVE_REQUEST_STATUSES = ['pending', 'approved', 'cancellation_requested'];
const MAX_CLAIM_DAYS = 3660;
let claimIndexPromise;
const fail = (code, message, statusCode = 409) => Object.assign(new Error(message), { code, statusCode });
const sameId = (left, right) => String(left?._id || left || '') === String(right?._id || right || '');
const dateKey = value => new Date(value).toISOString().slice(0, 10);
const dateOnly = value => {
  const key = value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
  return new Date(`${key}T00:00:00.000Z`);
};
const endOfDate = value => new Date(dateOnly(value).getTime() + 86399999);

const leaveDateKeys = (startDate, endDate) => {
  const start = dateOnly(startDate);
  const end = dateOnly(endDate);
  const dayCount = Math.floor((end - start) / 86400000) + 1;
  if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > MAX_CLAIM_DAYS) {
    throw fail('invalid_leave_range', `Leave must span from 1 to ${MAX_CLAIM_DAYS} calendar days.`, 400);
  }
  return Array.from({ length: dayCount }, (_item, index) => new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10));
};

const employmentIntervals = profile => {
  const intervals = (profile?.employmentHistory || [])
    .filter(row => ACTIVE_EMPLOYMENT.has(row.employmentStatus || 'active'))
    .map(row => ({ start: row.startDate, end: row.endDate || null }));
  if (ACTIVE_EMPLOYMENT.has(profile?.employmentStatus) && profile?.dateHired) {
    intervals.push({ start: profile.dateHired, end: profile.employmentEndDate || null });
  }
  return intervals.map(row => ({
    start: dateOnly(row.start),
    end: row.end ? endOfDate(row.end) : new Date('9999-12-31T23:59:59.999Z')
  })).filter(row => Number.isFinite(row.start.getTime()) && row.start <= row.end)
    .sort((left, right) => left.start - right.start);
};

const validateEmployeeForLeave = (employee, storeId, startDate, endDate) => {
  if (!employee || !sameId(employee.store, storeId)) throw fail('leave_employee_store_mismatch', 'Employee is not assigned to this Store.', 403);
  if (employee.isDeleted || employee.isActive === false || ['archived', 'suspended', 'inactive'].includes(employee.staffStatus)) {
    throw fail('leave_employee_inactive', 'Only an active employee may submit or receive approval for leave.', 409);
  }
  if (!isOperationalStaff(employee)) throw fail('leave_employee_not_staff', 'Leave is available only to assigned Store employees.', 403);
  const profile = employee.employmentProfile;
  if (!profile || !ACTIVE_EMPLOYMENT.has(profile.employmentStatus)) {
    throw fail('leave_employment_inactive', 'Set the employee to an active employment status before submitting or approving leave.', 409);
  }
  if (!profile.dateHired && !(profile.employmentHistory || []).some(row => row.startDate)) {
    throw fail('leave_employment_dates_missing', 'Record the employee employment start date before submitting or approving leave.', 409);
  }
  const requestedStart = dateOnly(startDate);
  const requestedEnd = endOfDate(endDate);
  const intervals = employmentIntervals(profile);
  let coveredThrough = requestedStart.getTime() - 1;
  for (const range of intervals) {
    if (range.end.getTime() < coveredThrough) continue;
    if (range.start.getTime() > coveredThrough + 1) break;
    coveredThrough = Math.max(coveredThrough, range.end.getTime());
    if (coveredThrough >= requestedEnd.getTime()) return employee;
  }
  throw fail('leave_outside_employment', 'Requested leave must fall entirely within a continuous active employment interval; dates were not shortened.', 409);
};

const loadLeaveEmployee = async (employeeId, storeId, session) => User.findOne({ _id: employeeId, store: storeId })
  .select('+employmentProfile.employmentHistory')
  .session(session);

const claimRequestDays = async ({ storeId, employeeId, leave, session }) => {
  const keys = leaveDateKeys(leave.startDate, leave.endDate);
  const existing = await LeaveOverlapClaim.find({ store: storeId, employee: employeeId, workDate: { $in: keys } }).session(session).lean();
  if (existing.some(claim => !sameId(claim.leaveRequest, leave._id))) {
    throw fail('leave_overlap', 'Another pending or approved leave request already claims one or more of these dates.');
  }
  const byDate = new Set(existing.map(item => item.workDate));
  const missing = keys.filter(workDate => !byDate.has(workDate)).map(workDate => ({ store: storeId, employee: employeeId, workDate, leaveRequest: leave._id }));
  if (missing.length) await LeaveOverlapClaim.insertMany(missing, { session, ordered: true });
};

const writeAudit = async ({ actorId, storeId, action, details, session, ipAddress }) => ActivityLog.create([{
  user: actorId, action, details, store: storeId, category: 'leave', ipAddress
}], { session });
const ensureClaimIndex = async () => {
  if (!claimIndexPromise) claimIndexPromise = LeaveOverlapClaim.createIndexes().catch(error => {
    claimIndexPromise = null;
    throw error;
  });
  return claimIndexPromise;
};

const createLeaveRequest = async ({ storeId, employeeId, actorId, startDate, endDate, leaveTypeKey, policy, reason, attachmentUrl, ipAddress }) => {
  await ensureClaimIndex();
  const keys = leaveDateKeys(startDate, endDate);
  let outcome;
  try {
    await mongoose.connection.transaction(async session => {
      const store = await Store.findById(storeId).session(session);
      const employee = await loadLeaveEmployee(employeeId, storeId, session);
      if (!store) throw fail('leave_store_missing', 'Store not found.', 404);
      validateEmployeeForLeave(employee, storeId, startDate, endDate);
      const requestData = { store: storeId, employee: employeeId, startDate, endDate, leaveTypeKey, reason };
      const duplicate = await LeaveRequest.findOne({ ...requestData, status: { $in: ACTIVE_REQUEST_STATUSES } }).session(session);
      if (duplicate) {
        await claimRequestDays({ storeId, employeeId, leave: duplicate, session });
        outcome = { leave: duplicate, idempotent: true };
        return;
      }
      // This query also protects legacy active requests created before the
      // unique daily claim index was introduced.
      const overlap = await LeaveRequest.findOne({
        store: storeId, employee: employeeId, status: { $in: ACTIVE_REQUEST_STATUSES },
        startDate: { $lte: endOfDate(endDate) }, endDate: { $gte: dateOnly(startDate) }
      }).session(session);
      if (overlap) throw fail('leave_overlap', 'A pending, approved, or cancellation-requested leave already covers these dates.');
      const [leave] = await LeaveRequest.create([{
        ...requestData,
        leaveTypeName: policy.name,
        isPaid: Boolean(policy.isPaid),
        attachmentUrl: String(attachmentUrl || '').trim(),
        history: [{ action: 'submitted', actor: actorId }]
      }], { session });
      await LeaveOverlapClaim.insertMany(keys.map(workDate => ({ store: storeId, employee: employeeId, workDate, leaveRequest: leave._id })), { session, ordered: true });
      await writeAudit({ actorId, storeId, action: 'Leave Requested', details: `Leave ${leave._id} submitted for ${dateKey(startDate)} to ${dateKey(endDate)}.`, session, ipAddress });
      outcome = { leave, idempotent: false };
    });
    return outcome;
  } catch (error) {
    if (error.code === 11000) {
      const duplicate = await LeaveRequest.findOne({
        store: storeId, employee: employeeId, startDate, endDate, leaveTypeKey, reason,
        status: { $in: ACTIVE_REQUEST_STATUSES }
      });
      if (duplicate) return { leave: duplicate, idempotent: true };
      throw fail('leave_overlap', 'Another request claimed one or more of these dates first.', 409);
    }
    throw error;
  }
};

const decideLeaveRequest = async ({ storeId, leaveId, actorId, decision, comment, ipAddress }) => {
  await ensureClaimIndex();
  if (!['approved', 'rejected'].includes(decision)) throw fail('invalid_leave_decision', 'Leave decision must be approved or rejected.', 400);
  let outcome;
  try { await mongoose.connection.transaction(async session => {
    const leave = await LeaveRequest.findOne({ _id: leaveId, store: storeId, status: 'pending' }).session(session);
    if (!leave) throw fail('leave_not_pending', 'Leave request is no longer pending or was not found in this Store.', 409);
    const store = await Store.findById(storeId).session(session);
    const employee = await loadLeaveEmployee(leave.employee, storeId, session);
    if (!store) throw fail('leave_store_missing', 'Store not found.', 404);
    validateEmployeeForLeave(employee, storeId, leave.startDate, leave.endDate);

    if (decision === 'approved') {
      const otherOverlap = await LeaveRequest.findOne({
        _id: { $ne: leave._id }, store: storeId, employee: leave.employee, status: { $in: ACTIVE_REQUEST_STATUSES },
        startDate: { $lte: endOfDate(leave.endDate) }, endDate: { $gte: dateOnly(leave.startDate) }
      }).session(session);
      if (otherOverlap) throw fail('leave_overlap', 'Another active leave request overlaps this request. Resolve the conflict before approval.');
      const dateKeys = leaveDateKeys(leave.startDate, leave.endDate);
      const recordedAttendance = await Attendance.findOne({
        store: storeId, employee: leave.employee, workDate: { $in: dateKeys },
        $or: [{ 'timeIn.at': { $exists: true } }, { 'timeOut.at': { $exists: true } }]
      }).session(session).lean();
      if (recordedAttendance) throw fail('leave_overlaps_attendance', 'This leave overlaps recorded work. Correct or review attendance before approval.');
      await claimRequestDays({ storeId, employeeId: leave.employee, leave, session });
      await invalidatePayrollInputForEmployeeDates({
        storeId, employeeId: leave.employee, startDate: leave.startDate, endDate: leave.endDate, session,
        issueCode: 'approved_leave_added_recompute',
        reason: `Approved leave ${leave._id} was added after payroll computation; recompute this draft payroll before review.`
      });
      const scheduleEntry = { startDate: leave.startDate, endDate: leave.endDate, leaveRequest: leave._id };
      const employeeUpdate = await User.updateOne({
        _id: leave.employee, store: storeId, isDeleted: { $ne: true }, isActive: { $ne: false },
        'employmentProfile.employmentStatus': { $in: [...ACTIVE_EMPLOYMENT] }
      }, { $addToSet: { 'professionalProfile.leaveSchedule': scheduleEntry } }, { session });
      if (employeeUpdate.matchedCount !== 1) throw fail('leave_employee_changed', 'Employee Store or active employment changed during approval. Refresh and retry.');
      for (const workDate of dateKeys) {
        const schedule = getScheduleForDate(employee, store, workDate);
        if (!schedule.isWorkDay) continue;
        const existing = await Attendance.findOne({ store: storeId, employee: leave.employee, workDate }).session(session);
        if (existing) {
          if (existing.leaveRequest && !sameId(existing.leaveRequest, leave._id)) throw fail('leave_attendance_conflict', `Attendance for ${workDate} is linked to another leave request.`);
          if (existing.status === 'on_leave' && !existing.leaveRequest) throw fail('leave_attendance_conflict', `Attendance for ${workDate} is already marked on leave without a reversible request link.`);
          existing.leaveOriginalStatus = existing.status;
          existing.leaveCreatedRecord = false;
          existing.status = 'on_leave';
          existing.leaveRequest = leave._id;
          await existing.save({ session });
        } else {
          await Attendance.create([{
            store: storeId, employee: leave.employee, workDate, schedule,
            status: 'on_leave', leaveRequest: leave._id, leaveCreatedRecord: true
          }], { session });
        }
      }
    } else {
      await LeaveOverlapClaim.deleteMany({ leaveRequest: leave._id }).session(session);
    }

    const updated = await LeaveRequest.findOneAndUpdate(
      { _id: leave._id, store: storeId, status: 'pending' },
      { $set: { status: decision, reviewedBy: actorId, reviewedAt: new Date(), reviewComment: String(comment || '').trim() },
        $push: { history: { action: decision, actor: actorId, comment: String(comment || '').trim() } } },
      { new: true, session, runValidators: true }
    );
    if (!updated) throw fail('leave_state_changed', 'Leave request changed during review. Refresh before retrying.');
    await writeAudit({ actorId, storeId, action: 'Leave Reviewed', details: `Leave ${leave._id} ${decision} by ${actorId}.`, session, ipAddress });
    outcome = { leave: updated, idempotent: false };
  }); } catch (error) {
    if (error.code === 11000) throw fail('leave_overlap', 'Another request claimed one or more of these dates before approval.', 409);
    throw error;
  }
  return outcome;
};

const requestLeaveCancellation = async ({ storeId, employeeId, leaveId, actorId, reason, ipAddress }) => {
  await ensureClaimIndex();
  let outcome;
  await mongoose.connection.transaction(async session => {
    const leave = await LeaveRequest.findOne({ _id: leaveId, store: storeId, employee: employeeId }).session(session);
    if (!leave) throw fail('leave_not_found', 'Leave request not found.', 404);
    if (leave.status === 'cancellation_requested') { outcome = { leave, idempotent: true }; return; }
    if (!['pending', 'approved'].includes(leave.status)) throw fail('leave_not_cancellable', 'Only pending or approved leave can be cancelled or submitted for cancellation.', 409);
    const nextStatus = leave.status === 'pending' ? 'cancelled' : 'cancellation_requested';
    const now = new Date();
    const updated = await LeaveRequest.findOneAndUpdate(
      { _id: leave._id, store: storeId, employee: employeeId, status: leave.status },
      { $set: nextStatus === 'cancelled' ? { status: nextStatus, cancelledAt: now } : { status: nextStatus, cancellationRequestedAt: now },
        $push: { history: { action: nextStatus === 'cancelled' ? 'cancelled' : 'cancellation_requested', actor: actorId, comment: String(reason || '').trim() } } },
      { new: true, session, runValidators: true }
    );
    if (!updated) throw fail('leave_state_changed', 'Leave request changed while cancellation was being submitted.');
    if (nextStatus === 'cancelled') await LeaveOverlapClaim.deleteMany({ leaveRequest: leave._id }).session(session);
    await writeAudit({ actorId, storeId, action: nextStatus === 'cancelled' ? 'Leave Cancelled' : 'Leave Cancellation Requested', details: `Leave ${leave._id} moved to ${nextStatus}.`, session, ipAddress });
    outcome = { leave: updated, idempotent: false };
  });
  return outcome;
};

const reviewLeaveCancellation = async ({ storeId, leaveId, actorId, decision, comment, ipAddress }) => {
  await ensureClaimIndex();
  if (!['cancelled', 'approved'].includes(decision)) throw fail('invalid_cancellation_decision', 'Confirm cancellation with cancelled or retain the approved leave with approved.', 400);
  let outcome;
  await mongoose.connection.transaction(async session => {
    const leave = await LeaveRequest.findOne({ _id: leaveId, store: storeId, status: 'cancellation_requested' }).session(session);
    if (!leave) throw fail('leave_cancellation_not_pending', 'Leave cancellation request is no longer pending or was not found in this Store.', 409);
    const now = new Date();
    if (decision === 'approved') {
      const retained = await LeaveRequest.findOneAndUpdate(
        { _id: leave._id, store: storeId, status: 'cancellation_requested' },
        { $set: { status: 'approved', cancellationReviewedBy: actorId, cancellationReviewedAt: now, cancellationComment: String(comment || '').trim() },
          $push: { history: { action: 'cancellation_rejected', actor: actorId, comment: String(comment || '').trim() } } },
        { new: true, session, runValidators: true }
      );
      if (!retained) throw fail('leave_state_changed', 'Leave cancellation changed during review.');
      await writeAudit({ actorId, storeId, action: 'Leave Cancellation Declined', details: `Leave ${leave._id} remains approved.`, session, ipAddress });
      outcome = { leave: retained, idempotent: false };
      return;
    }

    const finalizedPeriods = await PayrollPeriod.find({
      store: storeId, status: { $in: ['approved', 'paid'] },
      periodStart: { $lte: endOfDate(leave.endDate) }, periodEnd: { $gte: dateOnly(leave.startDate) }
    }).select('_id').session(session).lean();
    if (finalizedPeriods.length && await Payslip.exists({
      store: storeId, employee: leave.employee, payrollPeriod: { $in: finalizedPeriods.map(period => period._id) }
    }).session(session)) {
      throw fail('leave_payroll_finalized', 'Cancellation is blocked because an affected payroll was approved or paid. Use the separate authorized payroll correction process; historical payslips are unchanged.');
    }

    await invalidatePayrollInputForEmployeeDates({
      storeId, employeeId: leave.employee, startDate: leave.startDate, endDate: leave.endDate, session,
      issueCode: 'approved_leave_cancelled_recompute',
      reason: `Approved leave ${leave._id} was cancelled after computation; recompute this draft payroll before review.`
    });

    const attendanceRows = await Attendance.find({ store: storeId, employee: leave.employee, leaveRequest: leave._id }).session(session);
    for (const attendance of attendanceRows) {
      if (attendance.timeIn?.at || attendance.timeOut?.at) throw fail('leave_attendance_work_recorded', `Attendance for ${attendance.workDate} now contains work punches; correct attendance before reversing leave.`);
      if (attendance.status !== 'on_leave') throw fail('leave_attendance_changed', `Attendance for ${attendance.workDate} changed after leave approval; resolve it before cancellation.`);
      if (attendance.corrections?.length || attendance.locationReviews?.length || attendance.autoClockOutReview?.status) {
        throw fail('leave_attendance_reviewed', `Attendance for ${attendance.workDate} has correction or review history; reconcile it through authorized attendance review before reversing leave.`);
      }
      if (attendance.leaveCreatedRecord) {
        await Attendance.deleteOne({ _id: attendance._id, store: storeId, leaveRequest: leave._id }, { session });
      } else if (attendance.leaveOriginalStatus) {
        attendance.status = attendance.leaveOriginalStatus;
        attendance.leaveRequest = null;
        attendance.leaveOriginalStatus = undefined;
        attendance.leaveCreatedRecord = false;
        await attendance.save({ session });
      } else {
        throw fail('legacy_leave_attendance_ambiguous', `Attendance for ${attendance.workDate} predates reversible leave tracking. Correct it through authorized attendance review before cancellation.`);
      }
    }

    const employeeUpdate = await User.updateOne(
      { _id: leave.employee, store: storeId, isDeleted: { $ne: true } },
      { $pull: { 'professionalProfile.leaveSchedule': { leaveRequest: leave._id } } },
      { session }
    );
    if (employeeUpdate.matchedCount !== 1) throw fail('leave_employee_changed', 'Employee Store assignment changed; an authorized Store review is required before leave can be reversed.');
    const cancelled = await LeaveRequest.findOneAndUpdate(
      { _id: leave._id, store: storeId, status: 'cancellation_requested' },
      { $set: { status: 'cancelled', cancelledAt: now, cancellationReviewedBy: actorId, cancellationReviewedAt: now, cancellationComment: String(comment || '').trim() },
        $push: { history: { action: 'cancelled', actor: actorId, comment: String(comment || '').trim() } } },
      { new: true, session, runValidators: true }
    );
    if (!cancelled) throw fail('leave_state_changed', 'Leave request changed during cancellation review.');
    await LeaveOverlapClaim.deleteMany({ leaveRequest: leave._id }).session(session);
    await writeAudit({ actorId, storeId, action: 'Approved Leave Reversed', details: `Approved leave ${leave._id} was reversed after authorized cancellation; historical payroll was not changed.`, session, ipAddress });
    outcome = { leave: cancelled, idempotent: false };
  });
  return outcome;
};

module.exports = {
  ACTIVE_REQUEST_STATUSES,
  MAX_CLAIM_DAYS,
  leaveDateKeys,
  validateEmployeeForLeave,
  createLeaveRequest,
  decideLeaveRequest,
  requestLeaveCancellation,
  reviewLeaveCancellation
};
