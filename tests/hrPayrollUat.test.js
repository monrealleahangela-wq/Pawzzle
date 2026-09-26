const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  isValidCoordinates, distanceMeters, getScheduleForDate, calculateAttendance,
  generatePayrollPeriod, computePay, dateAtTime
} = require('../utils/hrPolicy');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const store = {
  hrSettings: {
    timezone: 'Asia/Manila', defaultWorkDays: [1, 2, 3, 4, 5],
    defaultShift: { start: '09:00', end: '17:00', breakMinutes: 60 },
    gracePeriodMinutes: 10, lateDeductionEnabled: true, undertimeDeductionEnabled: true,
    overtime: { enabled: true, multiplier: 1.25 }
  }
};

test('attendance geofence uses valid coordinates and Haversine distance', () => {
  assert.equal(isValidCoordinates(14.299, 120.958), true);
  assert.equal(isValidCoordinates(95, 120), false);
  assert.ok(distanceMeters({ lat: 14.299, lng: 120.958 }, { lat: 14.2995, lng: 120.9585 }) < 100);
  assert.ok(distanceMeters({ lat: 14.299, lng: 120.958 }, { lat: 14.32, lng: 120.98 }) > 1000);
});

test('employee schedule takes precedence and store schedule safely supports legacy staff', () => {
  assert.equal(getScheduleForDate({}, store, '2026-09-14').isWorkDay, true);
  assert.equal(getScheduleForDate({}, store, '2026-09-13').isWorkDay, false);
  const employee = { professionalProfile: { availability: { monday: { available: true, start: '08:00', end: '16:00', breaks: [{ start: '12:00', end: '12:30' }] } } } };
  assert.deepEqual(getScheduleForDate(employee, store, '2026-09-14'), { isWorkDay: true, start: '08:00', end: '16:00', breakMinutes: 30, timezone: 'Asia/Manila' });
});

test('attendance derives late, undertime, overtime and worked time from server timestamps', () => {
  const schedule = { isWorkDay: true, start: '09:00', end: '17:00', breakMinutes: 60, timezone: 'Asia/Manila' };
  const result = calculateAttendance({ timeIn: dateAtTime('2026-09-14', '09:20'), timeOut: dateAtTime('2026-09-14', '18:00'), schedule, graceMinutes: 10, overtimeEnabled: true });
  assert.equal(result.status, 'late');
  assert.equal(result.lateMinutes, 10);
  assert.equal(result.overtimeMinutes, 60);
  assert.equal(result.workedMinutes, 460);
});

test('rest-day attendance does not use missing shift boundaries and can become overtime', () => {
  const result = calculateAttendance({
    timeIn: dateAtTime('2026-09-13', '09:00'), timeOut: dateAtTime('2026-09-13', '12:00'),
    schedule: { isWorkDay: false, start: null, end: null, breakMinutes: 0, timezone: 'Asia/Manila' },
    overtimeEnabled: true
  });
  assert.deepEqual(result, { status: 'present', workedMinutes: 180, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 180 });
});

test('weekly payroll generation honors configured week and pay delay', () => {
  const period = generatePayrollPeriod('2026-09-16', { payrollFrequency: 'weekly', weekly: { weekStartsOn: 1, payDelayDays: 2 } });
  assert.equal(period.periodStart.toISOString().slice(0, 10), '2026-09-14');
  assert.equal(period.periodEnd.toISOString().slice(0, 10), '2026-09-20');
  assert.equal(period.payDate.toISOString().slice(0, 10), '2026-09-22');
});

