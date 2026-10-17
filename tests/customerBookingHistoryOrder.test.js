const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const controller = fs.readFileSync(
  path.join(__dirname, '..', 'controllers', 'bookingController.js'),
  'utf8'
);

test('customer booking history is globally ordered newest-first before pagination', () => {
  const start = controller.indexOf('const getCustomerBookings = async');
  const end = controller.indexOf('// Get bookings for a store', start);
  const handler = controller.slice(start, end);

  const sortPosition = handler.indexOf('.sort({ createdAt: -1, _id: -1 })');
  const skipPosition = handler.indexOf('.skip(skip)');

  assert.ok(sortPosition >= 0, 'customer booking history must sort by transaction creation time');
  assert.ok(skipPosition > sortPosition, 'newest-first ordering must be applied before pagination');
  assert.doesNotMatch(handler, /\.sort\(\{ bookingDate: -1, startTime: -1 \}\)/);
});
