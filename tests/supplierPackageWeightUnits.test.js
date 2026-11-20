const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const SupplierProduct = require('../models/SupplierProduct');
const { normalizeSupplierPackageWeight } = require('../controllers/supplierController');

const productData = overrides => ({
  supplier: new mongoose.Types.ObjectId(),
  name: 'Packaged food',
  sku: `WEIGHT-${new mongoose.Types.ObjectId()}`,
  category: 'accessories',
  wholesalePrice: 100,
  availableStock: 10,
  ...overrides
});

test('supplier products retain an explicit package-weight unit and default legacy records to grams', () => {
  const kilograms = new SupplierProduct(productData({ weight: 1.5, weightUnit: 'kg' }));
  const legacyGrams = new SupplierProduct(productData({ weight: 800 }));
  const unsupported = new SupplierProduct(productData({ weight: 16, weightUnit: 'oz' }));

  assert.equal(kilograms.validateSync(), undefined);
  assert.equal(kilograms.weight, 1.5);
  assert.equal(kilograms.weightUnit, 'kg');
  assert.equal(legacyGrams.weightUnit, 'g');
  assert.match(unsupported.validateSync().errors.weightUnit.message, /not a valid enum value/i);
});

test('supplier package-weight input accepts only positive grams or kilograms', () => {
  assert.deepEqual(normalizeSupplierPackageWeight('800', 'g'), { weight: 800, weightUnit: 'g' });
  assert.deepEqual(normalizeSupplierPackageWeight('1.25', 'KG'), { weight: 1.25, weightUnit: 'kg' });
  assert.deepEqual(normalizeSupplierPackageWeight('', 'kg'), { weight: undefined, weightUnit: 'kg' });
  assert.throws(() => normalizeSupplierPackageWeight(0, 'g'), /greater than zero/i);
  assert.throws(() => normalizeSupplierPackageWeight(16, 'oz'), /grams.*kilograms/i);
});

test('supplier UI and purchase orders preserve the selected measurement', () => {
  const dashboard = fs.readFileSync(path.join(__dirname, '../client/src/pages/supplier/SupplierDashboard.js'), 'utf8');
  const purchaseOrders = fs.readFileSync(path.join(__dirname, '../controllers/purchaseOrderController.js'), 'utf8');

  assert.match(dashboard, /aria-label="Package weight unit"/);
  assert.match(dashboard, /<option value="g">Grams \(g\)<\/option>/);
  assert.match(dashboard, /<option value="kg">Kilograms \(kg\)<\/option>/);
  assert.match(dashboard, /productPayload\.weightUnit = productForm\.weightUnit \|\| 'g'/);
  assert.match(purchaseOrders, /product\.weightUnit \|\| 'g'/);
});
