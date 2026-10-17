const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const PayrollPeriod = require('../models/PayrollPeriod');
const Payslip = require('../models/Payslip');
const GovernmentRemittance = require('../models/GovernmentRemittance');
const RiderEarning = require('../models/RiderEarning');
const Store = require('../models/Store');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const resolveStore = require('../utils/resolveStore');
const { createNotification } = require('./notificationController');
const { hasPermission, isOperationalStaff, isStoreAdmin, isPlatformAdmin, normalizeRole } = require('../config/permissions');
const {
  isValidCoordinates, distanceMeters, dateKeyInTimezone, getScheduleForDate,
  getTimeInWindow, calculateAttendance, generatePayrollPeriod, computePay, roundMoney, addDays
} = require('../utils/hrPolicy');
const {
  PAYROLL_EMPLOYMENT_STATUSES, activePayrollEmployeeFilter, employeeName,
  payrollEligibility, payrollEmployeeQuery, payrollRosterFilter
} = require('../utils/payrollEligibility');
const {
  COMPENSATION_BASES, compensationBasis, compensationRevisions,
  compensationSegmentsForPeriod, compensationTypeForBasis, currentCompensationSummary
} = require('../utils/payrollCompensation');
const {
  confirmPaymentAttempt, createPaymentAttempt, findPaymentObligations,
  findEmployeePaymentStatuses, getProtectedProof, retryFailedAttempt, transitionPaymentAttempt
} = require('../services/payrollPaymentWorkflowService');
const { computePayrollPeriodAtomically } = require('../services/payrollComputationService');
const { leaveBalances, scheduledDays } = require('../services/leaveBalanceService');
const { calculateStatutoryPayroll, payPeriodsPerMonth, validatePhilippinePayrollConfig } = require('../utils/philippinePayroll');
const { deterministicRemittanceId } = require('../utils/governmentRemittance');
const activeStaffFilter = activePayrollEmployeeFilter;
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const safeError = (res, error) => {
  const status = error.statusCode || (error.name === 'ValidationError' ? 400 : 500);
  if (status === 500) console.error('[HR]', error);
  return res.status(status).json({ message: status === 500 ? 'Unable to complete the HR request. Please try again.' : error.message });
};
const parseDate = value => {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
  const date = new Date(`${text}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw fail('Enter a valid date.');
  return date;
};
const dateEnd = value => new Date(parseDate(value).getTime() + 86399999);
const storeFor = async req => {
  const id = await resolveStore(req);
  if (!id) throw fail('A Store assignment is required.', 403);
  const store = await Store.findById(id);
  if (!store) throw fail('Store not found.', 404);
  return store;
};
const employeeFor = async (storeId, employeeId, compensation = false) => {
  if (!mongoose.isValidObjectId(employeeId)) throw fail('Employee not found.', 404);
  const eligibilityFilter = compensation ? payrollRosterFilter() : activeStaffFilter();
  let query = User.findOne({ _id: employeeId, store: storeId, ...eligibilityFilter });
  if (compensation) query = query.select('+employmentProfile.compensation +employmentProfile.compensationHistory +employmentProfile.employmentHistory');
  const employee = await query;
  if (!employee) throw fail('Employee not found in this Store.', 404);
  return employee;
};
const audit = (req, action, details, metadata = {}) => ActivityLog.create({ user: req.user._id, action, details, ipAddress: req.ip, ...metadata });
const notify = (req, recipient, type, title, message, relatedId, relatedModel, targetUrl) => createNotification({
  recipient, sender: req.user._id, type, title, message, relatedId, relatedModel, targetUrl
}, req.app.get('socketio'));
const notifyStoreRoles = async (req, storeId, roles, staffTypes, type, title, message, relatedId, relatedModel, targetUrl) => {
  const recipients = await User.find({ store: storeId, isActive: true, isDeleted: false, $or: [
    { role: { $in: roles } }, { role: 'staff', staffType: { $in: staffTypes } }
  ] }).select('_id').lean();
  await Promise.all(recipients.filter(item => String(item._id) !== String(req.user._id)).map(item => notify(req, item._id, type, title, message, relatedId, relatedModel, targetUrl)));
};
const snapshot = value => JSON.parse(JSON.stringify(value || {}));
const recalculatePayslipTotals = ({ payslip, period, actorId }) => {
  const additions = payslip.additions.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  payslip.grossPay = roundMoney(payslip.basePay + additions);
  const monthlyCompensation = Number(payslip.statutoryBreakdown?.monthlyCompensation)
    || (payslip.employeeSnapshot?.compensationBasis === 'monthly'
      ? Number(payslip.employeeSnapshot?.baseRate || 0)
      : roundMoney(payslip.grossPay * payPeriodsPerMonth(period.frequency)));
  const statutory = calculateStatutoryPayroll({ grossPay: payslip.grossPay, monthlyCompensation, frequency: period.frequency, configured: period.policySnapshot?.statutoryContributions });
  payslip.deductions = payslip.deductions.filter(item => item.source !== 'statutory');
  if (statutory.enabled) {
    for (const [type, amount] of [['SSS', statutory.employeeDeductions.sss], ['PhilHealth', statutory.employeeDeductions.philHealth], ['Pag-IBIG', statutory.employeeDeductions.pagIbig], ['Withholding Tax', statutory.employeeDeductions.withholdingTax]]) {
      if (amount > 0) payslip.deductions.push({ type, amount, reason: `Computed using ${statutory.policy.version}; see the itemized statutory breakdown.`, source: 'statutory', createdBy: actorId });
    }
  }
  payslip.taxableCompensation = statutory.taxableCompensation;
  payslip.statutoryDeductions = statutory.employeeDeductions;
  payslip.employerContributions = statutory.employerContributions;
  payslip.statutoryBreakdown = { monthlyCompensation, ...statutory.breakdown };
  payslip.statutoryPolicySnapshot = statutory.policy;
  payslip.totalDeductions = roundMoney(payslip.deductions.reduce((sum, item) => sum + Number(item.amount || 0), 0));
  payslip.netPay = roundMoney(Math.max(0, payslip.grossPay - payslip.totalDeductions));
};

const getSettings = async (req, res) => {
  try {
    const store = await storeFor(req);
    res.json({ settings: store.hrSettings, workplace: { address: store.contactInfo?.address, coordinates: store.contactInfo?.address?.coordinates } });
  } catch (error) { safeError(res, error); }
};

const updateSettings = async (req, res) => {
  try {
    const store = await storeFor(req);
    const shift = req.body.defaultShift;
    if (shift && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(shift.start || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(shift.end || '') || shift.start === shift.end)) {
      throw fail('Default shift must contain different valid start and end times. Overnight shifts are supported.');
    }
    if (req.body.leaveTypes) {
      const keys = req.body.leaveTypes.map(type => String(type.key || '').trim().toLowerCase());
      if (keys.some(key => !key) || new Set(keys).size !== keys.length) throw fail('Leave types must have unique non-empty keys.');
      for (const type of req.body.leaveTypes) {
        if (type.annualCredits !== null && type.annualCredits !== undefined && (!Number.isFinite(Number(type.annualCredits)) || Number(type.annualCredits) < 0)) throw fail('Annual leave credits must be zero or a positive number.');
        if (!Number.isFinite(Number(type.carryOverLimit || 0)) || Number(type.carryOverLimit || 0) < 0) throw fail('Leave carry-over limits cannot be negative.');
      }
    }
    if (req.body.statutoryContributions) req.body.statutoryContributions = validatePhilippinePayrollConfig(req.body.statutoryContributions);
    if (req.body.timeInWindow) {
      for (const key of ['earlyMinutes', 'lateMinutes']) {
        const value = Number(req.body.timeInWindow[key]);
        if (!Number.isFinite(value) || value < 0 || value > 720) throw fail('Time-in window values must be between 0 and 720 minutes.');
      }
    }
    const editable = ['payrollFrequency', 'weekly', 'semiMonthly', 'monthly', 'defaultWorkDays', 'defaultShift', 'gracePeriodMinutes', 'timeInWindow', 'lateDeductionEnabled', 'undertimeDeductionEnabled', 'overtime', 'attendanceRadiusMeters', 'maximumLocationAccuracyMeters', 'outsideGeofencePolicy', 'payrollApprovalRequired', 'leaveTypes', 'statutoryContributions'];
    editable.forEach(key => { if (req.body[key] !== undefined) store.hrSettings[key] = req.body[key]; });
    store.hrSettings.updatedAt = new Date(); store.hrSettings.updatedBy = req.user._id;
    await store.save();
    await audit(req, 'HR Settings Updated', `Payroll and attendance settings updated for Store ${store._id}.`);
    res.json({ message: 'Payroll and attendance settings saved.', settings: store.hrSettings });
  } catch (error) { safeError(res, error); }
};

const listEmployees = async (req, res) => {
  try {
    const store = await storeFor(req);
    const records = await User.find(payrollEmployeeQuery(store._id, { includeInactive: true }))
      .select('firstName lastName role staffType isActive staffStatus professionalProfile.staffId riderProfile.staffId employmentProfile.staffId employmentProfile.position employmentProfile.department employmentProfile.employmentStatus employmentProfile.dateHired employmentProfile.employmentEndDate employmentProfile.branchName employmentProfile.statutoryIdentifiers employmentProfile.payrollDestination +employmentProfile.compensation +employmentProfile.compensationHistory +employmentProfile.employmentHistory')
      .sort({ firstName: 1 }).lean();
    const employees = records.map(employee => ({
      _id: employee._id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      role: employee.role,
      staffType: employee.staffType,
      isActive: employee.isActive,
      staffStatus: employee.staffStatus,
      professionalProfile: employee.professionalProfile,
      riderProfile: employee.riderProfile,
      employmentProfile: {
        staffId: employee.employmentProfile?.staffId,
        position: employee.employmentProfile?.position,
        department: employee.employmentProfile?.department,
        employmentStatus: employee.employmentProfile?.employmentStatus,
        dateHired: employee.employmentProfile?.dateHired,
        employmentEndDate: employee.employmentProfile?.employmentEndDate,
        branchName: employee.employmentProfile?.branchName,
        statutoryIdentifiers: employee.employmentProfile?.statutoryIdentifiers,
        payrollDestination: employee.employmentProfile?.payrollDestination
      },
      compensationSummary: currentCompensationSummary(employee.employmentProfile),
      payrollEligibility: payrollEligibility(employee)
    }));
    res.json({ employees });
  } catch (error) { safeError(res, error); }
};

const getCompensation = async (req, res) => {
  try {
    const store = await storeFor(req);
    const employee = await employeeFor(store._id, req.params.employeeId, true);
    const profile = employee.employmentProfile?.toObject ? employee.employmentProfile.toObject() : snapshot(employee.employmentProfile);
    if (profile?.compensation) profile.compensation.compensationBasis = compensationBasis(profile.compensation);
    res.json({ employee: { _id: employee._id, firstName: employee.firstName, lastName: employee.lastName, staffType: employee.staffType || employee.role, employmentProfile: profile } });
  } catch (error) { safeError(res, error); }
};

const updateCompensation = async (req, res) => {
  try {
    const store = await storeFor(req);
    const employee = await employeeFor(store._id, req.params.employeeId, true);
    if (normalizeRole(req.user) === 'finance_staff' && String(employee._id) === String(req.user._id)) {
      throw fail('Finance staff cannot change their own employment or compensation record.', 403);
    }
    const identityEligibility = payrollEligibility(employee, new Date('9999-12-31T23:59:59.999Z'));
    if (['role_retired', 'not_store_staff'].includes(identityEligibility.code)) {
      throw fail(identityEligibility.message, 409);
    }
    const input = req.body || {};
    const reason = String(input.changeReason || 'Authorized employment and compensation update.').trim();
    if (reason.length < 5) throw fail('Provide a clear reason for the employment or compensation change.');
    const before = snapshot(employee.employmentProfile);
    if (input.employmentStatus !== undefined && !PAYROLL_EMPLOYMENT_STATUSES.has(input.employmentStatus)
      && !['inactive', 'terminated'].includes(input.employmentStatus)) {
      throw fail('Select a valid employment status.');
    }
    const nextStart = input.dateHired !== undefined ? parseDate(input.dateHired) : employee.employmentProfile?.dateHired;
    const nextEnd = input.employmentEndDate ? parseDate(input.employmentEndDate) : input.employmentEndDate === '' ? null : employee.employmentProfile?.employmentEndDate;
    const nextStatus = input.employmentStatus ?? employee.employmentProfile?.employmentStatus ?? 'active';
    if (nextEnd && nextStart && nextEnd < nextStart) throw fail('Employment end date cannot be before the employment start date.');
    if (['inactive', 'terminated'].includes(nextStatus) && !nextEnd) throw fail('An employment end date is required for inactive or terminated employment.');
    const lifecycleChanged = ['employmentStatus', 'dateHired', 'employmentEndDate'].some(key => input[key] !== undefined);
    if (lifecycleChanged && employee.employmentProfile?.dateHired) {
      const history = employee.employmentProfile.employmentHistory || [];
      const priorStatus = employee.employmentProfile.employmentStatus || 'active';
      const closingEnd = nextEnd || employee.employmentProfile.employmentEndDate;
      if ((PAYROLL_EMPLOYMENT_STATUSES.has(priorStatus) && closingEnd) || employee.employmentProfile.employmentEndDate) {
        history.push({
          employmentStatus: PAYROLL_EMPLOYMENT_STATUSES.has(priorStatus) ? priorStatus : 'active',
          startDate: employee.employmentProfile.dateHired,
          endDate: closingEnd || employee.employmentProfile.employmentEndDate,
          recordedBy: req.user._id,
          recordedAt: new Date(),
          reason
        });
        employee.set('employmentProfile.employmentHistory', history);
      }
    }
    ['staffId', 'employmentStatus', 'branchName'].forEach(key => { if (input[key] !== undefined) employee.set(`employmentProfile.${key}`, input[key]); });
    if (input.dateHired !== undefined) employee.set('employmentProfile.dateHired', nextStart);
    if (input.employmentEndDate !== undefined) employee.set('employmentProfile.employmentEndDate', nextEnd);
    if (input.compensation) {
      const basis = input.compensation.compensationBasis;
      const baseRate = Number(input.compensation.baseRate);
      if (!COMPENSATION_BASES.has(basis)) throw fail('Select an explicit monthly, daily, hourly, or legacy per-period compensation basis.');
      if (!Number.isFinite(baseRate) || baseRate <= 0) throw fail('Enter a positive compensation rate.');
      if (!input.compensation.effectiveDate) throw fail('An effective date is required for every compensation revision.');
      const effectiveDate = parseDate(input.compensation.effectiveDate);
      const incomingRevision = {
        compensationType: compensationTypeForBasis(basis),
        compensationBasis: basis,
        baseRate,
        effectiveDate,
        recordedBy: req.user._id,
        recordedAt: new Date(),
        reason
      };
      const revisionsByDate = new Map(compensationRevisions(employee.employmentProfile)
        .map(revision => [revision.effectiveDate.toISOString().slice(0, 10), revision]));
      revisionsByDate.set(effectiveDate.toISOString().slice(0, 10), incomingRevision);
      const orderedRevisions = [...revisionsByDate.values()]
        .sort((left, right) => new Date(left.effectiveDate) - new Date(right.effectiveDate));
      const current = orderedRevisions.pop();
      employee.set('employmentProfile.compensationHistory', orderedRevisions);
      employee.set('employmentProfile.compensation', current);
    }
    await employee.save();
    await audit(req, 'Compensation Updated', `Employment or compensation profile updated for employee ${employee._id} in Store ${store._id}.`, {
      store: store._id,
      subject: employee._id,
      category: input.compensation ? 'compensation' : 'employment',
      changes: {
        before,
        after: snapshot(employee.employmentProfile),
        effectiveDate: input.compensation?.effectiveDate || input.employmentEndDate || input.dateHired,
        reason
      }
    });
    res.json({ message: 'Employee compensation saved.', employee: { _id: employee._id, employmentProfile: employee.employmentProfile } });
  } catch (error) { safeError(res, error); }
};

const validateLocation = (body, store) => {
  const lat = Number(body.latitude); const lng = Number(body.longitude);
  const accuracy = body.accuracy === undefined ? null : Number(body.accuracy);
  const workplace = store.contactInfo?.address?.coordinates;
  if (!isValidCoordinates(lat, lng)) throw fail('We could not verify your location. Enable location access and try again.');
  if (!isValidCoordinates(workplace?.lat, workplace?.lng)) throw fail('Workplace location is not configured. Ask your Store Owner to add map coordinates.');
  if (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0)) throw fail('Location accuracy is invalid.');
  const distance = distanceMeters({ lat, lng }, workplace);
  const reasons = [];
  if (accuracy !== null && accuracy > Number(store.hrSettings?.maximumLocationAccuracyMeters || 200)) reasons.push('GPS accuracy is too low');
  if (distance > Number(store.hrSettings?.attendanceRadiusMeters || 100)) reasons.push('Outside workplace geofence');
  const validationStatus = distance > Number(store.hrSettings?.attendanceRadiusMeters || 100) ? 'outside_geofence' : reasons.length ? 'poor_accuracy' : 'valid';
  if (reasons.length && store.hrSettings?.outsideGeofencePolicy !== 'flag') {
    throw fail(validationStatus === 'outside_geofence' ? `You are outside the workplace attendance area (${Math.round(distance)} m away).` : 'Location accuracy is too low. Move to an open area and try again.');
  }
  return { lat, lng, accuracy, distance, reasons, validationStatus };
};
const point = (req, location, now) => ({
  at: now, coordinates: { lat: location.lat, lng: location.lng }, accuracyMeters: location.accuracy,
  distanceMeters: location.distance, validationStatus: location.validationStatus,
  userAgent: req.get('user-agent') || '', ipAddress: req.ip
});
const locationReview = (body, location, punchType) => {
  if (!location.reasons.length) return null;
  const employeeReason = String(body.offsiteReason || '').trim();
  if (employeeReason.length < 5) throw fail('Explain why this attendance punch is outside the normal workplace check.');
  return { punchType, status: 'pending', employeeReason, evidenceReasons: location.reasons };
};
const projectAttendanceForViewer = (row, canReview) => {
  if (canReview || row.isDerived) return row;
  const safePoint = value => value?.at ? { at: value.at, validationStatus: value.validationStatus } : value;
  return {
    ...row,
    timeIn: safePoint(row.timeIn),
    timeOut: safePoint(row.timeOut),
    suspiciousReasons: [],
    locationReviews: (row.locationReviews || []).map(review => ({
      _id: review._id,
      punchType: review.punchType,
      status: review.status,
      reviewedAt: review.reviewedAt
    })),
    locationReview: row.locationReview?.reviewedAt ? { reviewedAt: row.locationReview.reviewedAt } : undefined,
    autoClockOutReview: row.autoClockOutReview?.status ? {
      status: row.autoClockOutReview.status,
      generatedAt: row.autoClockOutReview.generatedAt,
      maximumShiftMinutes: row.autoClockOutReview.maximumShiftMinutes
    } : undefined
  };
};
const resolveTimeInEligibility = (employee, store, now = new Date()) => {
  const today = dateKeyInTimezone(now, store.hrSettings?.timezone);
  const yesterday = dateKeyInTimezone(addDays(now, -1), store.hrSettings?.timezone);
  const candidates = [today, yesterday].map(workDate => {
    const schedule = getScheduleForDate(employee, store, workDate);
    return { workDate, schedule, window: getTimeInWindow({ dateKey: workDate, schedule, settings: store.hrSettings, now }) };
  });
  return candidates.find(candidate => candidate.window.allowed) || candidates[0];
};
const addDerivedAbsences = (records, employees, store, from, to) => {
  const rows = records.map(row => row.toObject ? row.toObject() : row);
  const seen = new Set(rows.map(row => `${row.employee?._id || row.employee}:${row.workDate}`));
  const today = dateKeyInTimezone(new Date(), store.hrSettings?.timezone);
  dateLoop(from, to, day => {
    const workDate = day.toISOString().slice(0, 10);
    if (workDate >= today) return;
    employees.forEach(employee => {
      const key = `${employee._id}:${workDate}`;
      if (seen.has(key)) return;
      const schedule = getScheduleForDate(employee, store, workDate);
      const legacyLeave = (employee.professionalProfile?.leaveSchedule || []).some(item => !item.leaveRequest && new Date(item.startDate) <= new Date(`${workDate}T23:59:59Z`) && new Date(item.endDate) >= new Date(`${workDate}T00:00:00Z`));
      if (schedule.isWorkDay) rows.push({ _id: `derived-${key}`, employee, workDate, schedule, status: legacyLeave ? 'incomplete' : 'absent', workedMinutes: 0, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 0, locationFlagged: false, isDerived: true, suspiciousReasons: legacyLeave ? ['Legacy leave needs paid/unpaid classification'] : [] });
    });
  });
  return rows.sort((a, b) => b.workDate.localeCompare(a.workDate));
};

const timeIn = async (req, res) => {
  try {
    if (!isOperationalStaff(req.user) || !req.user.store) throw fail('Attendance is available only to assigned Store employees.', 403);
    const store = await storeFor(req); const employee = await employeeFor(store._id, req.user._id);
    const now = new Date();
    const eligibility = resolveTimeInEligibility(employee, store, now);
    const { workDate } = eligibility;
    if (!eligibility.window.allowed) throw fail(eligibility.window.message, 409);
    if (await Attendance.exists({ store: store._id, employee: req.user._id, workDate, 'timeIn.at': { $exists: true } })) throw fail('You have already timed in today.', 409);
    if (await LeaveRequest.exists({ store: store._id, employee: req.user._id, status: 'approved', startDate: { $lte: dateEnd(workDate) }, endDate: { $gte: parseDate(workDate) } })) throw fail('You are on approved leave today. Attendance is not required.', 409);
    const location = validateLocation(req.body, store);
    const review = locationReview(req.body, location, 'time_in');
    const update = {
      $setOnInsert: { schedule: eligibility.schedule },
      $set: { timeIn: point(req, location, now), status: 'incomplete', locationFlagged: Boolean(review) },
      $addToSet: { suspiciousReasons: { $each: location.reasons } }
    };
    if (review) update.$push = { locationReviews: review };
    const record = await Attendance.findOneAndUpdate(
      { store: store._id, employee: req.user._id, workDate, 'timeIn.at': { $exists: false } },
      update,
      { upsert: true, new: true, runValidators: true }
    );
    await audit(req, 'Attendance Time In', `Employee ${req.user._id} timed in for ${workDate}; server time recorded.`);
    if (location.reasons.length) await notifyStoreRoles(req, store._id, ['admin', 'store_owner', 'manager'], ['manager'], 'attendance_update', 'Attendance exception', `${req.user.firstName || 'An employee'} recorded flagged attendance for ${workDate}.`, record._id, 'Attendance', '/admin/hr?tab=attendance');
    res.status(201).json({ message: location.reasons.length ? 'Time in recorded and flagged for review.' : 'Time in recorded.', attendance: record });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'You have already timed in today.' });
    safeError(res, error);
  }
};

const timeOut = async (req, res) => {
  try {
    if (!isOperationalStaff(req.user) || !req.user.store) throw fail('Attendance is available only to assigned Store employees.', 403);
    const store = await storeFor(req); const now = new Date();
    const location = validateLocation(req.body, store);
    const review = locationReview(req.body, location, 'time_out');
    const session = await mongoose.startSession();
    let updated;
    try {
      await session.withTransaction(async () => {
        const record = await Attendance.findOne({ store: store._id, employee: req.user._id, 'timeIn.at': { $exists: true }, 'timeOut.at': { $exists: false } }).sort({ 'timeIn.at': -1 }).session(session);
        if (!record?.timeIn?.at) throw fail('No active attendance session was found. If you forgot to clock out, submit a correction request from your attendance history.', 409);
        if (now - record.timeIn.at < 60000) throw fail('Time out is too soon after time in. Please wait and try again.', 429);
        const computed = calculateAttendance({ timeIn: record.timeIn.at, timeOut: now, schedule: record.schedule, graceMinutes: store.hrSettings?.gracePeriodMinutes, overtimeEnabled: store.hrSettings?.overtime?.enabled });
        const update = {
          $set: { timeOut: point(req, location, now), ...computed, locationFlagged: record.locationFlagged || Boolean(review) },
          $addToSet: { suspiciousReasons: { $each: location.reasons } },
          $inc: { __v: 1 }
        };
        if (review) update.$push = { locationReviews: review };
        updated = await Attendance.findOneAndUpdate(
          { _id: record._id, store: store._id, employee: req.user._id, __v: record.__v, 'timeOut.at': { $exists: false } },
          update,
          { new: true, runValidators: true, session }
        );
        if (!updated) throw fail('This attendance session was already updated. Refresh to see the recorded clock-out.', 409);
        await ActivityLog.create([{
          user: req.user._id,
          action: 'Attendance Time Out',
          details: `Employee ${req.user._id} timed out for ${record.workDate}; server time recorded.`,
          store: store._id,
          subject: req.user._id,
          category: 'attendance',
          changes: { before: { timeOut: null }, after: { timeOut: now }, effectiveDate: now, reason: 'Employee manual clock-out' },
          ipAddress: req.ip
        }], { session });
      });
    } finally {
      await session.endSession();
    }
    if (location.reasons.length) await notifyStoreRoles(req, store._id, ['admin', 'store_owner', 'manager'], ['manager'], 'attendance_update', 'Attendance exception', `${req.user.firstName || 'An employee'} recorded flagged attendance for ${updated.workDate}.`, updated._id, 'Attendance', '/admin/hr?tab=attendance');
    res.json({ message: location.reasons.length ? 'Time out recorded and flagged for review.' : 'Time out recorded.', attendance: updated });
  } catch (error) { safeError(res, error); }
};

const myAttendance = async (req, res) => {
  try {
    if (!isOperationalStaff(req.user) || !req.user.store) throw fail('Attendance is available only to assigned Store employees.', 403);
    const store = await storeFor(req); const employee = await employeeFor(store._id, req.user._id); const now = new Date(); const today = dateKeyInTimezone(now, store.hrSettings?.timezone);
    const from = req.query.from ? String(req.query.from).slice(0, 10) : dateKeyInTimezone(addDays(new Date(), -30), store.hrSettings?.timezone);
    const to = req.query.to ? String(req.query.to).slice(0, 10) : today;
    const records = await Attendance.find({ store: store._id, employee: req.user._id, workDate: { $gte: from, $lte: to } }).sort({ workDate: -1 });
    const history = addDerivedAbsences(records, [req.user], store, from, to);
    const eligibility = resolveTimeInEligibility(employee, store, now);
    const openRecord = history.find(row => row.timeIn?.at && !row.timeOut?.at);
    res.json({
      today: openRecord || history.find(row => row.workDate === today) || null,
      schedule: openRecord?.schedule || eligibility.schedule,
      timeInWindow: eligibility.window,
      locationPolicy: { outsideGeofencePolicy: store.hrSettings?.outsideGeofencePolicy || 'reject' },
      records: history
    });
  } catch (error) { safeError(res, error); }
};

const managementAttendance = async (req, res) => {
  try {
    const store = await storeFor(req);
    const from = req.query.from ? String(req.query.from).slice(0, 10) : dateKeyInTimezone(addDays(new Date(), -14), store.hrSettings?.timezone);
    const to = req.query.to ? String(req.query.to).slice(0, 10) : dateKeyInTimezone(new Date(), store.hrSettings?.timezone);
    const filter = { store: store._id, workDate: { $gte: from, $lte: to } };
    if (req.query.employeeId) filter.employee = req.query.employeeId;
    if ((parseDate(to) - parseDate(from)) / 86400000 > 92) throw fail('Attendance date range cannot exceed 93 days.');
    const [records, employees] = await Promise.all([
      Attendance.find(filter).populate('employee', 'firstName lastName role staffType professionalProfile.staffId riderProfile.staffId').sort({ workDate: -1 }),
      User.find({ store: store._id, ...activeStaffFilter(), ...(req.query.employeeId ? { _id: req.query.employeeId } : {}) }).select('firstName lastName role staffType professionalProfile.availability professionalProfile.leaveSchedule professionalProfile.staffId riderProfile.staffId').lean()
    ]);
    const canReview = hasPermission(req.user, 'attendance.review') || hasPermission(req.user, 'attendance.manage');
    const projected = addDerivedAbsences(records, employees, store, from, to)
      .map(row => projectAttendanceForViewer(row, canReview));
    res.json({ records: projected });
  } catch (error) { safeError(res, error); }
};

const reviewLocationAttendance = async (req, res) => {
  try {
    const store = await storeFor(req); const record = await Attendance.findOne({ _id: req.params.id, store: store._id });
    if (!record) throw fail('Attendance record not found.', 404);
    if (String(record.employee) === String(req.user._id) && !isPlatformAdmin(req.user)) throw fail('You cannot review your own attendance exception.', 403);
    const status = String(req.body.status || '');
    const punchType = String(req.body.punchType || '');
    const reviewerNote = String(req.body.reviewerNote || '').trim();
    if (!['approved', 'rejected'].includes(status)) throw fail('Choose Approved or Rejected.');
    if (!['time_in', 'time_out'].includes(punchType)) throw fail('Select the attendance punch to review.');
    if (reviewerNote.length < 5) throw fail('A reviewer note of at least 5 characters is required.');
    let review = record.locationReviews?.find(item => item.punchType === punchType && ['pending', 'rejected'].includes(item.status));
    if (!review && record.locationFlagged && !(record.locationReviews || []).length) {
      const evidence = punchType === 'time_in' ? record.timeIn : record.timeOut;
      if (!evidence?.at) throw fail('The selected attendance punch has no evidence to review.', 409);
      record.locationReviews.push({
        punchType,
        status: 'pending',
        employeeReason: 'Legacy flagged punch; employee reason was not captured.',
        evidenceReasons: record.suspiciousReasons || []
      });
      review = record.locationReviews[record.locationReviews.length - 1];
    }
    if (!review) throw fail('That attendance punch has no pending location review.', 409);
    const reviewedAt = new Date();
    review.history.push({ status, reviewedBy: req.user._id, reviewedAt, reviewerNote });
    review.status = status; review.reviewedBy = req.user._id; review.reviewedAt = reviewedAt; review.reviewerNote = reviewerNote;
    record.locationFlagged = record.locationReviews.some(item => item.status !== 'approved');
    record.locationReview = { reviewedBy: req.user._id, reviewedAt, reason: reviewerNote };
    await record.save();
    await audit(req, `Attendance Location ${status === 'approved' ? 'Approved' : 'Rejected'}`, `Attendance ${record._id} ${punchType} location review: ${reviewerNote}`);
    await notify(req, record.employee, 'attendance_update', `Attendance location ${status}`, `Your ${record.workDate} ${punchType.replace('_', ' ')} location was ${status}: ${reviewerNote}`, record._id, 'Attendance', '/staff/attendance');
    res.json({ message: `Attendance location ${status}.`, attendance: record });
  } catch (error) { safeError(res, error); }
};

const createManualAttendance = async (req, res) => {
  try {
    const store = await storeFor(req); const employee = await employeeFor(store._id, req.body.employeeId);
    const workDate = parseDate(req.body.workDate).toISOString().slice(0, 10);
    const reason = String(req.body.reason || '').trim();
    if (reason.length < 5) throw fail('A correction reason of at least 5 characters is required.');
    if (!['present', 'late', 'undertime', 'absent', 'rest_day', 'incomplete'].includes(req.body.status)) throw fail('Use the Leave approval workflow to create On Leave attendance.');
    const numeric = field => {
      const value = Number(req.body[field] || 0);
      if (!Number.isFinite(value) || value < 0) throw fail(`${field.replace('Minutes', ' minutes')} must be a non-negative number.`);
      return value;
    };
    const record = await Attendance.create({
      store: store._id, employee: employee._id, workDate,
      schedule: getScheduleForDate(employee, store, workDate), status: req.body.status,
      workedMinutes: numeric('workedMinutes'), lateMinutes: numeric('lateMinutes'),
      undertimeMinutes: numeric('undertimeMinutes'), overtimeMinutes: numeric('overtimeMinutes'),
      suspiciousReasons: ['Manual attendance record'],
      corrections: [{ field: 'record', originalValue: null, correctedValue: { status: req.body.status, workedMinutes: numeric('workedMinutes'), lateMinutes: numeric('lateMinutes'), undertimeMinutes: numeric('undertimeMinutes'), overtimeMinutes: numeric('overtimeMinutes') }, reason, changedBy: req.user._id }]
    });
    await audit(req, 'Attendance Created Manually', `Attendance ${record._id} created for employee ${employee._id}: ${reason}`);
    await notify(req, employee._id, 'attendance_update', 'Attendance updated', `Your ${workDate} attendance was manually corrected: ${reason}`, record._id, 'Attendance', '/staff/attendance');
    res.status(201).json({ message: 'Manual attendance correction recorded with an audit trail.', attendance: record });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'An attendance record already exists for that employee and date.' });
    safeError(res, error);
  }
};

const createLeave = async (req, res) => {
  try {
    if (!isOperationalStaff(req.user) || !req.user.store) throw fail('Leave requests are available only to assigned Store employees.', 403);
    const store = await storeFor(req); const startDate = parseDate(req.body.startDate); const endDate = dateEnd(req.body.endDate);
    if (endDate < startDate) throw fail('Leave end date must be on or after the start date.');
    const reason = String(req.body.reason || '').trim(); if (reason.length < 5) throw fail('Please provide a brief leave reason.');
    const policy = (store.hrSettings?.leaveTypes || []).find(type => type.active && type.key === req.body.leaveTypeKey);
    if (!policy) throw fail('Select an active Store leave type.');
    const chargeableDays = scheduledDays({ startDate, endDate, workDays: store.hrSettings?.defaultWorkDays });
    if (!chargeableDays) throw fail('The requested dates do not include a scheduled workday.');
    const balances = await leaveBalances({ store, employee: req.user._id, year: startDate.getUTCFullYear() });
    const balance = balances.find(item => item.key === policy.key);
    if (balance?.availableAfterPending !== null && chargeableDays > balance.availableAfterPending) throw fail(`Insufficient ${policy.name} balance. ${balance.availableAfterPending} day(s) remain after pending requests.`, 409);
    const overlap = await LeaveRequest.exists({ store: store._id, employee: req.user._id, status: { $in: ['pending', 'approved'] }, startDate: { $lte: endDate }, endDate: { $gte: startDate } });
    if (overlap) throw fail('A pending or approved leave request already covers these dates.', 409);
    const leave = await LeaveRequest.create({
      store: store._id, employee: req.user._id, leaveTypeKey: policy.key, leaveTypeName: policy.name,
      isPaid: policy.isPaid, startDate, endDate, reason, chargeableDays,
      policySnapshot: { key: policy.key, name: policy.name, isPaid: policy.isPaid, annualCredits: policy.annualCredits ?? null, carryOverLimit: policy.carryOverLimit || 0 },
      attachmentUrl: String(req.body.attachmentUrl || '').trim(), history: [{ action: 'submitted', actor: req.user._id }]
    });
    const recipients = await User.find({ store: store._id, isActive: true, isDeleted: false, $or: [
      { role: { $in: ['admin', 'store_owner', 'manager'] } },
      { role: 'staff', staffType: { $in: ['manager', 'administrative_support'] } }
    ] }).select('_id').lean();
    await Promise.all(recipients.map(item => notify(req, item._id, 'leave_update', 'New leave request', `${req.user.firstName || 'An employee'} submitted a leave request.`, leave._id, 'LeaveRequest', '/admin/hr?tab=leave')));
    await audit(req, 'Leave Requested', `Leave ${leave._id} submitted for ${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}.`);
    res.status(201).json({ message: 'Leave request submitted.', leave });
  } catch (error) { safeError(res, error); }
};

const myLeaves = async (req, res) => {
  try {
    if (!req.user.store) throw fail('A Store assignment is required.', 403);
    const [store, leaves] = await Promise.all([
      Store.findById(req.user.store).select('hrSettings.leaveTypes'),
      LeaveRequest.find({ store: req.user.store, employee: req.user._id }).populate('reviewedBy', 'firstName lastName').sort({ createdAt: -1 })
    ]);
    const balances = store ? await leaveBalances({ store, employee: req.user._id }) : [];
    res.json({ leaves, leaveTypes: (store?.hrSettings?.leaveTypes || []).filter(type => type.active), balances });
  } catch (error) { safeError(res, error); }
};

const cancelLeave = async (req, res) => {
  try {
    const leave = await LeaveRequest.findOne({ _id: req.params.id, store: req.user.store, employee: req.user._id });
    if (!leave) throw fail('Leave request not found.', 404);
    if (leave.status !== 'pending') throw fail('Only a pending leave request can be cancelled.', 409);
    leave.status = 'cancelled'; leave.cancelledAt = new Date(); leave.history.push({ action: 'cancelled', actor: req.user._id, comment: String(req.body.reason || '') });
    await leave.save(); await audit(req, 'Leave Cancelled', `Leave ${leave._id} cancelled by employee.`);
    res.json({ message: 'Leave request cancelled.', leave });
  } catch (error) { safeError(res, error); }
};

const listLeaves = async (req, res) => {
  try {
    const store = await storeFor(req); const filter = { store: store._id };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.employeeId) filter.employee = req.query.employeeId;
    const leaves = await LeaveRequest.find(filter).populate('employee reviewedBy', 'firstName lastName role staffType').sort({ createdAt: -1 });
    res.json({ leaves });
  } catch (error) { safeError(res, error); }
};

const reviewLeave = async (req, res) => {
  try {
    const store = await storeFor(req); const leave = await LeaveRequest.findOne({ _id: req.params.id, store: store._id });
    if (!leave) throw fail('Leave request not found.', 404);
    if (leave.status !== 'pending') throw fail('This leave request has already been reviewed.', 409);
    if (!['approved', 'rejected'].includes(req.body.status)) throw fail('Leave status must be approved or rejected.');
    if (req.body.status === 'approved') {
      const balances = await leaveBalances({ store, employee: leave.employee, year: leave.startDate.getUTCFullYear() });
      const balance = balances.find(item => item.key === leave.leaveTypeKey);
      const availableExcludingThisPending = balance?.entitlement == null ? null : balance.entitlement - balance.approvedUsed - Math.max(0, balance.pending - Number(leave.chargeableDays || 0));
      if (availableExcludingThisPending !== null && Number(leave.chargeableDays || 0) > availableExcludingThisPending) throw fail(`The employee no longer has enough ${leave.leaveTypeName} credits.`, 409);
      const recordedAttendance = await Attendance.exists({ store: store._id, employee: leave.employee, workDate: { $gte: leave.startDate.toISOString().slice(0, 10), $lte: leave.endDate.toISOString().slice(0, 10) }, 'timeIn.at': { $exists: true } });
      if (recordedAttendance) throw fail('This leave overlaps recorded attendance. Correct the attendance first or reject the leave request.', 409);
    }
    leave.status = req.body.status; leave.reviewedBy = req.user._id; leave.reviewedAt = new Date(); leave.reviewComment = String(req.body.comment || '').trim();
    leave.history.push({ action: leave.status, actor: req.user._id, comment: leave.reviewComment }); await leave.save();
    if (leave.status === 'approved') {
      await User.updateOne({ _id: leave.employee, store: store._id }, { $addToSet: { 'professionalProfile.leaveSchedule': { startDate: leave.startDate, endDate: leave.endDate, reason: leave.reason, leaveRequest: leave._id } } });
      const employee = await employeeFor(store._id, leave.employee);
      const leaveDays = [];
      dateLoop(leave.startDate, leave.endDate, day => leaveDays.push(day));
      for (const day of leaveDays) {
        const workDate = day.toISOString().slice(0, 10); const schedule = getScheduleForDate(employee, store, workDate);
        if (!schedule.isWorkDay) continue;
        const existing = await Attendance.findOne({ store: store._id, employee: leave.employee, workDate });
        if (existing?.timeIn?.at) continue;
        if (existing) {
          existing.status = 'on_leave'; existing.leaveRequest = leave._id; await existing.save();
        } else {
          try { await Attendance.create({ store: store._id, employee: leave.employee, workDate, schedule, status: 'on_leave', leaveRequest: leave._id }); }
          catch (error) { if (error.code !== 11000) throw error; }
        }
      }
    }
    await notify(req, leave.employee, 'leave_update', `Leave ${leave.status}`, `Your ${leave.leaveTypeName} request was ${leave.status}.`, leave._id, 'LeaveRequest', '/staff/leave');
    await audit(req, 'Leave Reviewed', `Leave ${leave._id} ${leave.status} by ${req.user._id}.`);
    res.json({ message: `Leave request ${leave.status}.`, leave });
  } catch (error) { safeError(res, error); }
};

const dateLoop = (start, end, callback) => {
  for (let cursor = parseDate(start); cursor <= dateEnd(end); cursor = addDays(cursor, 1)) callback(cursor);
};
const summarizeAttendance = async (employee, store, start, end, session = null) => {
  const fromKey = start.toISOString().slice(0, 10); const toKey = end.toISOString().slice(0, 10);
  const attendanceQuery = Attendance.find({ store: store._id, employee: employee._id, workDate: { $gte: fromKey, $lte: toKey } });
  const leaveQuery = LeaveRequest.find({ store: store._id, employee: employee._id, status: 'approved', startDate: { $lte: end }, endDate: { $gte: start } });
  if (session) { attendanceQuery.session(session); leaveQuery.session(session); }
  const [records, leaves] = await Promise.all([
    attendanceQuery.lean(), leaveQuery.lean()
  ]);
  const recordMap = new Map(records.map(row => [row.workDate, row]));
  const summary = { scheduledWorkDays: 0, daysPresent: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, legacyUnclassifiedLeaveDays: 0, flaggedAttendanceDays: 0, autoClockOutReviewDays: 0, absences: 0, restDays: 0, incompleteDays: 0, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 0, workedMinutes: 0 };
  dateLoop(start, end, date => {
    const key = date.toISOString().slice(0, 10); const schedule = getScheduleForDate(employee, store, key);
    if (!schedule.isWorkDay) { summary.restDays += 1; return; }
    summary.scheduledWorkDays += 1;
    const leave = leaves.find(item => item.startDate <= new Date(`${key}T23:59:59Z`) && item.endDate >= new Date(`${key}T00:00:00Z`));
    if (leave) { summary[leave.isPaid ? 'paidLeaveDays' : 'unpaidLeaveDays'] += 1; return; }
    const legacyLeave = (employee.professionalProfile?.leaveSchedule || []).find(item => !item.leaveRequest && new Date(item.startDate) <= new Date(`${key}T23:59:59Z`) && new Date(item.endDate) >= new Date(`${key}T00:00:00Z`));
    if (legacyLeave) { summary.legacyUnclassifiedLeaveDays += 1; return; }
    const attendance = recordMap.get(key);
    if (!attendance) { summary.absences += 1; return; }
    const unresolvedLocation = attendance.locationFlagged
      || (attendance.locationReviews || []).some(review => review.status !== 'approved');
    const unresolvedAutoClockOut = attendance.timeOut?.validationStatus === 'system_generated';
    if (unresolvedLocation) summary.flaggedAttendanceDays += 1;
    if (unresolvedAutoClockOut) summary.autoClockOutReviewDays += 1;
    if (unresolvedLocation || unresolvedAutoClockOut) { summary.incompleteDays += 1; return; }
    if (attendance.status === 'absent') summary.absences += 1;
    else if (attendance.status === 'rest_day') summary.restDays += 1;
    else if (['incomplete', 'on_leave'].includes(attendance.status)) summary.incompleteDays += 1;
    else summary.daysPresent += 1;
    ['lateMinutes', 'undertimeMinutes', 'overtimeMinutes', 'workedMinutes'].forEach(field => { summary[field] += Number(attendance[field] || 0); });
  });
  return summary;
};

const countScheduledWorkDays = (employee, store, start, end) => {
  let count = 0;
  dateLoop(start, end, date => {
    if (getScheduleForDate(employee, store, date.toISOString().slice(0, 10)).isWorkDay) count += 1;
  });
  return count;
};

const addNumericSummary = (target, source) => {
  for (const [key, value] of Object.entries(source || {})) {
    if (Number.isFinite(Number(value))) target[key] = Number(target[key] || 0) + Number(value);
  }
  return target;
};

const generatePeriod = async (req, res) => {
  try {
    const store = await storeFor(req); const calculated = generatePayrollPeriod(req.body.referenceDate || new Date(), store.hrSettings);
    const existing = await PayrollPeriod.findOne({ store: store._id, periodStart: calculated.periodStart, periodEnd: calculated.periodEnd });
    if (existing) return res.json({ message: 'This payroll period already exists.', period: existing });
    const period = await PayrollPeriod.create({ ...calculated, store: store._id, policySnapshot: snapshot(store.hrSettings), generatedBy: req.user._id });
    await audit(req, 'Payroll Period Generated', `Payroll period ${period._id} generated for Store ${store._id}.`);
    res.status(201).json({ message: 'Payroll period created as Draft.', period });
  } catch (error) { safeError(res, error); }
};

const listPeriods = async (req, res) => {
  try { const store = await storeFor(req); res.json({ periods: await PayrollPeriod.find({ store: store._id }).sort({ periodStart: -1 }) }); }
  catch (error) { safeError(res, error); }
};

const periodDetails = async (req, res) => {
  try {
    const store = await storeFor(req); const period = await PayrollPeriod.findOne({ _id: req.params.id, store: store._id });
    if (!period) throw fail('Payroll period not found.', 404);
    const payslips = await Payslip.find({ payrollPeriod: period._id, store: store._id }).populate('employee', 'firstName lastName role staffType').sort({ createdAt: 1 });
    res.json({ period, payslips });
  } catch (error) { safeError(res, error); }
};

const computePeriod = async (req, res) => {
  try {
    const store = await storeFor(req);
    const { period, result } = await computePayrollPeriodAtomically({
      periodId: req.params.id,
      storeId: store._id,
      calculate: async ({ period, session }) => {
        if (period.periodEnd > dateEnd(new Date())) throw fail('Payroll cannot be computed before the attendance period has ended.', 409);
        const employees = await User.find(payrollEmployeeQuery(store._id, { includeInactive: true }))
          .select('+employmentProfile.compensation +employmentProfile.compensationHistory +employmentProfile.employmentHistory')
          .session(session);
        const issues = [];
        const includedEmployeeIds = [];
        for (const employee of employees) {
      const name = employeeName(employee);
      const eligibility = payrollEligibility(employee, period.periodEnd, period.periodStart);
      if (!eligibility.eligible) {
        await Payslip.deleteOne({ payrollPeriod: period._id, employee: employee._id }, { session });
        issues.push({ employeeId: employee._id, employeeName: name, code: eligibility.code, reason: `${name}: ${eligibility.message}` });
        continue;
      }
      includedEmployeeIds.push(employee._id);
      const compensationCoverage = compensationSegmentsForPeriod(employee.employmentProfile, period.periodStart, period.periodEnd);
      if (compensationCoverage.coverageGap) issues.push({ employeeId: employee._id, employeeName: name, code: 'compensation_coverage_gap', reason: `${name}: employment days without an effective compensation revision were excluded. Add the missing effective-dated rate and recompute payroll.`, blocking: true });
      if (compensationCoverage.legacyReviewRequired) issues.push({ employeeId: employee._id, employeeName: name, code: 'legacy_compensation_basis', reason: `${name}: legacy salary remains interpreted as one amount per payroll period. Review and create a future explicit monthly, daily, or hourly revision; this payroll was not silently reclassified.`, blocking: false });
      const periodScheduledWorkDays = countScheduledWorkDays(employee, store, period.periodStart, period.periodEnd);
      const attendanceSummary = {};
      const pay = { basePay: 0, overtimePay: 0, absenceDeduction: 0, unpaidLeaveDeduction: 0, lateDeduction: 0, undertimeDeduction: 0 };
      for (const segment of compensationCoverage.segments) {
        const segmentSummary = await summarizeAttendance(employee, store, segment.start, segment.end, session);
        addNumericSummary(attendanceSummary, segmentSummary);
        const segmentPay = computePay({
          compensation: segment.compensation,
          summary: segmentSummary,
          settings: period.policySnapshot,
          frequency: period.frequency,
          periodScheduledWorkDays
        });
        for (const field of Object.keys(pay)) pay[field] = roundMoney(pay[field] + Number(segmentPay[field] || 0));
      }
      if (attendanceSummary.legacyUnclassifiedLeaveDays) issues.push({ employeeId: employee._id, employeeName: name, code: 'legacy_leave_unclassified', reason: `${name}: ${attendanceSummary.legacyUnclassifiedLeaveDays} legacy leave day(s) need paid/unpaid classification; no automatic deduction was made.`, blocking: false });
      if (attendanceSummary.flaggedAttendanceDays) issues.push({ employeeId: employee._id, employeeName: name, code: 'attendance_location_review', reason: `${name}: ${attendanceSummary.flaggedAttendanceDays} location-flagged attendance day(s) require a final approval before payroll review.`, blocking: true });
      if (attendanceSummary.autoClockOutReviewDays) issues.push({ employeeId: employee._id, employeeName: name, code: 'legacy_system_clock_out', reason: `${name}: ${attendanceSummary.autoClockOutReviewDays} legacy system-generated clock-out day(s) require an authorized manual correction before payroll review.`, blocking: true });
      const existing = await Payslip.findOne({ payrollPeriod: period._id, employee: employee._id }).session(session);
      const manualAdditions = (existing?.additions || []).filter(item => item.source === 'manual').map(item => item.toObject());
      const manualDeductions = (existing?.deductions || []).filter(item => item.source === 'manual').map(item => item.toObject());
      const riderEarnings = (employee.staffType === 'delivery_rider' || employee.role === 'delivery_rider')
        ? await RiderEarning.find({ rider: employee._id, store: store._id, status: 'available', payout: null, payrollPayslip: null, earnedAt: { $gte: period.periodStart, $lte: dateEnd(period.periodEnd) } }).session(session).lean() : [];
      const additions = [
        ...manualAdditions,
        ...(pay.overtimePay > 0 ? [{ type: 'Overtime Pay', amount: pay.overtimePay, reason: 'Computed from attendance under the Store overtime policy.', source: 'attendance', createdBy: req.user._id }] : []),
        ...riderEarnings.map(item => ({ type: 'Delivery Incentive', amount: item.amount, reason: 'Internal rider earning included once in payroll.', source: 'rider_earning', sourceId: item._id, createdBy: req.user._id }))
      ];
      const preStatutoryDeductions = [
        ...manualDeductions,
        ...[['Absence', pay.absenceDeduction], ['Unpaid Leave', pay.unpaidLeaveDeduction], ['Late', pay.lateDeduction], ['Undertime', pay.undertimeDeduction]]
          .filter(([, amount]) => amount > 0)
          .map(([type, amount]) => ({ type, amount, reason: `Computed from authoritative ${type.toLowerCase()} records.`, source: type === 'Unpaid Leave' ? 'leave' : 'attendance', createdBy: req.user._id }))
      ];
      const additionsTotal = additions.reduce((sum, item) => sum + Number(item.amount), 0);
      const currentSegment = compensationCoverage.segments.at(-1);
      const grossPay = roundMoney(pay.basePay + additionsTotal);
      const monthlyCompensation = currentSegment.compensation.compensationBasis === 'monthly'
        ? Number(currentSegment.compensation.baseRate)
        : roundMoney(grossPay * payPeriodsPerMonth(period.frequency));
      const statutory = calculateStatutoryPayroll({
        grossPay, monthlyCompensation, frequency: period.frequency,
        configured: period.policySnapshot?.statutoryContributions
      });
      const statutoryRows = statutory.enabled ? [
        ['SSS', statutory.employeeDeductions.sss],
        ['PhilHealth', statutory.employeeDeductions.philHealth],
        ['Pag-IBIG', statutory.employeeDeductions.pagIbig],
        ['Withholding Tax', statutory.employeeDeductions.withholdingTax]
      ].filter(([, amount]) => amount > 0).map(([type, amount]) => ({
        type, amount, reason: `Computed using ${statutory.policy.version}; see the itemized statutory breakdown.`, source: 'statutory', createdBy: req.user._id
      })) : [];
      const deductions = [...preStatutoryDeductions, ...statutoryRows];
      const deductionsTotal = deductions.reduce((sum, item) => sum + Number(item.amount), 0);
      const netPay = roundMoney(Math.max(0, grossPay - deductionsTotal));
      await Payslip.findOneAndUpdate({ payrollPeriod: period._id, employee: employee._id }, {
        store: store._id,
        employeeSnapshot: {
          name: `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.username,
          staffId: employee.employmentProfile?.staffId || employee.professionalProfile?.staffId || employee.riderProfile?.staffId,
          role: employee.staffType || employee.role,
          compensationType: currentSegment.compensation.compensationType,
          compensationBasis: currentSegment.compensation.compensationBasis,
          baseRate: currentSegment.compensation.baseRate,
          effectiveDate: currentSegment.compensation.effectiveDate,
          compensationSegments: compensationCoverage.segments.map(segment => ({
            compensationBasis: segment.compensation.compensationBasis,
            baseRate: segment.compensation.baseRate,
            effectiveDate: segment.compensation.effectiveDate,
            segmentStart: segment.start,
            segmentEnd: segment.end
          }))
        },
        attendanceSummary, additions, deductions, basePay: pay.basePay, grossPay,
        taxableCompensation: statutory.taxableCompensation,
        statutoryDeductions: statutory.employeeDeductions,
        employerContributions: statutory.employerContributions,
        statutoryBreakdown: { monthlyCompensation, ...statutory.breakdown },
        statutoryPolicySnapshot: statutory.policy,
        totalDeductions: deductionsTotal,
        netPay,
        paymentStatus: existing?.paymentStatus || 'unpaid'
      }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, session });
        }
        await Payslip.deleteMany({ payrollPeriod: period._id, employee: { $nin: includedEmployeeIds } }, { session });
        const [totals] = await Payslip.aggregate([{ $match: { payrollPeriod: period._id } }, { $group: {
          _id: null, employeeCount: { $sum: 1 }, grossPay: { $sum: '$grossPay' }, netPay: { $sum: '$netPay' },
          deductions: { $sum: '$totalDeductions' },
          employeeContributions: { $sum: { $add: ['$statutoryDeductions.sss', '$statutoryDeductions.philHealth', '$statutoryDeductions.pagIbig'] } },
          employerContributions: { $sum: '$employerContributions.total' }, withholdingTax: { $sum: '$statutoryDeductions.withholdingTax' }
        } }]).session(session);
        period.computedBy = req.user._id; period.computedAt = new Date(); period.totals = totals || {}; period.reviewIssues = issues;
        return { issues };
      }
    });
    const { issues } = result;
    await audit(req, 'Payroll Computed', `Payroll ${period._id} computed from attendance; ${issues.length} employee(s) need compensation setup.`);
    await notifyStoreRoles(req, store._id, ['admin', 'store_owner'], [], 'payroll_update', 'Payroll ready for review', `Payroll for ${period.periodStart.toISOString().slice(0, 10)} to ${period.periodEnd.toISOString().slice(0, 10)} was computed.`, period._id, 'PayrollPeriod', '/admin/hr?tab=payroll');
    res.json({ message: 'Payroll computed from attendance.', period, issues });
  } catch (error) { safeError(res, error); }
};

