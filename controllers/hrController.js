const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const PayrollPeriod = require('../models/PayrollPeriod');
const Payslip = require('../models/Payslip');
const RiderEarning = require('../models/RiderEarning');
const Store = require('../models/Store');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const resolveStore = require('../utils/resolveStore');
const { createNotification } = require('./notificationController');
const { hasPermission, isOperationalStaff, isStoreAdmin, isPlatformAdmin } = require('../config/permissions');
const {
  isValidCoordinates, distanceMeters, dateKeyInTimezone, getScheduleForDate,
  calculateAttendance, generatePayrollPeriod, computePay, roundMoney, addDays
} = require('../utils/hrPolicy');

const STAFF_ROLES = [
  'manager', 'service_staff', 'cashier', 'inventory_staff', 'procurement_officer',
  'finance_staff', 'veterinarian', 'groomer', 'trainer', 'boarding_staff',
  'delivery_dispatcher', 'delivery_rider', 'auditor'
];
const activeStaffFilter = () => ({
  isDeleted: false, isActive: true, staffStatus: { $nin: ['archived', 'suspended', 'inactive'] },
  'employmentProfile.employmentStatus': { $nin: ['inactive', 'terminated'] },
  $or: [{ role: 'staff' }, { role: { $in: STAFF_ROLES } }]
});
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const safeError = (res, error) => {
  console.error('[HR]', error);
  const status = error.statusCode || (error.name === 'ValidationError' ? 400 : 500);
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
  let query = User.findOne({ _id: employeeId, store: storeId, ...activeStaffFilter() });
  if (compensation) query = query.select('+employmentProfile.compensation');
  const employee = await query;
  if (!employee) throw fail('Employee not found in this Store.', 404);
  return employee;
};
const audit = (req, action, details) => ActivityLog.create({ user: req.user._id, action, details, ipAddress: req.ip });
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
    if (shift && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(shift.start || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(shift.end || '') || shift.start >= shift.end)) {
      throw fail('Default shift must contain a valid start time before its end time.');
    }
    if (req.body.leaveTypes) {
      const keys = req.body.leaveTypes.map(type => String(type.key || '').trim().toLowerCase());
      if (keys.some(key => !key) || new Set(keys).size !== keys.length) throw fail('Leave types must have unique non-empty keys.');
    }
    const editable = ['payrollFrequency', 'weekly', 'semiMonthly', 'monthly', 'defaultWorkDays', 'defaultShift', 'gracePeriodMinutes', 'lateDeductionEnabled', 'undertimeDeductionEnabled', 'overtime', 'attendanceRadiusMeters', 'maximumAccuracyMeters', 'outsideGeofencePolicy', 'payrollApprovalRequired', 'leaveTypes'];
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
    const employees = await User.find({ store: store._id, ...activeStaffFilter() })
      .select('firstName lastName role staffType professionalProfile.staffId riderProfile.staffId employmentProfile.staffId employmentProfile.employmentStatus')
      .sort({ firstName: 1 });
    res.json({ employees });
  } catch (error) { safeError(res, error); }
};

const getCompensation = async (req, res) => {
  try {
    const store = await storeFor(req);
    const employee = await employeeFor(store._id, req.params.employeeId, true);
    res.json({ employee: { _id: employee._id, firstName: employee.firstName, lastName: employee.lastName, staffType: employee.staffType || employee.role, employmentProfile: employee.employmentProfile } });
  } catch (error) { safeError(res, error); }
};

