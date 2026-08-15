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
  assert.match(controller, /stockQuantity: initialStock/);
  assert.ok(Product.schema.path('barcode'));
  assert.ok(Product.schema.path('unit'));
});

test('compact service form requires media and filters specialist choices by service category', () => {
  const form = read('client/src/components/forms/ServiceFormModal.js');
  const page = read('client/src/pages/admin/ServiceManagement.js');

  for (const label of ['Service Image', 'Service Name', 'Category', 'Duration', 'Service Description', 'Specialist Requirements', 'Base Price (₱)', 'Availability']) {
    assert.ok(form.includes(label), `missing service form label: ${label}`);
  }
  assert.match(form, /health_wellness: \['veterinarian', 'veterinary_technician', 'veterinary_assistant'\]/);
  assert.match(form, /grooming: \['groomer'\]/);
  assert.match(form, /training: \['trainer'\]/);
  assert.match(form, /boarding_hotel: \['boarding_staff'\]/);
  assert.match(page, /showAdvancedServiceEditor/);
  assert.match(page, /if \(!formData\.images\?\.length\)/);
});