const addAdjustment = async (req, res) => {
  try {
    const store = await storeFor(req); const payslip = await Payslip.findOne({ _id: req.params.payslipId, store: store._id });
    if (!payslip) throw fail('Payslip not found.', 404);
    if (normalizeRole(req.user) === 'finance_staff' && String(payslip.employee) === String(req.user._id)) {
      throw fail('Finance staff cannot add or modify adjustments on their own payslip.', 403);
    }
    const period = await PayrollPeriod.findOne({ _id: payslip.payrollPeriod, store: store._id });
    if (!['draft', 'computed'].includes(period.status)) throw fail('Adjustments are locked after payroll review.', 409);
    const amount = Number(req.body.amount); const reason = String(req.body.reason || '').trim();
    if (!Number.isFinite(amount) || amount <= 0 || reason.length < 5) throw fail('A positive amount and clear reason are required.');
    const target = req.body.kind === 'deduction' ? payslip.deductions : payslip.additions;
    target.push({ type: String(req.body.type || 'Manual Adjustment'), amount, reason, source: 'manual', createdBy: req.user._id });
    recalculatePayslipTotals({ payslip, period, actorId: req.user._id });
    await payslip.save();
    const [totals] = await Payslip.aggregate([{ $match: { payrollPeriod: period._id } }, { $group: {
      _id: null, employeeCount: { $sum: 1 }, grossPay: { $sum: '$grossPay' }, netPay: { $sum: '$netPay' }, deductions: { $sum: '$totalDeductions' },
      employeeContributions: { $sum: { $add: ['$statutoryDeductions.sss', '$statutoryDeductions.philHealth', '$statutoryDeductions.pagIbig'] } },
      employerContributions: { $sum: '$employerContributions.total' }, withholdingTax: { $sum: '$statutoryDeductions.withholdingTax' }
    } }]);
    period.totals = totals || {}; await period.save();
    await audit(req, 'Payroll Adjustment Added', `${req.body.kind === 'deduction' ? 'Deduction' : 'Addition'} added to payslip ${payslip._id}: ${reason}`);
    res.json({ message: 'Manual adjustment recorded with audit details.', payslip });
  } catch (error) { safeError(res, error); }
};

