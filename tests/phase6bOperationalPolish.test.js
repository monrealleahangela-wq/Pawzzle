const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('staff workspace presents the complete compact operational table and summaries', () => {
  const ui = source('client/src/pages/admin/StaffManagement.js');
  for (const label of ['Total Staff', 'Active', 'Busy', 'On Leave', 'Pending Verification']) assert.match(ui, new RegExp(label));
  for (const column of ['Staff ID', 'Availability', 'Schedule', 'Verification', 'Assigned Services']) assert.match(ui, new RegExp(column));
  assert.match(ui, /sticky top-0/);
  assert.match(ui, /pageSize/);
});

test('ordinary staff onboarding exposes only operational store roles', () => {
  const ui = source('client/src/pages/admin/StaffManagement.js');
  for (const role of ['manager', 'cashier', 'inventory_staff', 'procurement_officer', 'finance_staff', 'veterinarian', 'groomer', 'trainer', 'boarding_staff', 'delivery_dispatcher', 'delivery_rider']) assert.match(ui, new RegExp(role));
  for (const forbidden of ['platform_admin', 'super_admin', 'customer', 'supplier', 'auditor']) assert.doesNotMatch(ui, new RegExp(`value: '${forbidden}'`));
});

test('staff wizard keeps review and role-specific professional and delivery fields', () => {
  const ui = source('client/src/pages/admin/StaffManagement.js');
  assert.match(ui, /Step \{step\} of 3/);
  assert.match(ui, /PRC License/);
  assert.match(ui, /Grooming specialties/);
  assert.match(ui, /Training specialties/);
  assert.match(ui, /Boarding Services/);
  assert.match(ui, /Assigned Logistics Area/);
  assert.match(ui, /Review Summary/);
});

test('role workspace edits inherited policies with staff counts and dependency-aware controls', () => {
  const ui = source('client/src/pages/admin/RoleManagement.js');
  const controller = source('controllers/rolePermissionController.js');
  assert.match(ui, /Policies apply to every employee assigned to that role/);
  assert.match(ui, /Apply to Entire Role/);
  assert.match(ui, /staffCount/);
  assert.match(ui, /disabling View clears dependent actions/);
  assert.match(ui, /disabled=\{disabled\}/);
  assert.match(controller, /countDocuments/);
});

test('staff profile keeps professional, performance, availability, and activity views together', () => {
  const ui = source('client/src/components/admin/SpecializedStaffProfileModal.js');
  for (const section of ['Professional', 'Performance', 'Availability', 'Booking Timeline', 'Staff Activity Timeline']) assert.match(ui, new RegExp(section));
  assert.match(ui, /Effective Permission Preview/);
});

test('workforce visibility recognizes current breaks without replacing assignment logic', () => {
  const staff = source('controllers/staffController.js');
  const dashboard = source('services/operationsDashboardService.js');
  const ui = source('client/src/pages/admin/StaffManagement.js');
  assert.match(staff, /currentAvailabilityStatus/);
  assert.match(staff, /return 'break'/);
  assert.match(dashboard, /onBreak:/);
  assert.match(ui, /Assignment Matrix/);
  assert.match(ui, /overloaded/i);
});

test('store settings organize existing systems without introducing duplicate persistence', () => {
  const ui = source('client/src/pages/admin/AdminSettings.js');
  for (const group of ['Business', 'Financial', 'Staff', 'Notifications', 'Appearance']) assert.match(ui, new RegExp(group));
  assert.match(ui, /to="\/admin\/roles"/);
  assert.match(ui, /to="\/admin\/store"/);
  assert.match(ui, /No duplicate notification switches/);
});

test('customer cards surface compact booking, policy, delivery, receipt, and care summaries', () => {
  const orders = source('client/src/pages/customer/Orders.js');
  const bookings = source('client/src/pages/customer/Bookings.js');
  const profile = source('client/src/pages/customer/Profile.js');
  assert.match(orders, /Receipt & Details/);
  assert.match(orders, /refundPolicyLabel/);
  assert.match(orders, /Delivery:/);
  for (const label of ['Specialist', 'Branch', 'Payment']) assert.match(bookings, new RegExp(label));
  assert.match(profile, /Upcoming booking/);
  assert.match(profile, /actionReminders/);
});

test('dashboard prioritizes today, this week, and owner quick actions from real data', () => {
  const ui = source('client/src/pages/admin/Dashboard.js');
  const service = source('services/operationsDashboardService.js');
  for (const label of ["Today's priorities", "This week's operations", 'Pending orders', 'Staff available', 'Inventory alerts', 'Add Staff', 'Role Management']) assert.match(ui, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(service, /pendingOrders:/);
  assert.match(service, /weekly:/);
  assert.match(service, /weekPaidOrders/);
});

test('protected authentication, tenant, payment, socket, and upload foundations remain wired', () => {
  assert.match(source('middleware/auth.js'), /attachStoreRolePolicy/);
  assert.match(source('middleware/storeAuth.js'), /store/);
  assert.match(source('controllers/paymentController.js'), /paymongo/i);
  assert.match(source('services/socketAuthorization.js'), /authenticateSocket/);
  assert.match(source('controllers/uploadController.js'), /ownership|owner/i);
});