test('semi-monthly payroll uses fixed cutoffs instead of every 15 days', () => {
  const settings = { payrollFrequency: 'semi_monthly', semiMonthly: { firstCutoffDay: 15, firstPayDay: 20, secondPayDay: 5 } };
  const first = generatePayrollPeriod('2026-09-10', settings);
  const second = generatePayrollPeriod('2026-09-21', settings);
  assert.equal(first.periodStart.toISOString().slice(0, 10), '2026-09-01');
  assert.equal(first.periodEnd.toISOString().slice(0, 10), '2026-09-15');
  assert.equal(second.periodStart.toISOString().slice(0, 10), '2026-09-16');
  assert.equal(second.periodEnd.toISOString().slice(0, 10), '2026-09-30');
  assert.equal(second.payDate.toISOString().slice(0, 10), '2026-10-05');
});

test('monthly payroll honors configured cutoff and pay date', () => {
  const period = generatePayrollPeriod('2026-09-10', { payrollFrequency: 'monthly', monthly: { cutoffDay: 25, payDay: 30 } });
  assert.equal(period.periodStart.toISOString().slice(0, 10), '2026-08-26');
  assert.equal(period.periodEnd.toISOString().slice(0, 10), '2026-09-25');
  assert.equal(period.payDate.toISOString().slice(0, 10), '2026-09-30');
});

test('salary payroll distinguishes paid leave, unpaid leave and attendance deductions', () => {
  const result = computePay({
    compensation: { compensationType: 'salary', baseRate: 10000 },
    summary: { scheduledWorkDays: 10, daysPresent: 7, paidLeaveDays: 1, unpaidLeaveDays: 1, absences: 1, lateMinutes: 60, undertimeMinutes: 0, overtimeMinutes: 60 },
    settings: store.hrSettings
  });
  assert.equal(result.basePay, 10000);
  assert.equal(result.absenceDeduction, 1000);
  assert.equal(result.unpaidLeaveDeduction, 1000);
  assert.equal(result.overtimePay > 0, true);
});

test('hourly payroll pays actual work and paid leave without double late deduction', () => {
  const result = computePay({
    compensation: { compensationType: 'hourly', baseRate: 100 },
    summary: { scheduledWorkDays: 5, workedMinutes: 1800, paidLeaveDays: 1, unpaidLeaveDays: 1, lateMinutes: 60, undertimeMinutes: 60, overtimeMinutes: 0 },
    settings: store.hrSettings
  });
  assert.equal(result.basePay, 3700);
  assert.equal(result.lateDeduction, 0);
  assert.equal(result.undertimeDeduction, 0);
});

test('attendance routes are self-only and management operations are explicitly permissioned', () => {
  const routes = read('routes/hr.js');
  assert.match(routes, /me\/attendance\/time-in/);
  assert.match(routes, /me\/attendance\/time-out/);
  assert.doesNotMatch(routes, /me\/attendance\/:employeeId/);
  assert.match(routes, /requirePermission\('attendance\.manage'\)/);
  assert.match(routes, /requirePermission\('leave\.approve'\)/);
});

test('payroll preparation, approval, payment and compensation use separate permissions', () => {
  const routes = read('routes/hr.js');
  assert.match(routes, /payroll\.prepare/);
  assert.match(routes, /payroll\.approve/);
  assert.match(routes, /payroll\.pay/);
  assert.match(routes, /compensation\.manage/);
  const permissions = read('config/permissions.js');
  const financeBlock = permissions.slice(permissions.indexOf('finance_staff:'), permissions.indexOf('veterinarian:', permissions.indexOf('finance_staff:')));
  assert.match(financeBlock, /payroll\.prepare/);
  assert.doesNotMatch(financeBlock, /payroll\.approve/);
});

test('server is authoritative for attendance time and tenant scope', () => {
  const controller = read('controllers/hrController.js');
  assert.match(controller, /const now = new Date\(\)/);
  assert.match(controller, /store: store\._id, employee: req\.user\._id/);
  assert.match(controller, /resolveStore\(req\)/);
  assert.doesNotMatch(controller, /req\.body\.timestamp/);
});

test('duplicate time in and time out without time in are rejected', () => {
  const controller = read('controllers/hrController.js');
  assert.match(controller, /already timed in today/);
  assert.match(controller, /must time in before timing out/);
  const attendance = read('models/Attendance.js');
  assert.match(attendance, /unique: true/);
});