const updateCompensation = async (req, res) => {
  try {
    const store = await storeFor(req);
    const employee = await employeeFor(store._id, req.params.employeeId, true);
    const input = req.body || {};
    ['staffId', 'employmentStatus', 'dateHired', 'branchName'].forEach(key => { if (input[key] !== undefined) employee.set(`employmentProfile.${key}`, input[key]); });
    if (input.compensation) {
      const compensationType = input.compensation.compensationType;
      const baseRate = Number(input.compensation.baseRate);
      if (!['salary', 'daily', 'hourly'].includes(compensationType) || !Number.isFinite(baseRate) || baseRate < 0) throw fail('Enter a valid compensation type and non-negative rate.');
      employee.set('employmentProfile.compensation', {
        compensationType, baseRate,
        effectiveDate: input.compensation.effectiveDate || new Date()
      });
    }
    await employee.save();
    await audit(req, 'Compensation Updated', `Compensation profile updated for employee ${employee._id} in Store ${store._id}.`);
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
  if (accuracy !== null && accuracy > Number(store.hrSettings?.maximumAccuracyMeters || 200)) reasons.push('GPS accuracy is too low');
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
    const store = await storeFor(req); await employeeFor(store._id, req.user._id);
    const now = new Date(); const workDate = dateKeyInTimezone(now, store.hrSettings?.timezone);
    if (await Attendance.exists({ store: store._id, employee: req.user._id, workDate, 'timeIn.at': { $exists: true } })) throw fail('You have already timed in today.', 409);
    if (await LeaveRequest.exists({ store: store._id, employee: req.user._id, status: 'approved', startDate: { $lte: dateEnd(workDate) }, endDate: { $gte: parseDate(workDate) } })) throw fail('You are on approved leave today. Attendance is not required.', 409);
    const location = validateLocation(req.body, store);
    const record = await Attendance.findOneAndUpdate(
      { store: store._id, employee: req.user._id, workDate, 'timeIn.at': { $exists: false } },
      { $setOnInsert: { schedule: getScheduleForDate(req.user, store, workDate) }, $set: { timeIn: point(req, location, now), status: 'incomplete', locationFlagged: location.reasons.length > 0 }, $addToSet: { suspiciousReasons: { $each: location.reasons } } },
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
    const workDate = dateKeyInTimezone(now, store.hrSettings?.timezone);
    const record = await Attendance.findOne({ store: store._id, employee: req.user._id, workDate });
    if (!record?.timeIn?.at) throw fail('You must time in before timing out.', 409);
    if (record.timeOut?.at) throw fail('You have already timed out today.', 409);
    if (now - record.timeIn.at < 60000) throw fail('Time out is too soon after time in. Please wait and try again.', 429);
    const location = validateLocation(req.body, store);
    const computed = calculateAttendance({ timeIn: record.timeIn.at, timeOut: now, schedule: record.schedule, graceMinutes: store.hrSettings?.gracePeriodMinutes, overtimeEnabled: store.hrSettings?.overtime?.enabled });
    const updated = await Attendance.findOneAndUpdate(
      { _id: record._id, store: store._id, employee: req.user._id, 'timeOut.at': { $exists: false } },
      { $set: { timeOut: point(req, location, now), ...computed, locationFlagged: record.locationFlagged || location.reasons.length > 0 }, $addToSet: { suspiciousReasons: { $each: location.reasons } } },
      { new: true, runValidators: true }
    );
    if (!updated) throw fail('You have already timed out today.', 409);
    await audit(req, 'Attendance Time Out', `Employee ${req.user._id} timed out for ${workDate}; server time recorded.`);
    if (location.reasons.length) await notifyStoreRoles(req, store._id, ['admin', 'store_owner', 'manager'], ['manager'], 'attendance_update', 'Attendance exception', `${req.user.firstName || 'An employee'} recorded flagged attendance for ${workDate}.`, updated._id, 'Attendance', '/admin/hr?tab=attendance');
    res.json({ message: location.reasons.length ? 'Time out recorded and flagged for review.' : 'Time out recorded.', attendance: updated });
  } catch (error) { safeError(res, error); }
};

const myAttendance = async (req, res) => {
  try {
    if (!isOperationalStaff(req.user) || !req.user.store) throw fail('Attendance is available only to assigned Store employees.', 403);
    const store = await storeFor(req); const today = dateKeyInTimezone(new Date(), store.hrSettings?.timezone);
    const from = req.query.from ? String(req.query.from).slice(0, 10) : dateKeyInTimezone(addDays(new Date(), -30), store.hrSettings?.timezone);
    const to = req.query.to ? String(req.query.to).slice(0, 10) : today;
    const records = await Attendance.find({ store: store._id, employee: req.user._id, workDate: { $gte: from, $lte: to } }).sort({ workDate: -1 });
    const history = addDerivedAbsences(records, [req.user], store, from, to);
    res.json({ today: history.find(row => row.workDate === today) || null, schedule: getScheduleForDate(req.user, store, today), records: history });
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
    res.json({ records: addDerivedAbsences(records, employees, store, from, to) });
  } catch (error) { safeError(res, error); }
};

const correctAttendance = async (req, res) => {
  try {
    const store = await storeFor(req); const record = await Attendance.findOne({ _id: req.params.id, store: store._id });
    if (!record) throw fail('Attendance record not found.', 404);
    const reason = String(req.body.reason || '').trim(); if (reason.length < 5) throw fail('A correction reason of at least 5 characters is required.');
    const changes = [];
    ['status', 'workedMinutes', 'lateMinutes', 'undertimeMinutes', 'overtimeMinutes'].forEach(field => {
      if (req.body[field] !== undefined && String(record[field]) !== String(req.body[field])) {
        changes.push({ field, originalValue: record[field], correctedValue: req.body[field], reason, changedBy: req.user._id });
        record[field] = req.body[field];
      }
    });
    if (!changes.length) throw fail('No valid attendance correction was provided.');
    record.corrections.push(...changes); record.suspiciousReasons = [...new Set([...(record.suspiciousReasons || []), 'Manual attendance correction'])];
    if (record.locationFlagged) {
      record.locationFlagged = false;
      record.locationReview = { reviewedBy: req.user._id, reviewedAt: new Date(), reason };
    }
    await record.save(); await audit(req, 'Attendance Corrected', `Attendance ${record._id} corrected: ${reason}`);
    await notify(req, record.employee, 'attendance_update', 'Attendance updated', `Your ${record.workDate} attendance was corrected: ${reason}`, record._id, 'Attendance', '/staff/attendance');
    res.json({ message: 'Attendance corrected with an audit record.', attendance: record });
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
    const overlap = await LeaveRequest.exists({ store: store._id, employee: req.user._id, status: { $in: ['pending', 'approved'] }, startDate: { $lte: endDate }, endDate: { $gte: startDate } });
    if (overlap) throw fail('A pending or approved leave request already covers these dates.', 409);
    const leave = await LeaveRequest.create({
      store: store._id, employee: req.user._id, leaveTypeKey: policy.key, leaveTypeName: policy.name,
      isPaid: policy.isPaid, startDate, endDate, reason,
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
    res.json({ leaves, leaveTypes: (store?.hrSettings?.leaveTypes || []).filter(type => type.active) });
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
const summarizeAttendance = async (employee, store, start, end) => {
  const fromKey = start.toISOString().slice(0, 10); const toKey = end.toISOString().slice(0, 10);
  const [records, leaves] = await Promise.all([
    Attendance.find({ store: store._id, employee: employee._id, workDate: { $gte: fromKey, $lte: toKey } }).lean(),
    LeaveRequest.find({ store: store._id, employee: employee._id, status: 'approved', startDate: { $lte: end }, endDate: { $gte: start } }).lean()
  ]);
  const recordMap = new Map(records.map(row => [row.workDate, row]));
  const summary = { scheduledWorkDays: 0, daysPresent: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, legacyUnclassifiedLeaveDays: 0, flaggedAttendanceDays: 0, absences: 0, restDays: 0, incompleteDays: 0, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 0, workedMinutes: 0 };
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
    if (attendance.locationFlagged) summary.flaggedAttendanceDays += 1;
    if (attendance.status === 'absent') summary.absences += 1;
    else if (attendance.status === 'rest_day') summary.restDays += 1;
    else if (['incomplete', 'on_leave'].includes(attendance.status)) summary.incompleteDays += 1;
    else summary.daysPresent += 1;
    ['lateMinutes', 'undertimeMinutes', 'overtimeMinutes', 'workedMinutes'].forEach(field => { summary[field] += Number(attendance[field] || 0); });
  });
  return summary;
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
    const store = await storeFor(req); const period = await PayrollPeriod.findOne({ _id: req.params.id, store: store._id });
    if (!period) throw fail('Payroll period not found.', 404);
    if (!['draft', 'computed'].includes(period.status)) throw fail('Only Draft or Computed payroll can be recomputed.', 409);
    if (period.periodEnd > dateEnd(new Date())) throw fail('Payroll cannot be computed before the attendance period has ended.', 409);
    const employees = await User.find({ store: store._id, ...activeStaffFilter() }).select('+employmentProfile.compensation');
    const issues = [];
    for (const employee of employees) {
      const compensation = employee.employmentProfile?.compensation;
      if (!compensation || Number(compensation.baseRate) <= 0) { await Payslip.deleteOne({ payrollPeriod: period._id, employee: employee._id }); issues.push({ employeeId: employee._id, reason: 'Compensation is not configured.' }); continue; }
      if (compensation.effectiveDate && compensation.effectiveDate > period.periodEnd) { await Payslip.deleteOne({ payrollPeriod: period._id, employee: employee._id }); issues.push({ employeeId: employee._id, reason: 'Compensation is not effective in this payroll period.' }); continue; }
      const attendanceSummary = await summarizeAttendance(employee, store, period.periodStart, period.periodEnd);
      if (attendanceSummary.legacyUnclassifiedLeaveDays) issues.push({ employeeId: employee._id, reason: `${attendanceSummary.legacyUnclassifiedLeaveDays} legacy leave day(s) need paid/unpaid classification; no automatic deduction was made.` });
      if (attendanceSummary.flaggedAttendanceDays) issues.push({ employeeId: employee._id, reason: `${attendanceSummary.flaggedAttendanceDays} location-flagged attendance day(s) require review before approval.` });
      const pay = computePay({ compensation, summary: attendanceSummary, settings: period.policySnapshot });
      const existing = await Payslip.findOne({ payrollPeriod: period._id, employee: employee._id });
      const manualAdditions = (existing?.additions || []).filter(item => item.source === 'manual').map(item => item.toObject());
      const manualDeductions = (existing?.deductions || []).filter(item => item.source === 'manual').map(item => item.toObject());
      const riderEarnings = (employee.staffType === 'delivery_rider' || employee.role === 'delivery_rider')
        ? await RiderEarning.find({ rider: employee._id, store: store._id, status: 'available', payout: null, payrollPayslip: null, earnedAt: { $gte: period.periodStart, $lte: dateEnd(period.periodEnd) } }).lean() : [];
      const additions = [
        ...manualAdditions,
        ...(pay.overtimePay > 0 ? [{ type: 'Overtime Pay', amount: pay.overtimePay, reason: 'Computed from attendance under the Store overtime policy.', source: 'attendance', createdBy: req.user._id }] : []),
        ...riderEarnings.map(item => ({ type: 'Delivery Incentive', amount: item.amount, reason: 'Internal rider earning included once in payroll.', source: 'rider_earning', sourceId: item._id, createdBy: req.user._id }))
      ];
      const deductions = [
        ...manualDeductions,
        ...[['Absence', pay.absenceDeduction], ['Unpaid Leave', pay.unpaidLeaveDeduction], ['Late', pay.lateDeduction], ['Undertime', pay.undertimeDeduction]]
          .filter(([, amount]) => amount > 0)
          .map(([type, amount]) => ({ type, amount, reason: `Computed from authoritative ${type.toLowerCase()} records.`, source: type === 'Unpaid Leave' ? 'leave' : 'attendance', createdBy: req.user._id }))
      ];
      const additionsTotal = additions.reduce((sum, item) => sum + Number(item.amount), 0);
      const deductionsTotal = deductions.reduce((sum, item) => sum + Number(item.amount), 0);
      const grossPay = roundMoney(pay.basePay + additionsTotal); const netPay = roundMoney(Math.max(0, grossPay - deductionsTotal));
      await Payslip.findOneAndUpdate({ payrollPeriod: period._id, employee: employee._id }, {
        store: store._id,
        employeeSnapshot: {
          name: `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.username,
          staffId: employee.employmentProfile?.staffId || employee.professionalProfile?.staffId || employee.riderProfile?.staffId,
          role: employee.staffType || employee.role,
          compensationType: compensation.compensationType,
          baseRate: compensation.baseRate,
          effectiveDate: compensation.effectiveDate
        },
        attendanceSummary, additions, deductions, basePay: pay.basePay, grossPay, netPay,
        paymentStatus: existing?.paymentStatus || 'unpaid'
      }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
    }
    await Payslip.deleteMany({ payrollPeriod: period._id, employee: { $nin: employees.map(item => item._id) } });
    const [totals] = await Payslip.aggregate([{ $match: { payrollPeriod: period._id } }, { $group: { _id: null, employeeCount: { $sum: 1 }, grossPay: { $sum: '$grossPay' }, netPay: { $sum: '$netPay' }, deductions: { $sum: { $sum: '$deductions.amount' } } } }]);
    period.status = 'computed'; period.computedBy = req.user._id; period.computedAt = new Date(); period.totals = totals || {}; period.reviewIssues = issues;
    await period.save(); await audit(req, 'Payroll Computed', `Payroll ${period._id} computed from attendance; ${issues.length} employee(s) need compensation setup.`);
    await notifyStoreRoles(req, store._id, ['admin', 'store_owner'], [], 'payroll_update', 'Payroll ready for review', `Payroll for ${period.periodStart.toISOString().slice(0, 10)} to ${period.periodEnd.toISOString().slice(0, 10)} was computed.`, period._id, 'PayrollPeriod', '/admin/hr?tab=payroll');
    res.json({ message: 'Payroll computed from attendance.', period, issues });
  } catch (error) { safeError(res, error); }
};

const addAdjustment = async (req, res) => {
  try {
    const store = await storeFor(req); const payslip = await Payslip.findOne({ _id: req.params.payslipId, store: store._id });
    if (!payslip) throw fail('Payslip not found.', 404);
    const period = await PayrollPeriod.findOne({ _id: payslip.payrollPeriod, store: store._id });
    if (!['draft', 'computed'].includes(period.status)) throw fail('Adjustments are locked after payroll review.', 409);
    const amount = Number(req.body.amount); const reason = String(req.body.reason || '').trim();
    if (!Number.isFinite(amount) || amount <= 0 || reason.length < 5) throw fail('A positive amount and clear reason are required.');
    const target = req.body.kind === 'deduction' ? payslip.deductions : payslip.additions;
    target.push({ type: String(req.body.type || 'Manual Adjustment'), amount, reason, source: 'manual', createdBy: req.user._id });
    const additions = payslip.additions.reduce((sum, item) => sum + item.amount, 0); const deductions = payslip.deductions.reduce((sum, item) => sum + item.amount, 0);
    payslip.grossPay = roundMoney(payslip.basePay + additions); payslip.netPay = roundMoney(Math.max(0, payslip.grossPay - deductions));
    await payslip.save();
    const [totals] = await Payslip.aggregate([{ $match: { payrollPeriod: period._id } }, { $group: { _id: null, employeeCount: { $sum: 1 }, grossPay: { $sum: '$grossPay' }, netPay: { $sum: '$netPay' }, deductions: { $sum: { $sum: '$deductions.amount' } } } }]);
    period.totals = totals || {}; await period.save();
    await audit(req, 'Payroll Adjustment Added', `${req.body.kind === 'deduction' ? 'Deduction' : 'Addition'} added to payslip ${payslip._id}: ${reason}`);
    res.json({ message: 'Manual adjustment recorded with audit details.', payslip });
  } catch (error) { safeError(res, error); }
};

const statusHandler = nextStatus => async (req, res) => {
  try {
    const store = await storeFor(req); const period = await PayrollPeriod.findOne({ _id: req.params.id, store: store._id });
    if (!period) throw fail('Payroll period not found.', 404);
    const prior = { reviewed: 'computed', approved: 'reviewed', paid: 'approved' }[nextStatus];
    if (period.status !== prior) throw fail(`Payroll must be ${prior} before it can be ${nextStatus}.`, 409);
    if (nextStatus === 'reviewed' && await Payslip.countDocuments({ payrollPeriod: period._id, store: store._id }) === 0) throw fail('Payroll has no employee payslips to review. Configure compensation and recompute it first.', 409);
    if (nextStatus === 'reviewed' && period.reviewIssues?.length && req.body.acknowledgeIssues !== true) throw fail('Review the listed payroll issues and explicitly acknowledge them before continuing.', 409);
    if (nextStatus === 'approved') {
      const slips = await Payslip.find({ payrollPeriod: period._id, store: store._id });
      const claimedEarningIds = [];
      for (const slip of slips) {
        for (const addition of slip.additions.filter(item => item.source === 'rider_earning')) {
          const claimed = await RiderEarning.findOneAndUpdate({ _id: addition.sourceId, store: store._id, status: 'available', payout: null, payrollPayslip: null }, { status: 'processing', payrollPayslip: slip._id }, { new: true });
          if (!claimed) {
            await RiderEarning.updateMany({ _id: { $in: claimedEarningIds }, store: store._id, status: 'processing' }, { $set: { status: 'available', payrollPayslip: null } });
            throw fail('A rider earning was already included in another payout. Recompute payroll before approval.', 409);
          }
          claimedEarningIds.push(claimed._id);
        }
      }
    }
    const now = new Date(); period.status = nextStatus;
    if (nextStatus === 'reviewed') { period.reviewedBy = req.user._id; period.reviewedAt = now; }
    if (nextStatus === 'approved') { period.approvedBy = req.user._id; period.approvedAt = now; }
    if (nextStatus === 'paid') {
      const method = String(req.body.method || '').trim(); const referenceNumber = String(req.body.referenceNumber || '').trim();
      if (!method || !referenceNumber) throw fail('Payment method and reference number are required when recording payroll as paid.');
      period.paidBy = req.user._id; period.paidAt = now;
      await Payslip.updateMany({ payrollPeriod: period._id, store: store._id, paymentStatus: { $ne: 'recorded_paid' } }, { $set: { paymentStatus: 'recorded_paid', paymentRecord: { method, referenceNumber, paymentDate: req.body.paymentDate || now, processedBy: req.user._id, notes: String(req.body.notes || '') }, finalizedAt: now } });
      const slipIds = await Payslip.find({ payrollPeriod: period._id, store: store._id }).distinct('_id');
      await RiderEarning.updateMany({ payrollPayslip: { $in: slipIds }, status: 'processing' }, { $set: { status: 'paid' } });
      const slips = await Payslip.find({ payrollPeriod: period._id, store: store._id }).select('employee');
      await Promise.all(slips.map(item => notify(req, item.employee, 'payroll_update', 'Payslip ready', 'Your payroll was recorded as paid. Your payslip is now available.', item._id, 'Payslip', '/staff/payslips')));
    }
    await period.save();
    if (nextStatus === 'approved') await notifyStoreRoles(req, store._id, ['finance_staff'], ['finance_staff'], 'payroll_update', 'Payroll approved for processing', 'An approved payroll period is ready to be recorded as paid.', period._id, 'PayrollPeriod', '/admin/hr?tab=payroll');
    await audit(req, `Payroll ${nextStatus}`, `Payroll ${period._id} changed to ${nextStatus} by ${req.user._id}.`);
    res.json({ message: nextStatus === 'paid' ? 'Payroll recorded as paid. No bank transfer was initiated by Pawzzle.' : `Payroll ${nextStatus}.`, period });
  } catch (error) { safeError(res, error); }
};

const reviewPeriod = statusHandler('reviewed');
const approvePeriod = async (req, res) => {
  if (!(isStoreAdmin(req.user) || isPlatformAdmin(req.user) || hasPermission(req.user, 'payroll.approve'))) return res.status(403).json({ message: 'Only the Store Owner or a specifically delegated payroll approver can approve payroll.' });
  return statusHandler('approved')(req, res);
};
const payPeriod = statusHandler('paid');

const myPayslips = async (req, res) => {
  try {
    const payslips = await Payslip.find({ employee: req.user._id, store: req.user.store, paymentStatus: 'recorded_paid' }).populate('payrollPeriod', 'periodStart periodEnd payDate frequency status').populate('store', 'name logo').sort({ finalizedAt: -1 });
    res.json({ payslips });
  } catch (error) { safeError(res, error); }
};
const myPayslip = async (req, res) => {
  try {
    const payslip = await Payslip.findOne({ _id: req.params.id, employee: req.user._id, store: req.user.store, paymentStatus: 'recorded_paid' }).populate('payrollPeriod', 'periodStart periodEnd payDate frequency status').populate('store', 'name logo');
    if (!payslip) throw fail('Payslip not found.', 404); res.json({ payslip });
  } catch (error) { safeError(res, error); }
};

module.exports = {
  getSettings, updateSettings, listEmployees, getCompensation, updateCompensation,
  timeIn, timeOut, myAttendance, managementAttendance, correctAttendance, createManualAttendance,
  createLeave, myLeaves, cancelLeave, listLeaves, reviewLeave,
  generatePeriod, listPeriods, periodDetails, computePeriod, addAdjustment,
  reviewPeriod, approvePeriod, payPeriod, myPayslips, myPayslip, summarizeAttendance
};
