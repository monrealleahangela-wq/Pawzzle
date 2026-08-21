const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('seller navigation exposes supplier procurement and service supplies for legacy and service stores', () => {
  const layout = read('client/src/components/Layout.js');

  assert.match(layout, /\(hasProducts \|\| hasServices \|\| isStoreOwner\)/);
  assert.match(layout, /\/admin\/purchase-orders\?tab=suppliers[^\n]+Browse Suppliers/);
  assert.match(layout, /\/admin\/supplies[^\n]+Service Supplies/);
  assert.doesNotMatch(layout, /\/admin\/supplies[^\n]+Manage Suppliers/);
});

test('supplier navigation opens the existing supplier browser and provides manual inventory fallbacks', () => {
  const purchaseOrders = read('client/src/pages/admin/PurchaseOrders.js');

  assert.match(purchaseOrders, /useSearchParams/);
  assert.match(purchaseOrders, /searchParams\.get\('tab'\) === 'suppliers'/);
  assert.match(purchaseOrders, /Supplier accounts appear here after platform verification/);
  assert.match(purchaseOrders, /to="\/admin\/products"/);
  assert.match(purchaseOrders, /to="\/admin\/supplies"/);
});

test('service supplies can be entered without inventing or requiring a supplier account', () => {
  const supplyPage = read('client/src/pages/admin/SupplyManagement.js');
  const supplyModel = read('models/ServiceSupply.js');
  const supplierController = read('controllers/supplierController.js');

  assert.match(supplyPage, /A marketplace supplier is optional/);
  assert.match(supplyPage, /You do not need a verified marketplace supplier/);
  assert.match(supplyPage, /Supplier link optional/);
  assert.doesNotMatch(supplyModel, /supplier:\s*\{[^}]+required:\s*true/s);
  assert.match(supplierController, /status: 'verified', isActive: true, isDeleted: false/);
});
