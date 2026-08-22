const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../client/src/pages/admin/ProductInventory.js'),
  'utf8'
);

test('stock modal explains each existing inventory operation in plain language', () => {
  assert.match(source, /Change Product Stock/);
  assert.match(source, /Add items, remove items, or correct the total count/);
  assert.match(source, /value: 'add', label: 'Add items'/);
  assert.match(source, /value: 'subtract', label: 'Remove items'/);
  assert.match(source, /value: 'set', label: 'Correct total'/);
  assert.doesNotMatch(source, /label: 'ADD STOCK'|label: 'REDUCE STOCK'|label: 'SET TOTAL'/);
});

test('stock modal prevents ambiguous quantities and previews the resulting total', () => {
  assert.match(source, /How many items are you adding\?/);
  assert.match(source, /How many items are you removing\?/);
  assert.match(source, /What is the correct total stock\?/);
  assert.match(source, /Stock after this update/);
  assert.match(source, /Current \{currentInventoryStock\} → New total \{projectedInventoryStock\}/);
  assert.match(source, /Number\.isInteger\(quantity\)/);
});

test('stock modal is responsive and accessible without changing inventory APIs', () => {
  assert.match(source, /role="dialog" aria-modal="true"/);
  assert.match(source, /grid grid-cols-1 sm:grid-cols-3/);
  assert.match(source, /aria-pressed=\{selected\}/);
  assert.match(source, /inventoryService\.updateQuantity/);
  assert.match(source, /inventoryService\.adminAddToInventory/);
});
