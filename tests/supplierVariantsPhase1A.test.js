const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const SkuClaim = require('../models/SkuClaim');
const SupplierProduct = require('../models/SupplierProduct');
const SupplierProductVariant = require('../models/SupplierProductVariant');
const Supplier = require('../models/Supplier');
const { __test, listSupplierVariants } = require('../controllers/supplierVariantController');
const { getSupplierVariantReadiness, indexMatches } = require('../services/supplierVariantReadinessService');
const { makeActiveKey } = require('../services/skuClaimService');
const { isSupplierProductPublished, withPublishedSupplierProduct } = require('../utils/supplierProductApproval');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
const objectId = () => new mongoose.Types.ObjectId();
const validVariant = overrides => ({
  attributes: [{ code: 'flavor', label: 'Flavor', valueCode: 'chicken', valueLabel: 'Chicken' }],
  sku: 'FOOD-CHICKEN-1KG',
  wholesalePrice: 120,
  availableStock: 10,
  minimumOrderQuantity: 1,
  unitOfMeasure: 'bag',
  weight: 1,
  weightUnit: 'kg',
  ...overrides
});

test('supplier variant input validates structured commercial values', () => {
  const value = __test.validateVariantInput(validVariant());
  assert.equal(value.sku, 'FOOD-CHICKEN-1KG');
  assert.equal(value.attributes[0].code, 'flavor');
  assert.throws(() => __test.validateVariantInput(validVariant({ wholesalePrice: -1 })), /zero or greater/);
  assert.throws(() => __test.validateVariantInput(validVariant({ availableStock: 1.5 })), /whole number/);
  assert.throws(() => __test.validateVariantInput(validVariant({ minimumOrderQuantity: 0 })), /at least one/);
  assert.throws(() => __test.validateVariantInput(validVariant({ weight: 0 })), /greater than zero/);
});

test('supplier cannot write regulatory review fields', () => {
  assert.throws(
    () => __test.validateVariantInput(validVariant({ regulatoryReview: { status: 'approved' } })),
    error => error.statusCode === 403 && error.code === 'REGULATORY_FIELDS_READ_ONLY'
  );
});