test('poor GPS, impossible coordinates, rapid checkout and manual corrections are auditable', () => {
  const controller = read('controllers/hrController.js');
  assert.match(controller, /GPS accuracy is too low/);
  assert.match(controller, /Time out is too soon/);
  assert.match(controller, /corrections\.push/);
  const model = read('models/Attendance.js');
  for (const field of ['originalValue', 'correctedValue', 'changedBy', 'reason']) assert.match(model, new RegExp(`${field}:`));
});

test('approved leave feeds specialist unavailability and payroll retains paid snapshot', () => {
  const controller = read('controllers/hrController.js');
  assert.match(controller, /professionalProfile\.leaveSchedule/);
  assert.match(controller, /leaveTypeName: policy\.name,\s*isPaid: policy\.isPaid/);
  assert.match(read('utils/staffSpecialization.js'), /leaveSchedule/);
  assert.match(controller, /legacyUnclassifiedLeaveDays/);
  assert.match(controller, /no automatic deduction was made/);
});

test('leave approval and payroll queries are same-store scoped', () => {
  const controller = read('controllers/hrController.js');
  assert.match(controller, /LeaveRequest\.findOne\(\{ _id: req\.params\.id, store: store\._id \}\)/);
  assert.match(controller, /PayrollPeriod\.findOne\(\{ _id: req\.params\.id, store: store\._id \}\)/);
  assert.match(controller, /employeeFor\(store\._id/);
});

test('payslips are employee-owned, finalized snapshots', () => {
  const controller = read('controllers/hrController.js');
  assert.match(controller, /employee: req\.user\._id, store: req\.user\.store, paymentStatus: 'recorded_paid'/);
  const model = read('models/Payslip.js');
  assert.match(model, /employeeSnapshot/);
  assert.match(model, /attendanceSummary/);
  assert.match(model, /compensationType/);
});

test('payroll cannot be paid twice and records external payment rather than claiming transfer', () => {
  const controller = read('controllers/hrController.js');
  assert.match(controller, /prior = \{ reviewed: 'computed', approved: 'reviewed', paid: 'approved' \}/);
  assert.match(controller, /No bank transfer was initiated by Pawzzle/);
  assert.match(controller, /paymentStatus: 'recorded_paid'/);
});

test('internal rider earnings are included once in employee payroll', () => {
  const controller = read('controllers/hrController.js');
  assert.match(controller, /staffType === 'delivery_rider'/);
  assert.match(controller, /payrollPayslip: null/);
  assert.match(controller, /payout: null/);
  assert.match(read('models/RiderEarning.js'), /payrollPayslip/);
});

test('professional verification gate remains authoritative for specialized staff', () => {
  const auth = read('middleware/auth.js');
  assert.match(auth, /PROFESSIONAL_VERIFICATION_REQUIRED/);
  assert.match(auth, /requiresPlatformVerification/);
  const routes = read('routes/hr.js');
  assert.match(routes, /router\.use\(authenticate\)/);
});

test('frontend exposes compact employee and authorized management workflows', () => {
  const app = read('client/src/App.js');
  const employee = read('client/src/pages/staff/EmployeeHR.js');
  const management = read('client/src/pages/admin/HRManagement.js');
  assert.match(app, /staff\/attendance/);
  assert.match(app, /admin\/hr/);
  assert.match(employee, /Time In/);
  assert.match(employee, /Request Leave/);
  assert.match(employee, /No finalized payslips yet/);
  assert.match(management, /Semi-Monthly \/ Kinsenas/);
  assert.match(management, /Record as Paid/);
});

test('no statutory tax or government contribution values are fabricated', () => {
  const management = read('client/src/pages/admin/HRManagement.js');
  assert.match(management, /Government contributions and statutory tax calculations are not generated/);
  assert.doesNotMatch(read('controllers/hrController.js'), /SSS|PhilHealth|Pag-IBIG/);
});