const statusHandler = nextStatus => async (req, res) => {
  try {
    const store = await storeFor(req);
    const prior = { reviewed: 'computed', approved: 'reviewed', paid: 'approved' }[nextStatus];
    let period;
    await mongoose.connection.transaction(async session => {
      period = await PayrollPeriod.findOne({ _id: req.params.id, store: store._id }).session(session);
      if (!period) throw fail('Payroll period not found.', 404);
      if (period.status !== prior) throw fail(`Payroll must be ${prior} before it can be ${nextStatus}.`, 409);
      if (['reviewed', 'approved'].includes(nextStatus)
        && Number(period.computedInputRevision || 0) !== Number(period.payrollInputRevision || 0)) {
        throw fail('Payroll inputs changed after the current computation. Recompute this period before review or approval.', 409);
      }
      if (nextStatus === 'reviewed' && normalizeRole(req.user) === 'finance_staff'
        && await Payslip.exists({ payrollPeriod: period._id, store: store._id, employee: req.user._id }).session(session)) {
        throw fail('Finance staff cannot review a payroll that includes their own salary. A Store Owner or other authorized non-beneficiary must review this period.', 403);
      }
      if (nextStatus === 'reviewed' && await Payslip.countDocuments({ payrollPeriod: period._id, store: store._id }).session(session) === 0) throw fail('Payroll has no employee payslips to review. Configure compensation and recompute it first.', 409);
      if (nextStatus === 'reviewed' && period.reviewIssues?.some(issue => issue.blocking)) throw fail('Resolve all attendance exceptions and recompute payroll before continuing.', 409);
      if (nextStatus === 'reviewed' && period.reviewIssues?.length && req.body.acknowledgeIssues !== true) throw fail('Review the listed payroll issues and explicitly acknowledge them before continuing.', 409);
      if (nextStatus === 'approved') {
        const slips = await Payslip.find({ payrollPeriod: period._id, store: store._id }).session(session);
        for (const slip of slips) {
          for (const addition of slip.additions.filter(item => item.source === 'rider_earning')) {
            const claimed = await RiderEarning.findOneAndUpdate(
              { _id: addition.sourceId, store: store._id, status: 'available', payout: null, payrollPayslip: null },
              { status: 'processing', payrollPayslip: slip._id },
              { new: true, session }
            );
            if (!claimed) throw fail('A rider earning was already included in another payout. Recompute payroll before approval.', 409);
          }
        }
      }
      const now = new Date(); period.status = nextStatus;
      if (nextStatus === 'reviewed') { period.reviewedBy = req.user._id; period.reviewedAt = now; }
      if (nextStatus === 'approved') { period.approvedBy = req.user._id; period.approvedAt = now; }
      await period.save({ session });
    });
    if (nextStatus === 'approved') await notifyStoreRoles(req, store._id, ['finance_staff'], ['finance_staff'], 'payroll_update', 'Payroll approved for processing', 'An approved payroll period is ready to be recorded as paid.', period._id, 'PayrollPeriod', '/admin/hr?tab=payroll');
    await audit(req, `Payroll ${nextStatus}`, `Payroll ${period._id} changed to ${nextStatus} by ${req.user._id}.`);
    res.json({ message: `Payroll ${nextStatus}.`, period });
  } catch (error) { safeError(res, error); }
};