test('regulated variants start pending and never inherit parent approval', () => {
  assert.deepEqual(__test.variantRegulatoryState('pet_food').status, 'pending_review');
  assert.deepEqual(__test.variantRegulatoryState('medical_supplies').status, 'pending_review');
  assert.deepEqual(__test.variantRegulatoryState('accessories').status, 'approved');
  const supplierController = read('controllers/supplierController.js');
  assert.match(supplierController, /SupplierProductVariant\.updateMany\([\s\S]*regulatoryReview\.status': 'pending_review'/);
});

test('variant parent supplies are not published to existing procurement paths', () => {
  assert.equal(isSupplierProductPublished({ productMode: 'variant', category: 'accessories', approvalStatus: 'approved' }), false);
  assert.equal(isSupplierProductPublished({ productMode: 'simple', category: 'accessories', approvalStatus: 'approved' }), true);
  const filter = withPublishedSupplierProduct({ isActive: true });
  assert.equal(filter.$and.length, 3);
  assert.match(JSON.stringify(filter), /productMode/);
});

test('SKU claim registry has a physical active namespace unique index', () => {
  const index = SkuClaim.schema.indexes().find(([, options]) => options.name === 'sku_claim_active_namespace_unique');
  assert.ok(index);
  assert.equal(index[1].unique, true);
  assert.deepEqual(index[1].partialFilterExpression, { activeKey: { $type: 'string' }, isActive: true });
  assert.equal(makeActiveKey({ namespaceType: 'supplier', owner: 'abc', normalizedSku: 'DOG-1' }), 'supplier:abc:DOG-1');
});

test('one SKU claim mechanism supports both supplier and future store namespaces', async () => {
  const owner = objectId();
  const entity = objectId();
  const supplierClaim = new SkuClaim({
    namespaceType: 'supplier', owner, normalizedSku: ' sku-1 ',
    entityType: 'supplier_product', entity
  });
  await supplierClaim.validate();
  assert.equal(supplierClaim.normalizedSku, 'SKU-1');
  assert.equal(supplierClaim.activeKey, `supplier:${owner}:SKU-1`);
  const storeClaim = new SkuClaim({
    namespaceType: 'store', owner, normalizedSku: 'sku-1',
    entityType: 'product', entity
  });
  await storeClaim.validate();
  assert.equal(storeClaim.activeKey, `store:${owner}:SKU-1`);
});

test('supplier child indexes preserve parent combination and supplier SKU uniqueness', () => {
  const indexes = SupplierProductVariant.schema.indexes();
  assert.ok(indexes.some(([, options]) => options.name === 'supplier_product_variant_combination_unique' && options.unique));
  assert.ok(indexes.some(([, options]) => options.name === 'supplier_product_variant_sku_unique' && options.unique));
});

test('readiness rejects a same-name MongoDB index with incompatible keys or uniqueness', () => {
  const required = { name: 'sku_claim_active_namespace_unique', key: { activeKey: 1 }, unique: true };
  assert.equal(indexMatches({ name: required.name, key: { activeKey: 1 }, unique: true }, required), true);
  assert.equal(indexMatches({ name: required.name, key: { normalizedSku: 1 }, unique: true }, required), false);
  assert.equal(indexMatches({ name: required.name, key: { activeKey: 1 }, unique: false }, required), false);
});

test('variant writes remain disabled without an explicitly verified Mongo connection', async () => {
  const previous = process.env.SUPPLIER_VARIANTS_ENABLED;
  process.env.SUPPLIER_VARIANTS_ENABLED = 'true';
  try {
    const readiness = await getSupplierVariantReadiness();
    assert.equal(readiness.enabled, false);
    assert.ok(readiness.reasons.some(reason => reason.includes('MongoDB is not connected')));
  } finally {
    if (previous === undefined) delete process.env.SUPPLIER_VARIANTS_ENABLED;
    else process.env.SUPPLIER_VARIANTS_ENABLED = previous;
  }
});

test('supplier routes authenticate every variant write and keep reads supplier-scoped', () => {
  const routes = read('routes/suppliers.js');
  assert.match(routes, /router\.post\('\/variant-products', authenticate, requirePasswordChangeCompleted, createVariantProduct\)/);
  assert.match(routes, /router\.post\('\/products\/:productId\/variants', authenticate, requirePasswordChangeCompleted, createSupplierVariant\)/);
  assert.match(routes, /router\.put\('\/products\/:productId\/variants\/:variantId', authenticate, requirePasswordChangeCompleted, updateSupplierVariant\)/);
  assert.match(routes, /router\.patch\('\/products\/:productId\/variants\/:variantId\/discontinue', authenticate, requirePasswordChangeCompleted, discontinueSupplierVariant\)/);
  const controller = read('controllers/supplierVariantController.js');
  assert.match(controller, /supplierProduct: parent\._id,[\s\S]*supplier: supplier\._id/);
  assert.match(controller, /assertSupplierVariantWritesEnabled/);
  assert.doesNotMatch(controller, /PayMongo|Inventory|PurchaseOrder|ProcurementCart|receiveLot|checkout/i);
});

test('supplier variant reads reject inactive accounts and cross-supplier parents', async () => {
  const originalSupplierFind = Supplier.findOne;
  const originalProductFind = SupplierProduct.findOne;
  const response = () => {
    const result = { statusCode: 200, body: null };
    result.status = code => { result.statusCode = code; return result; };
    result.json = body => { result.body = body; return result; };
    return result;
  };
  try {
    Supplier.findOne = async () => ({ _id: objectId(), status: 'pending', isActive: false, isDeleted: false });
    let res = response();
    await listSupplierVariants({ user: { _id: objectId() }, params: { productId: objectId() } }, res);
    assert.equal(res.statusCode, 403);

    const supplierId = objectId();
    Supplier.findOne = async () => ({ _id: supplierId, status: 'verified', isActive: true, isDeleted: false });
    let capturedFilter;
    SupplierProduct.findOne = filter => { capturedFilter = filter; return Promise.resolve(null); };
    res = response();
    await listSupplierVariants({ user: { _id: objectId() }, params: { productId: objectId() } }, res);
    assert.equal(res.statusCode, 404);
    assert.equal(String(capturedFilter.supplier), String(supplierId));
    assert.deepEqual(capturedFilter.isDeleted, { $ne: true });
  } finally {
    Supplier.findOne = originalSupplierFind;
    SupplierProduct.findOne = originalProductFind;
  }
});

test('supplier UI exposes explicit variants only behind readiness capability', () => {
  const dashboard = read('client/src/pages/supplier/SupplierDashboard.js');
  assert.match(dashboard, /Product with variants/);
  assert.match(dashboard, /explicit variant combination/i);
  assert.match(dashboard, /!variantCapabilities\.enabled/);
  assert.match(dashboard, /supplierService\.addVariantProduct/);
  const api = read('client/src/services/apiService.js');
  assert.match(api, /getVariantCapabilities/);
  assert.match(api, /addVariantProduct/);
});

test('legacy simple supplier products still default to simple mode', () => {
  const product = new SupplierProduct({
    supplier: objectId(), name: 'Legacy Food', sku: 'LEGACY-1', category: 'pet_food', wholesalePrice: 100
  });
  assert.equal(product.productMode, 'simple');
});

test('supplier variant activation is guarded, explicit, and does not touch inventory', () => {
  const script = read('scripts/prepareSupplierVariantReadiness.js');
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.scripts['prepare:supplier-variants'], 'node scripts/prepareSupplierVariantReadiness.js');
  assert.match(script, /SUPPLIER_VARIANT_MIGRATION_URI/);
  assert.match(script, /SUPPLIER_VARIANT_MIGRATION_EXPECTED_DB/);
  assert.match(script, /SUPPLIER_VARIANT_MIGRATION_APPROVED/);
  assert.match(script, /process\.argv\.includes\('--apply'\)/);
  assert.doesNotMatch(script, /Inventory|PayMongo|PurchaseOrder|ProcurementCart|checkout/i);
});
