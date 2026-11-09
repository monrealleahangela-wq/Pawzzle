const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
const page = read('client/src/pages/admin/ProductInventory.js');
const routes = read('routes/inventory.js');
const controller = read('controllers/inventoryAdjustmentController.js');

test('compact stock modal separates supplier ordering from audited reductions', () => {
  assert.match(page, /Inventory action/);
  assert.match(page, /Order stock or report units that should be removed/);
  assert.match(page, /Need more stock\?/);
  assert.match(page, /Place a supplier order/);
  assert.match(page, /Report stock loss/);
  assert.doesNotMatch(page, /Add items, remove items, or correct the total count/);
  assert.doesNotMatch(page, /value: 'add', label: 'Add items'/);
  assert.match(page, /z-\[10000\]/);
  assert.match(page, /max-h-\[calc\(100dvh-1rem\)\]/);
  assert.match(page, /createPortal\(\(/);
  assert.match(page, /\), document\.body\)/);
  assert.match(page, /inventoryService\.adminGetInventory\(\{ page: 1, limit: 500 \}\)/);
  assert.match(page, /Loading inventory products/);
});

test('staff reductions require reason and evidence while owners retain an audit trail', () => {
  assert.match(page, /Explain what happened/);
  assert.match(page, /Evidence \{isStoreOwner \? '\(recommended\)' : '\(required\)'\}/);
  assert.match(page, /Submit for Approval/);
  assert.match(page, /Reduce Stock Now/);
  assert.match(controller, /cleanReason\.length < 8/);
  assert.match(controller, /!authority\.isOwner && cleanEvidence\.length === 0/);
  assert.match(controller, /Applied directly by the store owner/);
});

test('stock reductions have independent review and idempotent audit records', () => {
  assert.match(routes, /\/adjustment-requests/);
  assert.match(routes, /\/adjustment-requests\/:id\/review/);
  assert.match(controller, /You cannot review your own stock reduction request/);
  assert.match(controller, /quantity: \{ \$gte: request\.quantity \}/);
  assert.match(controller, /idempotencyKey: `inventory-adjustment:\$\{request\._id\}`/);
  assert.match(controller, /InventoryTransaction\.create/);
});
