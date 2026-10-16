const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const AttendanceCorrectionRequest = require('../models/AttendanceCorrectionRequest');
const PayrollPeriod = require('../models/PayrollPeriod');
const Store = require('../models/Store');
const User = require('../models/User');
const Notification = require('../models/Notification');
const ActivityLog = require('../models/ActivityLog');
const { calculateAttendance } = require('../utils/hrPolicy');
const { isPlatformAdmin, isStoreAdmin, normalizeRole } = require('../config/permissions');
const { activePayrollEmployeeFilter } = require('../utils/payrollEligibility');
const {
  normalizeCorrectionInput, evidenceFromFile, evidenceMetadata, temporaryEvidenceUrl
} = require('../utils/attendanceCorrection');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const id = value => String(value?._id || value || '');
const snapshot = value => JSON.parse(JSON.stringify(value || null));
const isAuthorizedReviewer = actor => isPlatformAdmin(actor) || isStoreAdmin(actor) || normalizeRole(actor) === 'manager';

const safeRequest = request => {
  const value = request?.toObject ? request.toObject() : request;
  if (!value) return value;
  return { ...value, evidence: evidenceMetadata(value.evidence) };
};

const emitNotifications = (io, notifications) => {
  if (!io) return;
  notifications.forEach(notification => {
    io.to(`user_${id(notification.recipient)}`).emit('newNotification', notification);
  });
};

const periodBoundsForWorkDate = workDate => ({
  periodStart: { $lte: new Date(`${workDate}T23:59:59.999Z`) },
  periodEnd: { $gte: new Date(`${workDate}T00:00:00.000Z`) }
});

const invalidateUnfinalizedPayroll = async ({ storeId, employeeId, workDate, attendanceId, actorId, reason, session }) => {
  const periods = await PayrollPeriod.find({ store: storeId, ...periodBoundsForWorkDate(workDate) }).session(session);
  const unfinalized = periods.filter(period => ['draft', 'computed', 'reviewed'].includes(period.status));
  const finalized = periods.filter(period => ['approved', 'paid'].includes(period.status));
  for (const period of unfinalized) {
    const wasComputed = ['computed', 'reviewed'].includes(period.status);
    period.payrollInputRevision = Number(period.payrollInputRevision || 0) + 1;
    period.status = 'draft';
    period.attendanceRecalculation = {
      required: true,
      invalidatedAt: new Date(),
      invalidatedBy: actorId,
      attendance: attendanceId,
      employee: employeeId,
      workDate,
      reason
    };
    if (wasComputed) {
      period.computedBy = undefined;
      period.computedAt = undefined;
      period.reviewedBy = undefined;
      period.reviewedAt = undefined;
    }
    await period.save({ session });
  }
  return {
    unfinalizedPeriodIds: unfinalized.map(period => period._id),
    finalizedPeriodIds: finalized.map(period => period._id),
    manualReconciliationRequired: finalized.length > 0
  };
};

const managerRecipients = async (storeId, employeeId, session) => User.find({
  store: storeId,
  _id: { $ne: employeeId },
  isActive: true,
  isDeleted: false,
  $or: [
    { role: { $in: ['admin', 'store_owner', 'manager'] } },
    { role: 'staff', staffType: 'manager' }
  ]
}).select('_id').session(session).lean();

const createTransactionalNotification = async (data, session) => {
  const [notification] = await Notification.create([data], { session });
  return notification;
};

