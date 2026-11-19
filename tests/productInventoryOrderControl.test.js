const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('new products accept opening stock while later catalog edits cannot overwrite inventory', () => {
  const controller = read('controllers/productController.js');
  const adminRoutes = read('routes/adminProducts.js');
  assert.match(controller, /const initialStock = Number\(req\.body\.stockQuantity \?\? 0\)/);
  assert.match(controller, /Number\.isInteger\(initialStock\)[\s\S]*INVALID_INITIAL_STOCK/);
  assert.match(controller, /stockQuantity: initialStock/);
  assert.match(controller, /initializeInventoryForProduct\(product\._id, storeId, initialStock\)/);
  assert.match(controller, /Inventory\.deleteOne[\s\S]*Product\.deleteOne[\s\S]*throw inventoryError/);
  assert.match(adminRoutes, /body\('stockQuantity'\)\.optional\(\)\.isInt\(\{ min: 0 \}\)/);
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

test('product editors accept opening stock but omit inventory-controlled fields during later edits', () => {
  const page = read('client/src/pages/admin/ProductInventory.js');
  const compactForm = read('client/src/components/forms/ProductFormModal.js');
  assert.match(page, /delete payload\.stockQuantity/);
  assert.match(page, /delete payload\.stockStatus/);
  assert.match(page, /delete payload\.unit/);
  assert.match(page, /aria-label="Stock Quantity" required=\{!editingProduct\}[\s\S]*readOnly=\{Boolean\(editingProduct\)\}/);
  assert.match(page, /\{product\.stockQuantity \|\| 0\} \{product\.unit \|\| 'unit'\}/);
  assert.match(compactForm, /This becomes the opening inventory balance/);
  assert.match(compactForm, /readOnly=\{Boolean\(editingProduct\)\}/);
  assert.match(compactForm, /disabled=\{Boolean\(editingProduct\)\}/);
  assert.match(compactForm, /set\('stockQuantity'/);
  assert.match(page, /aria-label=\{`Variant \$\{i \+ 1\} stock`\} readOnly/);
});
