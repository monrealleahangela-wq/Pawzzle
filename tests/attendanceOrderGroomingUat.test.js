const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { evaluateOrderTransition, normalizeOrderStatus } = require('../utils/orderLifecycle');
const { prepareServiceIntake } = require('../utils/bookingIntake');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('legacy order statuses normalize without reopening terminal orders', () => {
  assert.equal(normalizeOrderStatus('processing'), 'preparing');
  assert.equal(normalizeOrderStatus('finalized'), 'completed');
  assert.equal(evaluateOrderTransition({ currentStatus: 'confirmed', nextStatus: 'preparing' }).valid, true);
  assert.equal(evaluateOrderTransition({ currentStatus: 'delivered', nextStatus: 'preparing', allowRecovery: true }).valid, false);
  assert.equal(evaluateOrderTransition({ currentStatus: 'ready_for_pickup', nextStatus: 'preparing', allowRecovery: true }).valid, false);
  assert.equal(evaluateOrderTransition({ currentStatus: 'completed', nextStatus: 'preparing', allowRecovery: true }).valid, false);
});

test('a delivered linked Delivery blocks packing even when the Order status is stale', () => {
  const result = evaluateOrderTransition({
    currentStatus: 'confirmed',
    nextStatus: 'preparing',
    deliveryStatus: 'delivered',
    allowRecovery: true
  });
  assert.equal(result.valid, false);
  assert.equal(result.statusCode, 409);
  assert.match(result.message, /already past packing/i);
  assert.match(read('controllers/orderController.js'), /evaluateOrderTransition\(/);
});

test('grooming intake derives the package from the persisted Service and retains safety validation', () => {
  const service = { name: 'Full Grooming', category: 'grooming' };
  const valid = prepareServiceIntake(service, { details: { coatCondition: 'Healthy', behaviorConcern: 'no' } });
  assert.equal(valid.error, null);
  assert.equal(valid.value.details.groomingPackage, 'Full Grooming');
  assert.equal(valid.value.details.nailTrimming, undefined);
  assert.equal(valid.value.details.earCleaning, undefined);

  const invalid = prepareServiceIntake(service, { details: { nailTrimming: 'yes', earCleaning: 'yes' } });
  assert.match(invalid.error, /coat condition/i);
});

test('attendance displays use the shared formatter while exact minutes remain the submitted contract', () => {
  const admin = read('client/src/pages/admin/HRManagement.js');
  const staff = read('client/src/pages/staff/EmployeeHR.js');
  assert.match(admin, /formatDurationMinutes\(row\.workedMinutes\)/);
  assert.match(admin, /Number\(correction\[field\]\)/);
  assert.match(staff, /formatDurationMinutes\(attendance\.today\?\.workedMinutes \|\| 0\)/);
  assert.match(staff, /formatDurationMinutes\(slip\.attendanceSummary\?\.workedMinutes\)/);
});
