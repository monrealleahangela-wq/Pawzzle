const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MANUAL_RESTOCK_BLOCK_MESSAGE,
  resultingQuantity,
  manualRestockBlockReason
} = require('../utils/inventoryRestockingPolicy');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('manual adjustments cannot turn an out-of-stock product back into stocked inventory', () => {
  for (const request of [
    { currentQuantity: 0, operation: 'add', quantity: 1 },
    { currentQuantity: 0, operation: 'set', quantity: 12 }
  ]) {
    assert.equal(manualRestockBlockReason(request), MANUAL_RESTOCK_BLOCK_MESSAGE);
  }
  assert.equal(resultingQuantity({ currentQuantity: 0, operation: 'subtract', quantity: 3 }), 0);
  assert.equal(manualRestockBlockReason({ currentQuantity: 0, operation: 'set', quantity: 0 }), null);
  assert.equal(manualRestockBlockReason({ currentQuantity: 4, operation: 'add', quantity: 2 }), null);
});

test('all manual inbound inventory endpoints enforce supplier restocking at zero stock', () => {
  const inventoryController = read('controllers/inventoryController.js');
  const lotController = read('controllers/inventoryLotController.js');
  const productController = read('controllers/productController.js');

  assert.equal((inventoryController.match(/manualRestockBlockReason/g) || []).length >= 4, true);
  assert.match(lotController, /manualRestockBlockReason/);
  assert.match(productController, /manualRestockBlockReason/);
});

test('the out-of-stock action opens supplier restocking and receipt remains inspection-controlled', () => {
  const inventoryPage = read('client/src/pages/admin/ProductInventory.js');
  const purchaseOrdersPage = read('client/src/pages/admin/PurchaseOrders.js');
  const receivingController = read('controllers/purchaseOrderController.js');

  assert.match(inventoryPage, /Order New Stock/);
  assert.match(inventoryPage, /restockProduct=/);
  assert.match(purchaseOrdersPage, /restockProduct/);
  assert.match(purchaseOrdersPage, /setShowCheckout\(true\)/);
  assert.match(receivingController, /const applyReceivingItem[\s\S]*InventoryLedgerService\.receiveLot/);
  assert.match(receivingController, /The supplier must mark this purchase order delivered before inspection/);
});
