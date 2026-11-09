const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const InventoryAdjustmentRequest = require('../models/InventoryAdjustmentRequest');

const objectId = () => new mongoose.Types.ObjectId();
const validRequest = overrides => new InventoryAdjustmentRequest({
  store: objectId(),
  inventory: objectId(),
  product: objectId(),
  adjustmentType: 'damage',
  quantity: 2,
  stockBefore: 10,
  stockAfter: 8,
  reason: 'Two packages were damaged by water.',
  evidence: [{ url: 'https://example.test/evidence.jpg', originalName: 'evidence.jpg' }],
  requestedBy: objectId(),
  ...overrides
});

test('stock reduction request accepts an auditable valid record', () => {
  assert.equal(validRequest().validateSync(), undefined);
});

test('stock reduction request rejects missing reasons and invalid quantities', () => {
  const error = validRequest({ reason: '', quantity: 0 }).validateSync();
  assert.ok(error.errors.reason);
  assert.ok(error.errors.quantity);
});

test('stock reduction request preserves pending review as its default state', () => {
  const request = validRequest();
  assert.equal(request.status, 'pending');
  assert.equal(request.evidence.length, 1);
});
