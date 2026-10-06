const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  REPORTABLE_DELIVERY_STATUSES,
  isDeliveryConcernReportable,
  validateDeliveryConcern
} = require('../utils/deliveryConcerns');
const { hasPermission, normalizeRole } = require('../config/permissions');
const Delivery = require('../models/Delivery');
const Order = require('../models/Order');
const { submitStoreConcern } = require('../controllers/deliveryController');

const root = path.resolve(__dirname, '..');
const source = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const responseRecorder = () => {
  const result = { statusCode: 200, body: null };
  return {
    result,
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; }
  };
};

test('authoritative roles preserve narrow and management capabilities', () => {
  assert.equal(hasPermission({ role: 'service_staff' }, 'pets.manage'), false);
  assert.equal(hasPermission({ role: 'service_staff' }, 'bookings.view'), true);
  assert.equal(hasPermission({ role: 'procurement_officer' }, 'procurement.manage'), true);
  assert.equal(hasPermission({ role: 'manager' }, 'pets.manage'), true);
  assert.equal(hasPermission({ role: 'manager' }, 'staff.view'), true);
  assert.equal(hasPermission({ role: 'finance_staff' }, 'sales.view'), true);
  assert.equal(hasPermission({ role: 'finance_staff' }, 'pets.manage'), false);
  assert.equal(hasPermission({ role: 'cashier' }, 'sales.view'), true);
  assert.equal(normalizeRole({ role: 'staff', staffType: 'order_staff' }), 'cashier');
});

test('general admin routes require management or inventory capabilities', () => {
  assert.match(source('routes/adminPets.js'), /requirePermission\('pets\.manage', 'inventory\.view'\)/);
  assert.match(source('routes/adminProducts.js'), /requirePermission\('products\.manage', 'inventory\.view'\)/);
  assert.match(source('routes/customers.js'), /requirePermission\('customers\.manage'\)/);
  const staffRoutes = source('routes/staff.js');
  assert.match(staffRoutes, /router\.get\('\/', authenticate, adminOrStaff, requirePermission\('staff\.view', 'staff\.manage'\), getMyStaff\)/);
  assert.match(staffRoutes, /router\.post\('\/', authenticate, adminOrStaff, requirePermission\('staff\.manage'\), createStaff\)/);
  assert.match(source('client/src/pages/admin/StaffManagement.js'), /canManageStaff\?<StaffTable[\s\S]*:<ReadOnlyStaffTable/);
});

test('reportable delivery lifecycle starts at pickup and excludes premature states', () => {
  assert.deepEqual(REPORTABLE_DELIVERY_STATUSES, ['picked_up', 'in_transit', 'arrived', 'failed_attempt']);
  for (const status of REPORTABLE_DELIVERY_STATUSES) assert.equal(isDeliveryConcernReportable(status), true);
  for (const status of ['pending', 'unassigned', 'assigned', 'accepted', 'declined', 'delivered', 'returned_to_store', 'cancelled']) {
    assert.equal(isDeliveryConcernReportable(status), false, status);
  }
});

test('delivery concern payload is trimmed and allowlisted', () => {
  assert.deepEqual(validateDeliveryConcern({ type: 'damaged_items', content: '  damaged box  ' }), {
    value: { type: 'damaged_items', content: 'damaged box' }
  });
  assert.match(validateDeliveryConcern({ type: 'invented', content: 'x' }).error, /valid concern type/i);
  assert.match(validateDeliveryConcern({ type: 'other', content: ' '.repeat(3) }).error, /describe the concern/i);
  assert.match(validateDeliveryConcern({ type: 'other', content: 'x'.repeat(1001) }).error, /up to 1000/i);
});