const reviewPeriod = statusHandler('reviewed');
const approvePeriod = async (req, res) => {
  if (!(isStoreAdmin(req.user) || isPlatformAdmin(req.user) || hasPermission(req.user, 'payroll.approve'))) return res.status(403).json({ message: 'Only the Store Owner or a specifically delegated payroll approver can approve payroll.' });
  return statusHandler('approved')(req, res);
};
const payPeriod = async (req, res) => {
  return res.status(409).json({ message: 'Period-wide payment recording is disabled. Record and independently confirm each employee payment separately.' });
};

const paymentObligations = async (req, res) => {
  try {
    const store = await storeFor(req);
    const result = await findPaymentObligations(req.params.id, store._id);
    res.json(result);
  } catch (error) { safeError(res, error); }
};
const createEmployeePaymentAttempt = async (req, res) => {
  try {
    const store = await storeFor(req);
    const result = await createPaymentAttempt({ periodId: req.params.id, payslipId: req.params.payslipId, storeId: store._id, actor: req.user, input: req.body, ipAddress: req.ip });
    res.status(result.idempotent ? 200 : 201).json({ message: result.idempotent ? 'This payment request was already recorded; no duplicate was created.' : 'External payment attempt recorded. Pawzzle did not initiate a transfer.', ...result });
  } catch (error) { safeError(res, error); }
};
const retryEmployeePaymentAttempt = async (req, res) => {
  try {
    const store = await storeFor(req);
    const result = await retryFailedAttempt({ priorAttemptId: req.params.attemptId, storeId: store._id, actor: req.user, input: req.body, ipAddress: req.ip });
    res.status(result.idempotent ? 200 : 201).json({ message: 'A new linked external payment attempt was recorded.', ...result });
  } catch (error) { safeError(res, error); }
};
const updateEmployeePaymentAttempt = async (req, res) => {
  try {
    const store = await storeFor(req);
    const result = await transitionPaymentAttempt({ attemptId: req.params.attemptId, storeId: store._id, actor: req.user, input: req.body, ipAddress: req.ip });
    res.json({ message: result.idempotent ? 'The payment attempt already has this status.' : 'Payment attempt status updated.', ...result });
  } catch (error) { safeError(res, error); }
};
const confirmEmployeePaymentAttempt = async (req, res) => {
  try {
    const store = await storeFor(req);
    const result = await confirmPaymentAttempt({ attemptId: req.params.attemptId, storeId: store._id, actor: req.user, reason: req.body.reason, ipAddress: req.ip });
    res.json({ message: result.idempotent ? 'This employee payment was already confirmed.' : result.periodComplete ? 'Employee payment confirmed; all payroll obligations are now confirmed.' : 'Employee payment confirmed. Other employees remain outstanding.', ...result });
  } catch (error) { safeError(res, error); }
};
const getEmployeePaymentProof = async (req, res) => {
  try {
    const store = await storeFor(req);
    const proof = await getProtectedProof({ attemptId: req.params.attemptId, storeId: store._id });
    const safeName = proof.originalName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'payment-proof';
    const content = Buffer.from(proof.base64, 'base64');
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Disposition', `attachment; filename="${safeName}"`);
    res.type(proof.mimeType).send(content);
  } catch (error) { safeError(res, error); }
};