const submitCorrectionRequest = async ({ actor, attendanceId, input, file, ipAddress, io, now = new Date() }) => {
  if (!actor?.store) throw fail('A Store assignment is required.', 403);
  if (!mongoose.isValidObjectId(attendanceId)) throw fail('Attendance record not found.', 404);
  const evidence = evidenceFromFile(file, actor._id);
  const session = await mongoose.startSession();
  const notifications = [];
  let result;
  try {
    await session.withTransaction(async () => {
      const eligibleEmployee = await User.exists({
        _id: actor._id, store: actor.store, ...activePayrollEmployeeFilter()
      }).session(session);
      if (!eligibleEmployee) throw fail('Only an active employee can request an attendance correction.', 403);
      const attendance = await Attendance.findOne({
        _id: attendanceId, store: actor.store, employee: actor._id
      }).session(session);
      if (!attendance) throw fail('Attendance record not found.', 404);
      const normalized = normalizeCorrectionInput({ body: input, attendance, now });
      const [request] = await AttendanceCorrectionRequest.create([{
        store: attendance.store,
        attendance: attendance._id,
        employee: attendance.employee,
        workDate: attendance.workDate,
        originalTimeIn: attendance.timeIn.at,
        proposedTimeOut: normalized.proposedTimeOut,
        reasonCategory: normalized.reasonCategory,
        reason: normalized.reason,
        evidence,
        submittedAt: now,
        history: [{ action: 'submitted', actor: actor._id, at: now, note: normalized.reason }]
      }], { session });
      const reviewers = await managerRecipients(attendance.store, actor._id, session);
      for (const reviewer of reviewers) {
        notifications.push(await createTransactionalNotification({
          recipient: reviewer._id,
          sender: actor._id,
          type: 'attendance_update',
          title: 'Attendance correction requested',
          message: `${actor.firstName || 'An employee'} requested a clock-out correction for ${attendance.workDate}.`,
          relatedId: request._id,
          relatedModel: 'AttendanceCorrectionRequest',
          targetUrl: '/admin/hr?tab=attendance',
          dedupeKey: `attendance-correction:${request._id}:submitted:${reviewer._id}`
        }, session));
      }
      await ActivityLog.create([{
        user: actor._id,
        action: 'Attendance Correction Requested',
        details: `Employee ${actor._id} requested a clock-out correction for attendance ${attendance._id}.`,
        store: attendance.store,
        subject: actor._id,
        category: 'attendance',
        changes: {
          before: { timeIn: attendance.timeIn.at, timeOut: attendance.timeOut?.at || null },
          after: { proposedTimeOut: normalized.proposedTimeOut, requestStatus: 'pending', evidenceReference: evidence.publicId },
          effectiveDate: normalized.proposedTimeOut,
          reason: normalized.reason
        },
        ipAddress
      }], { session });
      result = request;
    });
  } catch (error) {
    if (error.code === 11000) throw fail('A correction request is already pending for this attendance session.', 409);
    throw error;
  } finally {
    await session.endSession();
  }
  emitNotifications(io, notifications);
  return safeRequest(result);
};

const listOwnRequests = async actor => {
  const records = await AttendanceCorrectionRequest.find({ store: actor.store, employee: actor._id })
    .populate('reviewedBy', 'firstName lastName').sort({ submittedAt: -1 }).lean();
  return records.map(safeRequest);
};

const listStoreRequests = async ({ storeId, status }) => {
  const query = { store: storeId };
  if (status) query.status = status;
  const records = await AttendanceCorrectionRequest.find(query)
    .populate('employee', 'firstName lastName role staffType')
    .populate('attendance')
    .populate('reviewedBy', 'firstName lastName')
    .sort({ status: 1, submittedAt: -1 }).lean();
  return records.map(safeRequest);
};

