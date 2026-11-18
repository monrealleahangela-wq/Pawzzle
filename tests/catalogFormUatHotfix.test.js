const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Product = require('../models/Product');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('pet, product, and service forms share the compact card workflow', () => {
  const shared = read('client/src/components/forms/CompactEntityForm.js');
  const pet = read('client/src/components/pets/PetProfileFormModal.js');
  const product = read('client/src/components/forms/ProductFormModal.js');
  const service = read('client/src/components/forms/ServiceFormModal.js');

  for (const source of [pet, product, service]) {
    assert.match(source, /CompactFormModal/);
    assert.match(source, /CompactFormSection/);
    assert.match(source, /saveDisabled=/);
  }
  assert.match(shared, /sticky bottom-0/);
  assert.match(shared, /onDrop=/);
  assert.match(shared, /Uploading/);
});

test('compact product form keeps required fields and existing advanced behavior', () => {
  const form = read('client/src/components/forms/ProductFormModal.js');
  const page = read('client/src/pages/admin/ProductInventory.js');
  const controller = read('controllers/productController.js');

  for (const label of ['Product Image', 'Product Name', 'Category', 'Product Description', 'Price (₱)', 'Stock Quantity', 'Low Stock Threshold', 'Catalog Visibility']) {
    assert.ok(form.includes(label), `missing product form label: ${label}`);
  }
  assert.match(page, /showAdvancedProductEditor/);
  assert.match(page, /shortDescription: productForm\.shortDescription\?\.trim\(\) \|\|/);
  assert.match(page, /sku: productForm\.sku\?\.trim\(\) \|\|/);
  assert.match(controller, /const initialStock = 0/);
  assert.match(controller, /PURCHASE_ORDER_RECEIVING_REQUIRED/);
  assert.ok(Product.schema.path('barcode'));
  assert.ok(Product.schema.path('unit'));
});

test('compact service form exposes only primary details and the new price configuration', () => {
  const form = read('client/src/components/forms/ServiceFormModal.js');
  const page = read('client/src/pages/admin/ServiceManagement.js');

  for (const label of ['Primary Details', 'Service Name', 'Category', 'Duration', 'Service Description', 'Price Rules / Configuration', 'Price per Night', 'Minimum Stay', 'Maximum Stay']) {
    assert.ok(form.includes(label), `missing service form label: ${label}`);
  }
  for (const removed of ['Service Image', 'Specialist Requirements', 'Advanced options', 'Home service available']) {
    assert.doesNotMatch(form, new RegExp(removed, 'i'));
  }
  assert.match(form, /category\.id !== 'home_services'/);
  assert.match(form, /pricingBasis: boarding \? 'per_night' : 'fixed'/);
  assert.doesNotMatch(page, /if \(!formData\.images\?\.length\)/);
});