const myPayslips = async (req, res) => {
  try {
    const [payslips, paymentStatuses, pending] = await Promise.all([
      Payslip.find({ employee: req.user._id, store: req.user.store, paymentStatus: 'recorded_paid' }).populate('payrollPeriod', 'periodStart periodEnd payDate frequency status').populate('store', 'name logo').sort({ finalizedAt: -1 }),
      findEmployeePaymentStatuses(req.user._id, req.user.store),
      Payslip.findOne({ employee: req.user._id, store: req.user.store, paymentStatus: { $in: ['unpaid', 'processing', 'for_confirmation', 'on_hold', 'failed'] } }).populate({ path: 'payrollPeriod', match: { status: { $in: ['approved', 'paid'] } }, select: 'periodStart periodEnd payDate frequency status' }).sort({ createdAt: -1 }).lean()
    ]);
    const availability = payslips.length
      ? { reason: 'published' }
      : pending
        ? { reason: 'awaiting_payment_record', payrollStatus: pending.payrollPeriod?.status || 'computed' }
        : { reason: 'no_payroll_record' };
    res.json({ payslips, paymentStatuses, availability });
  } catch (error) { safeError(res, error); }
};
const myPayslip = async (req, res) => {
  try {
    const payslip = await Payslip.findOne({ _id: req.params.id, employee: req.user._id, store: req.user.store, paymentStatus: 'recorded_paid' }).populate('payrollPeriod', 'periodStart periodEnd payDate frequency status').populate('store', 'name logo');
    if (!payslip) throw fail('Payslip not found.', 404); res.json({ payslip });
  } catch (error) { safeError(res, error); }
};