const reviewCorrectionRequest = async ({ actor, storeId, requestId, action, reviewerNote, ipAddress, io, now = new Date() }) => {
  if (!isAuthorizedReviewer(actor)) throw fail('Only an authorized Store manager or owner may review attendance corrections.', 403);
  if (!['approve', 'reject'].includes(action)) throw fail('Choose Approve or Reject.');
  const note = String(reviewerNote || '').trim();
  if (note.length < 5) throw fail(action === 'reject' ? 'A meaningful rejection reason is required.' : 'A review note of at least 5 characters is required.');
  const session = await mongoose.startSession();
  const notifications = [];
  let result;
  try {
    await session.withTransaction(async () => {
      const request = await AttendanceCorrectionRequest.findOne({ _id: requestId, store: storeId, status: 'pending' }).session(session);
      if (!request) throw fail('Pending attendance correction request not found.', 409);
      if (id(request.employee) === id(actor._id) && !isPlatformAdmin(actor)) throw fail('You cannot review your own attendance correction request.', 403);
      const attendance = await Attendance.findOne({ _id: request.attendance, store: storeId, employee: request.employee }).session(session);
      if (!attendance) throw fail('Original attendance record not found.', 404);
      let payrollImpact = { unfinalizedPeriodIds: [], finalizedPeriodIds: [], manualReconciliationRequired: false };
      if (action === 'approve') {
        if (!attendance.timeIn?.at || attendance.timeOut?.at) throw fail('Attendance no longer requires this correction.', 409);
        const store = await Store.findById(storeId).session(session);
        const computed = calculateAttendance({
          timeIn: attendance.timeIn.at,
          timeOut: request.proposedTimeOut,
          schedule: attendance.schedule,
          graceMinutes: store?.hrSettings?.gracePeriodMinutes,
          overtimeEnabled: store?.hrSettings?.overtime?.enabled
        });
        const priorVersion = attendance.__v;
        const updated = await Attendance.findOneAndUpdate(
          { _id: attendance._id, store: storeId, employee: request.employee, __v: priorVersion, 'timeOut.at': { $exists: false } },
          {
            $set: {
              timeOut: { at: request.proposedTimeOut, validationStatus: 'employee_correction', userAgent: 'Approved attendance correction' },
              ...computed
            },
            $push: { corrections: { field: 'timeOut.at', originalValue: null, correctedValue: request.proposedTimeOut, reason: request.reason, changedBy: actor._id, changedAt: now } },
            $inc: { __v: 1 }
          },
          { new: true, runValidators: true, session }
        );
        if (!updated) throw fail('Attendance changed while the request was being reviewed. Reload and try again.', 409);
        payrollImpact = await invalidateUnfinalizedPayroll({
          storeId, employeeId: request.employee, workDate: request.workDate,
          attendanceId: attendance._id, actorId: actor._id,
          reason: 'Approved employee clock-out correction.', session
        });
      }
      const status = action === 'approve' ? 'approved' : 'rejected';
      const updatedRequest = await AttendanceCorrectionRequest.findOneAndUpdate(
        { _id: request._id, store: storeId, status: 'pending', __v: request.__v },
        {
          $set: {
            status, reviewedBy: actor._id, reviewedAt: now,
            ...(status === 'approved' ? { approvedTimeOut: request.proposedTimeOut, payrollImpact } : { rejectionReason: note })
          },
          $push: { history: { action: status, actor: actor._id, at: now, note } },
          $inc: { __v: 1 }
        },
        { new: true, runValidators: true, session }
      );
      if (!updatedRequest) throw fail('This request was already reviewed.', 409);
      notifications.push(await createTransactionalNotification({
        recipient: request.employee,
        sender: actor._id,
        type: 'attendance_update',
        title: `Attendance correction ${status}`,
        message: status === 'approved'
          ? `Your ${request.workDate} clock-out correction was approved.${payrollImpact.manualReconciliationRequired ? ' A finalized payroll requires separate reconciliation.' : ''}`
          : `Your ${request.workDate} clock-out correction was rejected: ${note}`,
        relatedId: request._id,
        relatedModel: 'AttendanceCorrectionRequest',
        targetUrl: '/staff/attendance',
        dedupeKey: `attendance-correction:${request._id}:${status}`
      }, session));
      await ActivityLog.create([{
        user: actor._id,
        action: `Attendance Correction ${status === 'approved' ? 'Approved' : 'Rejected'}`,
        details: `Attendance correction ${request._id} was ${status}.`,
        store: storeId,
        subject: request.employee,
        category: 'attendance',
        changes: {
          before: { attendanceTimeOut: null, requestStatus: 'pending' },
          after: { attendanceTimeOut: status === 'approved' ? request.proposedTimeOut : null, requestStatus: status, payrollImpact },
          effectiveDate: request.proposedTimeOut,
          reason: note
        },
        ipAddress
      }], { session });
      result = updatedRequest;
    });
  } finally {
    await session.endSession();
  }
  emitNotifications(io, notifications);
  return safeRequest(result);
};