test('concern routes authenticate customer and Store-scoped Seller mutations', () => {
  const routes = source('routes/delivery.js');
  const controller = source('controllers/deliveryController.js');
  const logistics = source('controllers/logisticsController.js');
  assert.match(routes, /post\('\/:deliveryId\/concerns', authenticate, requirePermission\('logistics\.manage'\), submitStoreConcern\)/);
  assert.match(routes, /post\('\/complaint\/:token', authenticate, submitComplaint\)/);
  assert.match(controller, /canOperateStore\(req\.user, storeId, \['logistics\.manage'\]\)/);
  assert.match(controller, /status: \{ \$in: REPORTABLE_DELIVERY_STATUSES \}/);
  assert.match(controller, /concernReporting = \{/);
  assert.match(logistics, /allowed: isDeliveryConcernReportable\(row\.status\)/);
});

test('Store A cannot report a concern against Store B delivery', async () => {
  const originalDeliveryFind = Delivery.findById;
  const originalOrderFind = Order.findById;
  try {
    Delivery.findById = () => ({ select: async () => ({ _id: 'delivery-1', status: 'picked_up', store: 'store-b', order: 'order-1' }) });
    Order.findById = () => ({ select: async () => ({ store: 'store-b' }) });
    const res = responseRecorder();
    await submitStoreConcern({
      params: { deliveryId: 'delivery-1' },
      body: { type: 'other', content: 'Package concern' },
      user: { _id: 'manager-a', role: 'manager', store: 'store-a' }
    }, res);
    assert.equal(res.result.statusCode, 403);
  } finally {
    Delivery.findById = originalDeliveryFind;
    Order.findById = originalOrderFind;
  }
});

test('backend rejects premature Seller concern reporting', async () => {
  const originalDeliveryFind = Delivery.findById;
  const originalOrderFind = Order.findById;
  try {
    Delivery.findById = () => ({ select: async () => ({ _id: 'delivery-1', status: 'assigned', store: 'store-a', order: 'order-1' }) });
    Order.findById = () => ({ select: async () => ({ store: 'store-a' }) });
    const res = responseRecorder();
    await submitStoreConcern({
      params: { deliveryId: 'delivery-1' },
      body: { type: 'other', content: 'Too early' },
      user: { _id: 'manager-a', role: 'manager', store: 'store-a' }
    }, res);
    assert.equal(res.result.statusCode, 409);
  } finally {
    Delivery.findById = originalDeliveryFind;
    Order.findById = originalOrderFind;
  }
});

test('backend accepts a valid Store-scoped concern in a reportable state', async () => {
  const originalDeliveryFind = Delivery.findById;
  const originalDeliveryUpdate = Delivery.findOneAndUpdate;
  const originalOrderFind = Order.findById;
  try {
    Delivery.findById = () => ({ select: async () => ({ _id: 'delivery-1', status: 'in_transit', store: 'store-a', order: 'order-1' }) });
    Delivery.findOneAndUpdate = async query => ({ _id: query._id });
    Order.findById = () => ({ select: async () => ({ store: 'store-a' }) });
    const res = responseRecorder();
    await submitStoreConcern({
      params: { deliveryId: 'delivery-1' },
      body: { type: 'suspicious_location', content: 'Unexpected route' },
      user: { _id: 'manager-a', role: 'manager', store: 'store-a' }
    }, res);
    assert.equal(res.result.statusCode, 201);
    assert.equal(res.result.body.success, true);
  } finally {
    Delivery.findById = originalDeliveryFind;
    Delivery.findOneAndUpdate = originalDeliveryUpdate;
    Order.findById = originalOrderFind;
  }
});

test('Seller live-map and concern UI use authenticated, non-overlapping flows', () => {
  const orderDetail = source('client/src/pages/customer/OrderDetail.js');
  const tracking = source('client/src/pages/DeliveryTracking.js');
  assert.match(orderDetail, /navigate\(`\/admin\/logistics\/\$\{response\.data\.delivery\._id\}`\)/);
  assert.match(orderDetail, /deliveryAssignment\?\.concernReporting\?\.allowed === true/);
  assert.match(tracking, /user\?\.role === 'customer' && delivery\?\.concernReporting\?\.allowed === true/);
  assert.doesNotMatch(tracking, /complaintOpen&&<div className="fixed inset-0/);
  assert.match(tracking, /<DeliveryConcernForm/);
});

test('affected Order and reassignment actions no longer use native confirmation', () => {
  for (const file of [
    'client/src/pages/admin/Orders.js',
    'client/src/pages/customer/OrderDetail.js',
    'client/src/pages/admin/LogisticsDetail.js'
  ]) {
    assert.doesNotMatch(source(file), /window\.confirm|(?<![\w.])confirm\s*\(/, file);
    assert.match(source(file), /ConfirmationDialog/, file);
  }
});

test('automatic Rider assignment remains server-selected with readiness output', () => {
  const assignment = source('services/deliveryAssignmentService.js');
  const orderDetail = source('client/src/pages/customer/OrderDetail.js');
  assert.match(assignment, /capacityHasRoomForParcel/);
  assert.match(assignment, /capacityReservation/);
  assert.match(orderDetail, /assignmentReadiness/);
  assert.doesNotMatch(orderDetail, /selectedRider|riderId:\s*selected/);
});
