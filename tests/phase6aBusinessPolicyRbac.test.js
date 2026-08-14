const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET ||= 'test-only-jwt-secret';

const Store = require('../models/Store');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { normalizeRefundPolicy, snapshotRefundPolicy, requiresAcknowledgment } = require('../utils/refundPolicy');
const { hasPermission, normalizeRole } = require('../config/permissions');
const { EDITABLE_ROLES, sanitizeRolePermissions, defaultPolicyForRole } = require('../services/rolePermissionService');

const root = path.resolve(__dirname, '..');
const source = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('stores own isolated refund policies, role policies, and atomic staff sequences', () => {
  assert.ok(Store.schema.path('refundPolicy.type'));
  assert.ok(Store.schema.path('refundPolicy.auditLog'));
  assert.ok(Store.schema.path('rolePermissions'));
  assert.ok(Store.schema.path('staffSequence'));
});

test('refund policy normalizes safely and only no-refund requires acknowledgment', () => {
  assert.equal(normalizeRefundPolicy({ type: 'full_refund' }).type, 'full_refund');
  assert.equal(normalizeRefundPolicy({ type: 'invalid' }).type, 'conditional_refund');
  assert.equal(requiresAcknowledgment({ type: 'conditional_refund' }), false);
  assert.equal(requiresAcknowledgment({ type: 'no_refund' }), true);
  const captured = snapshotRefundPolicy({ type: 'no_refund', summary: 'Final sale.' }, new Date('2026-08-14T00:00:00.000Z'));
  assert.equal(captured.summary, 'Final sale.');
  assert.equal(captured.capturedAt.toISOString(), '2026-08-14T00:00:00.000Z');
});

test('orders and bookings preserve transaction-time refund policy and acknowledgment evidence', () => {
  for (const model of [Order, Booking]) {
    assert.ok(model.schema.path('refundPolicySnapshot.type'));
    assert.ok(model.schema.path('refundPolicySnapshot.capturedAt'));
    assert.ok(model.schema.path('refundPolicyAcknowledgment.acknowledged'));
    assert.ok(model.schema.path('refundPolicyAcknowledgment.acknowledgedBy'));
  }
});