const directCorrectAttendance = async ({ actor, storeId, attendanceId, input, ipAddress, io, now = new Date() }) => {
  if (!isAuthorizedReviewer(actor)) throw fail('Only an authorized Store manager or owner may correct attendance.', 403);
  const reason = String(input.reason || '').trim();
  if (reason.length < 5) throw fail('A correction reason of at least 5 characters is required.');
  if (input.confirmed !== true) throw fail('Confirm the before and after attendance values before saving.');
  const session = await mongoose.startSession();
  const notifications = [];
  let result;
  try {
    await session.withTransaction(async () => {
      const attendance = await Attendance.findOne({ _id: attendanceId, store: storeId }).session(session);
      if (!attendance) throw fail('Attendance record not found.', 404);
      if (id(attendance.employee) === id(actor._id) && !isPlatformAdmin(actor)) throw fail('You cannot directly correct your own attendance.', 403);
      const expectedVersion = Number(input.expectedVersion);
      if (!Number.isInteger(expectedVersion) || expectedVersion !== attendance.__v) throw fail('Attendance changed after it was loaded. Reload before applying a correction.', 409);
      const before = snapshot({ timeIn: attendance.timeIn, timeOut: attendance.timeOut, status: attendance.status, workedMinutes: attendance.workedMinutes, lateMinutes: attendance.lateMinutes, undertimeMinutes: attendance.undertimeMinutes, overtimeMinutes: attendance.overtimeMinutes });
      const nextTimeIn = input.timeIn === undefined ? attendance.timeIn?.at : new Date(input.timeIn);
      const nextTimeOut = input.timeOut === undefined
        ? attendance.timeOut?.at
        : (input.timeOut === null || input.timeOut === '' ? null : new Date(input.timeOut));
      if (!nextTimeIn || Number.isNaN(new Date(nextTimeIn).getTime())) throw fail('A valid clock-in time is required.');
      if (nextTimeOut && Number.isNaN(new Date(nextTimeOut).getTime())) throw fail('Enter a valid clock-out time.');
      if (nextTimeOut && new Date(nextTimeOut) <= new Date(nextTimeIn)) throw fail('Clock-out must be after clock-in.');
      if (new Date(nextTimeIn) > now || (nextTimeOut && new Date(nextTimeOut) > now)) throw fail('Attendance timestamps cannot be in the future.');
      const allowedStatuses = ['present', 'late', 'undertime', 'incomplete'];
      if (input.status !== undefined && !allowedStatuses.includes(input.status)) throw fail('Select a valid attendance status.');
      const store = await Store.findById(storeId).session(session);
      const computed = nextTimeOut ? calculateAttendance({
        timeIn: new Date(nextTimeIn), timeOut: new Date(nextTimeOut), schedule: attendance.schedule,
        graceMinutes: store?.hrSettings?.gracePeriodMinutes, overtimeEnabled: store?.hrSettings?.overtime?.enabled
      }) : { status: 'incomplete', workedMinutes: 0, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 0 };
      if (input.status !== undefined) computed.status = input.status;
      if (!nextTimeOut && computed.status !== 'incomplete') throw fail('Attendance without a clock-out must remain incomplete.');
      const after = {
        timeIn: { ...(attendance.timeIn?.toObject?.() || attendance.timeIn || {}), at: new Date(nextTimeIn), validationStatus: 'manager_corrected', userAgent: 'Authorized attendance correction' },
        timeOut: nextTimeOut ? { ...(attendance.timeOut?.toObject?.() || attendance.timeOut || {}), at: new Date(nextTimeOut), validationStatus: 'manager_corrected', userAgent: 'Authorized attendance correction' } : undefined,
        ...computed
      };
      const update = {
        $set: { timeIn: after.timeIn, ...computed },
        $push: { corrections: { field: 'attendance', originalValue: before, correctedValue: after, reason, changedBy: actor._id, changedAt: now } },
        $addToSet: { suspiciousReasons: 'Manual attendance correction' },
        $inc: { __v: 1 }
      };
      if (after.timeOut) update.$set.timeOut = after.timeOut;
      else update.$unset = { timeOut: 1 };
      if (attendance.autoClockOutReview?.status && after.timeOut) {
        update.$set['autoClockOutReview.status'] = 'corrected';
        update.$set['autoClockOutReview.reviewedBy'] = actor._id;
        update.$set['autoClockOutReview.reviewedAt'] = now;
        update.$set['autoClockOutReview.reviewerNote'] = reason;
      }
      const updated = await Attendance.findOneAndUpdate(
        { _id: attendance._id, store: storeId, __v: expectedVersion }, update,
        { new: true, runValidators: true, session }
      );
      if (!updated) throw fail('Attendance changed while it was being corrected. Reload and try again.', 409);
      const payrollImpact = await invalidateUnfinalizedPayroll({
        storeId, employeeId: attendance.employee, workDate: attendance.workDate,
        attendanceId: attendance._id, actorId: actor._id, reason, session
      });
      const pendingRequest = await AttendanceCorrectionRequest.findOne({
        attendance: attendance._id, store: storeId, status: 'pending'
      }).session(session);
      if (pendingRequest) {
        const supersededNote = `Attendance was resolved through an authorized direct correction: ${reason}`;
        const resolved = await AttendanceCorrectionRequest.findOneAndUpdate(
          { _id: pendingRequest._id, status: 'pending', __v: pendingRequest.__v },
          {
            $set: { status: 'rejected', reviewedBy: actor._id, reviewedAt: now, rejectionReason: supersededNote },
            $push: { history: { action: 'rejected', actor: actor._id, at: now, note: supersededNote } },
            $inc: { __v: 1 }
          },
          { session, new: true, runValidators: true }
        );
        if (!resolved) throw fail('The pending correction request changed. Reload before correcting attendance.', 409);
      }
      notifications.push(await createTransactionalNotification({
        recipient: attendance.employee,
        sender: actor._id,
        type: 'attendance_update',
        title: 'Attendance corrected by manager',
        message: `Your ${attendance.workDate} attendance was corrected: ${reason}${payrollImpact.manualReconciliationRequired ? ' A finalized payroll requires separate reconciliation.' : ''}`,
        relatedId: attendance._id,
        relatedModel: 'Attendance',
        targetUrl: '/staff/attendance',
        dedupeKey: `attendance-direct-correction:${attendance._id}:${updated.__v}`
      }, session));
      await ActivityLog.create([{
        user: actor._id,
        action: 'Attendance Corrected',
        details: `Attendance ${attendance._id} was directly corrected by ${actor._id}.`,
        store: storeId,
        subject: attendance.employee,
        category: 'attendance',
        changes: { before, after: snapshot(updated), effectiveDate: nextTimeOut || nextTimeIn, reason },
        ipAddress
      }], { session });
      result = { attendance: updated, payrollImpact };
    });
  } finally {
    await session.endSession();
  }
  emitNotifications(io, notifications);
  return result;
};

const getEvidenceAccess = async ({ actor, storeId, requestId, cloudinary, now }) => {
  const request = await AttendanceCorrectionRequest.findById(requestId);
  if (!request) throw fail('Attendance correction request not found.', 404);
  const self = id(request.employee) === id(actor._id);
  const reviewer = id(request.store) === id(storeId) && isAuthorizedReviewer(actor);
  if (!self && !reviewer && !isPlatformAdmin(actor)) throw fail('You cannot access this evidence.', 403);
  return temporaryEvidenceUrl({ cloudinary, evidence: request.evidence, now });
};

module.exports = {
  safeRequest,
  invalidateUnfinalizedPayroll,
  submitCorrectionRequest,
  listOwnRequests,
  listStoreRequests,
  reviewCorrectionRequest,
  directCorrectAttendance,
  getEvidenceAccess
};