const payrollReports = async (req, res) => {
  try {
    const store = await storeFor(req);
    const filter = { store: store._id };
    if (req.query.from || req.query.to) {
      filter.periodStart = {};
      if (req.query.from) filter.periodStart.$gte = parseDate(req.query.from);
      if (req.query.to) filter.periodStart.$lte = dateEnd(req.query.to);
    }
    if (req.query.status) filter.status = req.query.status;
    const periods = await PayrollPeriod.find(filter).sort({ periodStart: -1 }).lean();
    const periodIds = periods.map(item => item._id);
    const [payslips, remittances] = await Promise.all([
      Payslip.find({ store: store._id, payrollPeriod: { $in: periodIds } })
        .populate('employee', 'firstName lastName').populate('payrollPeriod', 'periodStart periodEnd payDate status').lean(),
      GovernmentRemittance.find({ store: store._id, payrollPeriod: { $in: periodIds } })
        .populate('payrollPeriod', 'periodStart periodEnd payDate status').sort({ contributionMonth: -1, agency: 1 }).lean()
    ]);
    const totals = payslips.reduce((sum, slip) => {
      sum.grossPay += Number(slip.grossPay || 0);
      sum.employeeDeductions += Number(slip.totalDeductions || (slip.deductions || []).reduce((value, item) => value + Number(item.amount || 0), 0));
      sum.employerContributions += Number(slip.employerContributions?.total || 0);
      sum.netPay += Number(slip.netPay || 0);
      for (const key of ['sss', 'philHealth', 'pagIbig', 'withholdingTax']) sum[key] += Number(slip.statutoryDeductions?.[key] || 0);
      return sum;
    }, { grossPay: 0, employeeDeductions: 0, employerContributions: 0, netPay: 0, sss: 0, philHealth: 0, pagIbig: 0, withholdingTax: 0 });
    Object.keys(totals).forEach(key => { totals[key] = roundMoney(totals[key]); });
    res.json({ periods, payslips, remittances, totals });
  } catch (error) { safeError(res, error); }
};

