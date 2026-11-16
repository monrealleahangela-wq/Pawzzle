const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('new and existing catalog products cannot bypass supplier-order receiving for stock', () => {
  const controller = read('controllers/productController.js');
  assert.match(controller, /requestedInitialStock !== 0[\s\S]*PURCHASE_ORDER_RECEIVING_REQUIRED/);
  assert.match(controller, /const initialStock = 0/);
  assert.match(controller, /Number\(req\.body\.stockQuantity\)[\s\S]*Number\(product\.stockQuantity \|\| 0\)/);
  assert.match(controller, /Stock is controlled by inventory receiving/);
});

test('the established selling unit and calculated availability are immutable catalog fields', () => {
  const controller = read('controllers/productController.js');
  const variantController = read('controllers/productVariantController.js');
  assert.match(controller, /PRODUCT_UNIT_LOCKED/);
  assert.match(controller, /INVENTORY_STATUS_CONTROLLED/);
  assert.match(controller, /delete updateData\.unit/);
  assert.match(controller, /delete updateData\.stockStatus/);
  assert.match(controller, /withPreservedEmbeddedVariantStock/);
  assert.match(variantController, /PRODUCT_UNIT_LOCKED/);
});

test('product editors omit inventory-controlled fields and display the actual selling unit', () => {
  const page = read('client/src/pages/admin/ProductInventory.js');
  const compactForm = read('client/src/components/forms/ProductFormModal.js');
  assert.match(page, /delete payload\.stockQuantity/);
  assert.match(page, /delete payload\.stockStatus/);
  assert.match(page, /delete payload\.unit/);
  assert.match(page, /aria-label="Stock Quantity" readOnly/);
  assert.match(page, /\{product\.stockQuantity \|\| 0\} \{product\.unit \|\| 'unit'\}/);
  assert.match(compactForm, /received supplier orders add stock/);
  assert.match(compactForm, /disabled=\{Boolean\(editingProduct\)\}/);
  assert.doesNotMatch(compactForm, /set\('stockQuantity'/);
  assert.match(page, /aria-label=\{`Variant \$\{i \+ 1\} stock`\} readOnly/);
});
