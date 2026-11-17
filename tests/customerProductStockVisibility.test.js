const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Inventory = require('../models/Inventory');
const {
  buildCustomerProductStockFilter,
  hasCustomerAvailableStock
} = require('../services/customerProductAvailabilityService');

const source = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

test('customer product stock filter excludes zero-stock simple products before pagination', async () => {
  const filter = await buildCustomerProductStockFilter({ variantBrowsingEnabled: false });
  assert.deepEqual(filter, {
    $or: [{ productMode: { $ne: 'variant' }, stockQuantity: { $gt: 0 } }]
  });

  const controller = source('controllers/productController.js');
  assert.ok(controller.indexOf('buildCustomerProductStockFilter') < controller.indexOf('Product.find(filter)'));
  assert.match(controller, /filter\.\$and\.push\(await buildCustomerProductStockFilter/);
  assert.match(controller, /Product\.countDocuments\(filter\)/);
});

test('variant listings require an active inventory balance with unreserved stock', async () => {
  const originalDistinct = Inventory.distinct;
  let capturedFilter;
  Inventory.distinct = async (field, filter) => {
    assert.equal(field, 'product');
    capturedFilter = filter;
    return ['507f1f77bcf86cd799439011'];
  };

  try {
    const filter = await buildCustomerProductStockFilter({
      storeIds: ['507f1f77bcf86cd799439012'],
      variantBrowsingEnabled: true
    });
    assert.deepEqual(filter.$or[1], {
      productMode: 'variant',
      _id: { $in: ['507f1f77bcf86cd799439011'] }
    });
    assert.deepEqual(capturedFilter.productVariant, { $type: 'objectId' });
    assert.equal(capturedFilter.isActive, true);
    assert.deepEqual(capturedFilter.$expr, {
      $gt: [
        { $ifNull: ['$quantity', 0] },
        { $ifNull: ['$reservedQuantity', 0] }
      ]
    });
  } finally {
    Inventory.distinct = originalDistinct;
  }
});

test('customer availability rejects depleted simple and variant products', () => {
  assert.equal(hasCustomerAvailableStock({ productMode: 'simple', stockQuantity: 0 }), false);
  assert.equal(hasCustomerAvailableStock({ productMode: 'simple', stockQuantity: 1 }), true);
  assert.equal(hasCustomerAvailableStock({ productMode: 'variant' }, [
    { inStock: false, availableQuantity: 0 },
    { inStock: true, availableQuantity: 0 }
  ]), false);
  assert.equal(hasCustomerAvailableStock({ productMode: 'variant' }, [
    { inStock: true, availableQuantity: 2 }
  ]), true);

  const controller = source('controllers/productController.js');
  assert.match(controller, /product\.productMode !== 'variant' && !hasCustomerAvailableStock\(product\)/);
  assert.match(controller, /!catalog\.browsingEnabled \|\| !hasCustomerAvailableStock\(product, catalog\.variants\)/);
});

test('store pages and customer home apply the same stock filter', () => {
  const storeController = source('controllers/storeController.js');
  const publicController = source('controllers/publicController.js');

  assert.match(storeController, /const \{ buildCustomerProductStockFilter \} = require\('\.\.\/services\/customerProductAvailabilityService'\)/);
  assert.equal((storeController.match(/\$and: \[productStockFilter\]/g) || []).length, 2);
  assert.match(storeController, /const getStoreById[\s\S]*?buildCustomerProductStockFilter\(\{[\s\S]*?storeIds: \[store\._id\]/);
  assert.match(storeController, /const getStoreDetails[\s\S]*?buildCustomerProductStockFilter\(\{[\s\S]*?storeIds: \[store\._id\]/);

  assert.match(publicController, /const \{ buildCustomerProductStockFilter \} = require\('\.\.\/services\/customerProductAvailabilityService'\)/);
  assert.match(publicController, /publicProductFilter = \{[\s\S]*?\$and: \[productStockFilter\]/);
  assert.match(publicController, /Product\.countDocuments\(publicProductFilter\)/);
  assert.match(publicController, /\.select\('name price images category stockQuantity productMode store'\)/);
});