const prepareRemittances = async (req, res) => {
  try {
    const store = await storeFor(req);
    const period = await PayrollPeriod.findOne({ _id: req.params.id, store: store._id });
    if (!period) throw fail('Payroll period not found.', 404);
    if (!['approved', 'paid'].includes(period.status)) throw fail('Payroll must be approved before remittance records are prepared.', 409);
    const slips = await Payslip.find({ store: store._id, payrollPeriod: period._id }).lean();
    if (!slips.length) throw fail('This payroll has no payslips.', 409);
    const contributionMonth = period.periodEnd.toISOString().slice(0, 7);
    const amounts = {
      SSS: { employee: 'sss', employer: 'sss' },
      PhilHealth: { employee: 'philHealth', employer: 'philHealth' },
      'Pag-IBIG': { employee: 'pagIbig', employer: 'pagIbig' },
      BIR: { employee: 'withholdingTax', employer: null }
    };
    const records = [];
    for (const [agency, fields] of Object.entries(amounts)) {
      const employeeAmount = roundMoney(slips.reduce((sum, slip) => sum + Number(slip.statutoryDeductions?.[fields.employee] || 0), 0));
      const employerAmount = fields.employer ? roundMoney(slips.reduce((sum, slip) => sum + Number(slip.employerContributions?.[fields.employer] || 0), 0)) : 0;
      const remittanceId = deterministicRemittanceId({ store: store._id, payrollPeriod: period._id, agency });
      let record;
      try {
        record = await GovernmentRemittance.findOneAndUpdate(
          { _id: remittanceId },
          { $setOnInsert: { _id: remittanceId, store: store._id, payrollPeriod: period._id, agency, contributionMonth, employeeAmount, employerAmount, totalAmount: roundMoney(employeeAmount + employerAmount), status: 'pending', preparedBy: req.user._id, history: [{ status: 'pending', actor: req.user._id, note: 'Prepared from an approved payroll snapshot.' }] } },
          { new: true, upsert: true, runValidators: true }
        );
      } catch (error) {
        if (error.code !== 11000) throw error;
        record = await GovernmentRemittance.findById(remittanceId);
      }
      records.push(record);
    }
    await audit(req, 'Government Remittances Prepared', `Government remittance records prepared for payroll ${period._id}.`);
    res.status(201).json({ message: 'Government remittance records prepared from the approved payroll snapshot.', remittances: records });
  } catch (error) { safeError(res, error); }
};

