const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { normalizeInspectionItem } = require('../utils/procurementCart');
const {
  mapSupplierCategoryToStoreCategory,
  getStoreProductCompatibilityIssue,
  assertStoreProductCompatible,
  buildDraftStoreProduct
} = require('../utils/procurementProductLinking');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
const id = () => new mongoose.Types.ObjectId();

test('supplier categories map to the supported Store catalog without inventing unknown categories', () => {
  assert.equal(mapSupplierCategoryToStoreCategory('pet_food'), 'Pet Food');
  assert.equal(mapSupplierCategoryToStoreCategory('pet_treats'), 'Pet Food');
  assert.equal(mapSupplierCategoryToStoreCategory('grooming_supplies'), 'Pet Accessories');
  assert.equal(mapSupplierCategoryToStoreCategory('medical_supplies'), 'Pet Health Care');
  assert.equal(mapSupplierCategoryToStoreCategory('general_product'), 'Others');
  assert.equal(mapSupplierCategoryToStoreCategory('unsupported-category'), null);
});

test('existing product linking enforces Store scope, active lifecycle, supplier identity, and category compatibility', () => {
  const store = id();
  const supplierProduct = { _id: id(), category: 'pet_food' };
  const valid = { _id: id(), store, category: 'Pet Food', isActive: true, isDeleted: false };
  assert.equal(getStoreProductCompatibilityIssue({ storeProduct: valid, supplierProduct, storeId: store }), null);
  assert.match(getStoreProductCompatibilityIssue({ storeProduct: { ...valid, store: id() }, supplierProduct, storeId: store }), /another Store/);
  assert.match(getStoreProductCompatibilityIssue({ storeProduct: { ...valid, isActive: false }, supplierProduct, storeId: store }), /archived or inactive/);
  assert.match(getStoreProductCompatibilityIssue({ storeProduct: { ...valid, category: 'Pet Health Care' }, supplierProduct, storeId: store }), /incompatible/);
  assert.match(getStoreProductCompatibilityIssue({ storeProduct: { ...valid, supplierProductRef: id() }, supplierProduct, storeId: store }), /different supplier item/);
  assert.throws(() => assertStoreProductCompatible({ storeProduct: { ...valid, store: id() }, supplierProduct, storeId: store }), error => error.statusCode === 409);
});

test('first-time receiving creates a valid zero-stock unpublished draft from explicit seller fields', () => {
  const supplierProduct = {
    _id: id(),
    name: 'petsup',
    sku: 'SUPPLIER-SKU',
    category: 'accessories',
    description: 'Supplier description',
    images: ['https://example.test/supplier-image.jpg'],
    retailPrice: 99,
    brand: 'Supplier Brand'
  };
  const productData = buildDraftStoreProduct({
    supplierProduct,
    supplierId: id(),
    storeId: id(),
    userId: id(),
    input: {
      name: 'Store petsup',
      category: 'Pet Accessories',
      description: 'Seller-confirmed description',
      shortDescription: 'Seller-confirmed short description',
      price: 120,
      sku: 'STORE-SKU',
      unit: 'pack'
    }
  });

  assert.equal(productData.visibility, 'draft');
  assert.equal(productData.stockQuantity, 0);
  assert.equal(productData.stockStatus, 'out_of_stock');
  assert.equal(productData.price, 120);
  assert.equal(productData.sku, 'STORE-SKU');
  assert.deepEqual(productData.images, supplierProduct.images);
  assert.equal(String(productData.supplierProductRef), String(supplierProduct._id));
  assert.equal(new Product(productData).validateSync(), undefined);
});

test('draft creation refuses to infer required Store price, SKU, description, or selling unit', () => {
  const supplierProduct = { _id: id(), sku: 'SUPPLIER-SKU', retailPrice: 50, description: 'Supplier text', images: [] };
  const base = { supplierProduct, supplierId: id(), storeId: id(), userId: id() };
  assert.throws(() => buildDraftStoreProduct({ ...base, input: { name: 'petsup', category: 'Others', description: 'Description', shortDescription: 'Short', unit: 'piece' } }), /Selling price/);
  assert.throws(() => buildDraftStoreProduct({ ...base, input: { name: 'petsup', category: 'Others', description: 'Description', shortDescription: 'Short', price: 50, unit: 'piece' } }), /Store SKU/);
  assert.throws(() => buildDraftStoreProduct({ ...base, input: { name: 'petsup', category: 'Others', shortDescription: 'Short', price: 50, sku: 'STORE', unit: 'piece' } }), /description/);
  assert.throws(() => buildDraftStoreProduct({ ...base, input: { name: 'petsup', category: 'Others', description: 'Description', shortDescription: 'Short', price: 50, sku: 'STORE' } }), /selling unit/);
});

