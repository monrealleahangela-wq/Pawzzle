const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isSupplierManagedProduct,
  getDirectStockEditIssue
} = require('../utils/productStockPolicy');

test('Store-added simple products allow direct stock changes', () => {
  const product = { productMode: 'simple', stockQuantity: 3 };
  assert.equal(isSupplierManagedProduct(product), false);
  assert.equal(getDirectStockEditIssue({ product, requestedQuantity: 12 }), null);
  assert.equal(getDirectStockEditIssue({ product, requestedQuantity: 0 }), null);
});

test('supplier-sourced products require repurchase and receiving for stock changes', () => {
  const product = { productMode: 'simple', stockQuantity: 3, supplierProductRef: 'supplier-product-id' };
  assert.equal(isSupplierManagedProduct(product), true);
  assert.deepEqual(getDirectStockEditIssue({ product, requestedQuantity: 12 }), {
    code: 'PURCHASE_ORDER_RECEIVING_REQUIRED',
    message: 'Supplier-sourced stock cannot be edited manually. Repurchase this item and complete receiving inspection to update its stock.'
  });
  assert.equal(getDirectStockEditIssue({ product, requestedQuantity: 3 }), null);
});

test('variant stock remains ledger-controlled', () => {
  const issue = getDirectStockEditIssue({
    product: { productMode: 'variant', stockQuantity: 0 },
    requestedQuantity: 1
  });
  assert.equal(issue.code, 'VARIANT_LEDGER_ADJUSTMENT_REQUIRED');
});