const updateRemittance = async (req, res) => {
  try {
    const store = await storeFor(req);
    const record = await GovernmentRemittance.findOne({ _id: req.params.id, store: store._id });
    if (!record) throw fail('Remittance record not found.', 404);
    const requested = String(req.body.status || '');
    const transitions = {
      pending: ['for_confirmation', 'on_hold'],
      for_confirmation: ['processing', 'failed', 'on_hold'],
      processing: ['for_confirmation', 'failed', 'on_hold'],
      failed: ['processing', 'on_hold'],
      on_hold: ['pending', 'processing']
    };
    if (requested === 'paid') throw fail('Use independent remittance confirmation to mark a payment Paid.', 409);
    if (!(transitions[record.status] || []).includes(requested)) throw fail(`A remittance cannot move from ${record.status} to ${requested}.`, 409);
    const note = String(req.body.note || '').trim();
    if (note.length < 5) throw fail('Provide a clear status-change note.');
    record.status = requested;
    if (req.body.paymentReference !== undefined) record.paymentReference = String(req.body.paymentReference || '').trim();
    record.history.push({ status: requested, actor: req.user._id, note });
    await record.save();
    await audit(req, 'Government Remittance Updated', `${record.agency} remittance ${record._id} changed to ${requested}.`);
    res.json({ message: 'Remittance status updated.', remittance: record });
  } catch (error) { safeError(res, error); }
};

const confirmRemittance = async (req, res) => {
  try {
    const store = await storeFor(req);
    const record = await GovernmentRemittance.findOne({ _id: req.params.id, store: store._id });
    if (!record) throw fail('Remittance record not found.', 404);
    if (!['for_confirmation', 'processing'].includes(record.status)) throw fail('Only a submitted remittance can be confirmed Paid.', 409);
    if (String(record.preparedBy) === String(req.user._id)) throw fail('The person who prepared a remittance cannot independently confirm it.', 403);
    const paymentReference = String(req.body.paymentReference || record.paymentReference || '').trim();
    const note = String(req.body.note || '').trim();
    if (paymentReference.length < 4 || note.length < 5) throw fail('A payment reference and confirmation note are required.');
    record.status = 'paid'; record.paymentReference = paymentReference; record.paymentDate = req.body.paymentDate ? new Date(req.body.paymentDate) : new Date();
    record.confirmedBy = req.user._id; record.confirmedAt = new Date(); record.history.push({ status: 'paid', actor: req.user._id, note });
    await record.save();
    await audit(req, 'Government Remittance Confirmed', `${record.agency} remittance ${record._id} independently confirmed Paid.`);
    res.json({ message: 'Government remittance independently confirmed Paid.', remittance: record });
  } catch (error) { safeError(res, error); }
};

module.exports = {
  getSettings, updateSettings, listEmployees, getCompensation, updateCompensation,
  timeIn, timeOut, myAttendance, managementAttendance, createManualAttendance,
  reviewLocationAttendance,
  createLeave, myLeaves, cancelLeave, listLeaves, reviewLeave,
  generatePeriod, listPeriods, periodDetails, computePeriod, addAdjustment,
  reviewPeriod, approvePeriod, payPeriod, paymentObligations, createEmployeePaymentAttempt,
  retryEmployeePaymentAttempt, updateEmployeePaymentAttempt, confirmEmployeePaymentAttempt,
  getEmployeePaymentProof, myPayslips, myPayslip, summarizeAttendance,
  payrollReports, prepareRemittances, updateRemittance, confirmRemittance
};
