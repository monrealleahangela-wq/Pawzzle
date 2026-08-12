const test = require('node:test');
const assert = require('node:assert/strict');
const { getDeliveryStatusLabel, getDeliveryLinkStatus } = require('../utils/logistics');

test('preserves existing delivery lifecycle values while presenting clear labels', () => {
  assert.equal(getDeliveryStatusLabel('pending'), 'Pending Assignment');
  assert.equal(getDeliveryStatusLabel('picked_up'), 'Out for Delivery');
  assert.equal(getDeliveryStatusLabel('failed_attempt'), 'Delivery Attempted');
  assert.equal(getDeliveryStatusLabel('returned_to_store'), 'Failed');
});

test('derives link status from the existing secure link state', () => {
  assert.equal(getDeliveryLinkStatus({ status: 'pending', isLive: true, assignmentType: 'unassigned' }), 'not_generated');
  assert.equal(getDeliveryLinkStatus({ status: 'assigned', isLive: true, assignmentType: 'internal' }), 'active');
  assert.equal(getDeliveryLinkStatus({ status: 'assigned', isLive: true, assignmentType: 'internal', riderLinkOpenedAt: new Date() }), 'opened');
  assert.equal(getDeliveryLinkStatus({ status: 'delivered', isLive: false, assignmentType: 'internal' }), 'completed');
  assert.equal(getDeliveryLinkStatus({ status: 'cancelled', isLive: false, assignmentType: 'internal' }), 'inactive');
});