test('receiving quantities continue to accept only verified good units for partial and damaged deliveries', () => {
  const orderItem = { _id: id(), productName: 'petsup', quantity: 3, itemType: 'pet_supply' };
  const partial = normalizeInspectionItem({ orderItem, submitted: { receivedQuantity: 3, damagedQuantity: 1, incorrectQuantity: 1 } });
  assert.equal(partial.acceptedQuantity, 1);
  assert.equal(partial.missingQuantity, 0);
  assert.equal(partial.condition, 'mixed');
  assert.throws(() => normalizeInspectionItem({ orderItem, submitted: { receivedQuantity: 3, damagedQuantity: 2, incorrectQuantity: 2 } }), /Invalid receiving quantities/);
});

test('receiving link routes enforce permissions and creation requires separate product authority', () => {
  const routes = read('routes/purchaseOrders.js');
  assert.match(routes, /receiving-product-links'[\s\S]*requirePermission\('procurement\.view', 'procurement\.manage', 'inventory\.receive'\)/);
  assert.match(routes, /items\/:itemId\/store-product'[\s\S]*linkReceivingStoreProduct/);
  assert.match(routes, /items\/:itemId\/store-product'[\s\S]*requirePermission\('products\.manage', 'inventory\.adjust'\)[\s\S]*createReceivingStoreProduct/);
});

test('linking, first-time creation, and final receipt remain Store-scoped and transactionally idempotent', () => {
  const controller = read('controllers/purchaseOrderController.js');
  const ledger = read('services/inventoryLedgerService.js');
  const link = controller.match(/const linkReceivingStoreProduct[\s\S]*?const createReceivingStoreProduct/)?.[0] || '';
  const create = controller.match(/const createReceivingStoreProduct[\s\S]*?const parseInspectionItems/)?.[0] || '';
  const apply = controller.match(/const applyReceivingItem[\s\S]*?const submitReceivingInspection/)?.[0] || '';

  assert.match(link, /canOperateStore\(req\.user, inspectedOrder\.store/);
  assert.match(link, /Product\.findOne\(\{[\s\S]*store: order\.store/);
  assert.match(link, /assertStoreProductCompatible/);
  assert.match(link, /mongoose\.connection\.transaction/);
  assert.match(create, /supplierProductRef: orderItem\.supplierProduct\._id/);
  assert.match(create, /Product\.create\(\[productData\], \{ session \}\)/);
  assert.match(create, /orderItem\.storeProduct = product\._id/);
  assert.match(create, /order\.save\(\{ session \}\)/);
  assert.match(apply, /currentQuantity \+ Number\(reportItem\.acceptedQuantity\) > maximumQuantity/);
  assert.match(apply, /idempotencyKey/);
  assert.match(ledger, /InventoryTransaction\.findOne\(\{ idempotencyKey \}\)/);
  assert.match(ledger, /InventoryTransaction\.create/);
});

test('draft receiving products are excluded from customer discovery, detail, ordering, payment, and DSS suggestions', () => {
  const productController = read('controllers/productController.js');
  const publicController = read('controllers/publicController.js');
  const storeController = read('controllers/storeController.js');
  const orderController = read('controllers/orderController.js');
  const paymentController = read('controllers/paymentController.js');
  const dssController = read('controllers/dssController.js');

  assert.match(productController, /filter\.visibility = \{ \$nin: \['draft', 'hidden'\] \}/);
  assert.match(productController, /\['draft', 'hidden'\]\.includes\(product\.visibility\)/);
  assert.match(publicController, /visibility: \{ \$nin: \['draft', 'hidden'\] \}/);
  assert.equal((storeController.match(/visibility: \{ \$nin: \['draft', 'hidden'\] \}/g) || []).length >= 2, true);
  assert.match(orderController, /\['draft', 'hidden'\]\.includes\(itemDoc\.visibility\)/);
  assert.match(paymentController, /\['draft', 'hidden'\]\.includes\(current\.visibility\)/);
  assert.match(dssController, /visibility: \{ \$nin: \['draft', 'hidden'\] \}/);
});

test('inspection UI exposes both receiving paths and keeps the draft in parent state while linking', () => {
  const component = read('client/src/components/procurement/ReceivingInspectionModal.js');
  const page = read('client/src/pages/admin/PurchaseOrders.js');
  const service = read('client/src/services/apiService.js');
  assert.match(component, /Create New Store Product/);
  assert.match(component, /setForm\(previous =>/);
  assert.match(component, /Your inspection draft was preserved/);
  assert.match(component, /unpublished draft/);
  assert.match(page, /<ReceivingInspectionModal/);
  assert.match(service, /getReceivingProductLinks/);
  assert.match(service, /linkReceivingStoreProduct/);
  assert.match(service, /createReceivingStoreProduct/);
});
