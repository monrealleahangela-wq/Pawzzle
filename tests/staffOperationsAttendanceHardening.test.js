const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { hasPermission } = require('../config/permissions');

const root = path.join(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

test('finance retains store-scoped order read access without sales mutation access', () => {
  assert.equal(hasPermission({ role: 'finance_staff' }, 'sales.view'), true);
  assert.equal(hasPermission({ role: 'finance_staff' }, 'sales.manage'), false);
  const routes = source('routes/adminOrders.js');
  assert.match(routes, /canViewOrders = requirePermission\('sales\.view'/);
  assert.match(routes, /canUpdateOrders = requirePermission\('sales\.manage'/);
  const list = source('client/src/pages/admin/Orders.js');
  const detail = source('client/src/pages/customer/OrderDetail.js');
  assert.match(list, /canManageOrders && getActionButton/);
  assert.match(detail, /canManageOrders && order\.deliveryMethod/);
});

test('managers may review attendance exceptions but finance remains read-only', () => {
  assert.equal(hasPermission({ role: 'manager' }, 'attendance.review'), true);
  assert.equal(hasPermission({ role: 'finance_staff' }, 'attendance.review'), false);
  assert.equal(hasPermission({ role: 'finance_staff' }, 'attendance.view'), true);
});

test('attendance automation is disabled and is not started after database connection', () => {
  const service = source('services/attendanceAutomationService.js');
  assert.match(service, /never generates a clock-out/);
  assert.match(service, /processStoreAutoClockOuts = async \(\) => 0/);
  assert.doesNotMatch(source('server.js'), /processAttendanceAutoClockOuts/);
});

test('attendance UI exposes schedule window, correction requests, evidence and reviewer actions', () => {
  const employee = source('client/src/pages/staff/EmployeeHR.js');
  const management = source('client/src/pages/admin/HRManagement.js');
  assert.match(employee, /timeInWindow/);
  assert.match(employee, /offsiteReason/);
  assert.match(employee, /AttendanceCorrectionRequestPanel/);
  assert.match(management, /AttendanceCorrectionReviewPanel/);
  assert.match(management, /GPS accuracy/);
  assert.match(management, /reviewAttendanceLocation/);
  assert.doesNotMatch(management, /reviewAutoClockOut/);
});

test('attendance review evidence is projected only to authorized reviewers', () => {
  const controller = source('controllers/hrController.js');
  assert.match(controller, /projectAttendanceForViewer/);
  assert.match(controller, /hasPermission\(req\.user, 'attendance\.review'\)/);
  assert.match(controller, /suspiciousReasons: \[\]/);
});