test('checkout, booking confirmation, and PayMongo session creation enforce the same no-refund gate', () => {
  assert.match(source('controllers/orderController.js'), /requiresAcknowledgment\(refundPolicy\)/);
  assert.match(source('controllers/bookingController.js'), /requiresAcknowledgment\(refundPolicy\)/);
  const payment = source('controllers/paymentController.js');
  assert.ok((payment.match(/requiresAcknowledgment\(/g) || []).length >= 2);
  assert.match(source('client/src/pages/customer/Checkout.js'), /refundPolicyAcknowledged/);
  assert.match(source('client/src/pages/customer/Bookings.js'), /refundPolicyAcknowledged/);
});

test('role policies override account-level permission objects and explicit deny wins', () => {
  const user = {
    role: 'staff', staffType: 'service_staff',
    permissions: { finance: { manage: true } },
    rolePolicyPermissions: { bookings: { view: false, update: true } }
  };
  assert.equal(normalizeRole(user), 'service_staff');
  assert.equal(hasPermission(user, 'bookings.view'), false);
  assert.equal(hasPermission(user, 'bookings.update'), true);
  assert.equal(hasPermission(user, 'finance.manage'), false);
});

test('editable role catalog contains only supported operational roles', () => {
  assert.deepEqual(EDITABLE_ROLES, [
    'manager', 'service_staff', 'cashier', 'inventory_staff', 'procurement_officer',
    'finance_staff', 'veterinarian', 'groomer', 'trainer', 'boarding_staff',
    'delivery_dispatcher', 'delivery_rider'
  ]);
  assert.equal(EDITABLE_ROLES.includes('customer'), false);
  assert.equal(EDITABLE_ROLES.includes('supplier'), false);
  assert.equal(EDITABLE_ROLES.includes('administrative_support'), false);
});

test('role permission sanitation rejects unknown resources and preserves explicit denial', () => {
  const clean = sanitizeRolePermissions({ bookings: { view: true, cancel: false, eraseDatabase: true }, unknown: { manage: true } });
  assert.deepEqual(clean, { bookings: { view: true, cancel: false } });
  assert.equal(defaultPolicyForRole('service_staff').bookings.view, true);
});

test('role endpoints are protected by existing admin middleware and store-scoped controller resolution', () => {
  const routes = source('routes/staff.js');
  assert.ok(routes.indexOf("router.get('/roles'") > routes.indexOf('router.use(authenticate, adminOnly)'));
  assert.ok(routes.indexOf("router.put('/roles/:role'") > routes.indexOf('router.use(authenticate, adminOnly)'));
  const controller = source('controllers/rolePermissionController.js');
  assert.match(controller, /Store\.findOne\(\{ owner: req\.user\._id/);
  assert.match(controller, /store\.rolePermissions/);
  assert.match(controller, /rolePermissionsUpdated/);
});

test('staff IDs are allocated atomically and manual IDs are overwritten on creation', () => {
  const controller = source('controllers/staffController.js');
  assert.match(controller, /findOneAndUpdate\(\{ _id: storeId \}, \{ \$inc: \{ staffSequence: 1 \} \}/);
  assert.match(controller, /`STF-\$\{String\(store\.staffSequence\)\.padStart\(4, '0'\)\}`/);
  assert.match(controller, /normalizedProfessionalProfile\.staffId = generatedStaffId/);
  assert.match(controller, /staff\.professionalProfile = normalizedProfessionalProfile/);
});

test('staff archive and restore preserve history while permanent deletion requires a phrase', () => {
  assert.ok(User.schema.path('archivedAt'));
  assert.ok(User.schema.path('archivedBy'));
  assert.ok(User.schema.path('staffStatus').enumValues.includes('archived'));
  const controller = source('controllers/staffController.js');
  assert.match(controller, /staff\.staffStatus = 'archived'/);
  assert.match(controller, /staff\.isDeleted = true/);
  assert.match(controller, /req\.body\.confirmation !== 'PERMANENTLY DELETE'/);
  assert.match(controller, /historical (relationships remain|business records were preserved)/i);
});

test('staff management UI uses the wizard, operational roles, assignment matrix, and no individual permission editor', () => {
  const ui = source('client/src/pages/admin/StaffManagement.js');
  assert.match(ui, /Step \{step\} of 3/);
  assert.match(ui, /Assignment Matrix/);
  assert.match(ui, /Archive staff member/);
  assert.match(ui, /Permissions are inherited/);
  assert.doesNotMatch(ui, /PermissionsManager/);
  assert.doesNotMatch(ui, /administrative_support|sales_staff|logistics_staff/);
});

test('store dashboard includes workforce availability, workload, distribution, verification, leave, and role-policy summaries', () => {
  const service = source('services/operationsDashboardService.js');
  for (const field of ['available', 'busy', 'onLeave', 'pendingVerification', 'activeWorkload', 'distribution', 'configuredRolePolicies']) {
    assert.match(service, new RegExp(`${field}:`));
  }
  assert.match(service, /upcomingLeave,/);
  const dashboard = source('client/src/pages/admin/Dashboard.js');
  assert.match(dashboard, /Workforce operations/);
  assert.match(dashboard, /Configured role policies/);
});

test('Phase 1 and Phase 2 security boundaries remain wired into requests and sockets', () => {
  assert.match(source('middleware/auth.js'), /attachStoreRolePolicy/);
  assert.match(source('services/socketAuthorization.js'), /attachStoreRolePolicy/);
  assert.match(source('utils/authSecurity.js'), /pickProfileUpdates/);
  assert.match(source('middleware/authRateLimit.js'), /createRateLimiter/);
  assert.match(source('controllers/paymentController.js'), /paymongo/i);
});
