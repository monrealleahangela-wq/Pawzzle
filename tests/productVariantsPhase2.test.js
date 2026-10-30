const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const ProcurementCart = require('../models/ProcurementCart');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProcurementReceivingReport = require('../models/ProcurementReceivingReport');
const SupplierVariantMapping = require('../models/SupplierVariantMapping');
const { normalizeInspectionItem, validateProcurementQuantity } = require('../utils/procurementCart');
const { isVariantRegulatorilyEligible } = require('../services/supplierVariantMappingService');
const { getVariantProcurementReadiness } = require('../services/variantProcurementReadinessService');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
const objectId = () => new mongoose.Types.ObjectId();

test('procurement cart and order schemas preserve exact optional variant identities', () => {
  assert.ok(ProcurementCart.schema.path('items').schema.path('supplierVariant'));
  assert.ok(ProcurementCart.schema.path('items').schema.path('sellerVariant'));
  assert.ok(ProcurementCart.schema.path('items').schema.path('variantMapping'));
  const item = PurchaseOrder.schema.path('items').schema;
  for (const field of [
    'supplierVariant', 'supplierVariantSkuSnapshot', 'supplierVariantAttributesSnapshot',
    'supplierVariantDisplayNameSnapshot', 'sellerVariant', 'variantMapping',
    'unitSnapshot', 'packageWeightSnapshot', 'packageWeightUnitSnapshot'
  ]) assert.ok(item.path(field), `missing purchase-order snapshot ${field}`);
});

test('multiple variants of one parent use separate cart line identities', () => {
  const source = read('controllers/purchaseOrderController.js');
  assert.match(source, /String\(item\.supplierProduct\) === String\(product\._id\)[\s\S]*String\(item\.supplierVariant \|\| ''\) === String\(supplierVariant\?\._id \|\| ''\)/);
  assert.match(source, /lineIdentity: `\$\{product\?\._id \|\| item\.supplierProduct\}:\$\{variant\?\._id \|\| item\.supplierVariant \|\| 'simple'\}`/);
});

test('variant quantities enforce MOQ, whole units, and exact variant availability', () => {
  assert.deepEqual(validateProcurementQuantity({ quantity: 5, minimumOrderQuantity: 5, availableStock: 8 }), { valid: true, quantity: 5 });
  assert.equal(validateProcurementQuantity({ quantity: 4, minimumOrderQuantity: 5, availableStock: 8 }).reason, 'below_minimum');
  assert.equal(validateProcurementQuantity({ quantity: 9, minimumOrderQuantity: 5, availableStock: 8 }).reason, 'insufficient_stock');
  assert.equal(validateProcurementQuantity({ quantity: 5.5, minimumOrderQuantity: 1, availableStock: 8 }).reason, 'positive_whole_number');
});

test('regulated supplier variants require parent and exact variant approval', () => {
  const parent = { category: 'pet_food', requiresPlatformReview: true, approvalStatus: 'approved' };
  assert.equal(isVariantRegulatorilyEligible({ parent, variant: { regulatoryReview: { status: 'pending_review' } } }), false);
  assert.equal(isVariantRegulatorilyEligible({ parent, variant: { regulatoryReview: { status: 'approved' } } }), true);
  assert.equal(isVariantRegulatorilyEligible({ parent: { category: 'accessories' }, variant: { regulatoryReview: { status: 'not_assessed' } } }), true);
});

test('mapping identity is explicit and supports multiple approved supplier sources', () => {
  const index = SupplierVariantMapping.schema.indexes()
    .find(([, options]) => options.name === 'store_seller_supplier_variant_mapping_unique');
  assert.ok(index);
  assert.equal(index[1].unique, true);
  assert.deepEqual(index[0], { store: 1, sellerVariant: 1, supplierVariant: 1 });
  assert.ok(SupplierVariantMapping.schema.path('sourcePriority'));
  assert.ok(SupplierVariantMapping.schema.path('statusHistory'));
});

test('variant mapping APIs are authenticated, store-scoped, and never trust client parent identities', () => {
  const routes = read('routes/purchaseOrders.js');
  const controller = read('controllers/supplierVariantMappingController.js');
  const service = read('services/supplierVariantMappingService.js');
  assert.match(routes, /router\.post\('\/variant-mappings', authenticate, requirePermission\('procurement\.manage', 'inventory\.receive'\), createVariantMapping\)/);
  assert.match(controller, /resolveUserStore\(req\.user\)/);
  assert.match(controller, /validateMappingReferences\(\{[\s\S]*storeId: store,[\s\S]*sellerVariantId: req\.body\.sellerVariantId,[\s\S]*supplierVariantId: req\.body\.supplierVariantId/);
  assert.doesNotMatch(controller, /req\.body\.(store|supplier|supplierProduct|sellerProduct)\b/);
  assert.match(service, /String\(sellerVariant\.store\) !== String\(storeId\)/);
  assert.match(service, /String\(variant\.supplierProduct\) !== String\(parent\._id\)/);
});

test('receiving snapshots preserve partial quantities, exact destination, and idempotency', () => {
  const orderItem = {
    _id: objectId(), supplierVariant: objectId(), sellerVariant: objectId(), variantMapping: objectId(),
    itemType: 'pet_supply', productName: 'Food — Beef — 1 kg', quantity: 10, receivedQuantity: 3
  };
  const row = normalizeInspectionItem({ orderItem, submitted: { receivedQuantity: 7, damagedQuantity: 1, incorrectQuantity: 1 } });
  assert.equal(row.previouslyReceivedQuantity, 3);
  assert.equal(row.acceptedQuantity, 5);
  assert.equal(row.missingQuantity, 3);
  assert.equal(String(row.supplierVariant), String(orderItem.supplierVariant));
  assert.equal(String(row.sellerVariant), String(orderItem.sellerVariant));
  assert.equal(row.inventoryApplicationStatus, 'deferred_variant_inventory');
  assert.match(row.idempotencyKey, /^po-receipt:/);
  const receivingItem = ProcurementReceivingReport.schema.path('items').schema;
  assert.ok(receivingItem.path('idempotencyKey'));
  assert.ok(receivingItem.path('inventoryApplicationStatus'));
});

test('stock commitment and cancellation update only the exact supplier variant', () => {
  const source = read('services/procurementStockCommitmentService.js');
  assert.match(source, /SupplierProductVariant\.updateOne\(\{[\s\S]*_id: item\.supplierVariant,[\s\S]*supplierProduct: item\.supplierProduct,[\s\S]*\$inc: \{ availableStock: -quantity \}/);
  assert.match(source, /SupplierProductVariant\.updateOne\(\{[\s\S]*_id: item\.supplierVariant,[\s\S]*\$inc: \{ availableStock: committedQuantity \}/);
  assert.match(source, /supplierStockCommitmentReleased === true/);
});

test('variant receiving cannot fall back to parent inventory', () => {
  const source = read('controllers/purchaseOrderController.js');
  const apply = source.match(/const applyReceivingItem[\s\S]*?const submitReceivingInspection/)?.[0] || '';
  const gateAt = apply.indexOf('assertVariantReceivingStockApplicationEnabled');
  const parentInventoryAt = apply.indexOf('Inventory.findOne');
  assert.ok(gateAt >= 0);
  assert.ok(parentInventoryAt > gateAt);
  assert.match(apply, /VARIANT_RECEIVING_MAPPING_MISMATCH/);
});

test('variant procurement remains disabled without explicit readiness', async () => {
  const previousProcurement = process.env.SUPPLIER_VARIANT_PROCUREMENT_ENABLED;
  const previousVariants = process.env.SUPPLIER_VARIANTS_ENABLED;
  delete process.env.SUPPLIER_VARIANT_PROCUREMENT_ENABLED;
  delete process.env.SUPPLIER_VARIANTS_ENABLED;
  try {
    const readiness = await getVariantProcurementReadiness();
    assert.equal(readiness.enabled, false);
    assert.equal(readiness.sellerVariantInventoryReady, false);
    assert.equal(readiness.receivingStockApplicationEnabled, false);
    assert.ok(readiness.reasons.some(reason => reason.includes('SUPPLIER_VARIANT_PROCUREMENT_ENABLED')));
  } finally {
    if (previousProcurement === undefined) delete process.env.SUPPLIER_VARIANT_PROCUREMENT_ENABLED;
    else process.env.SUPPLIER_VARIANT_PROCUREMENT_ENABLED = previousProcurement;
    if (previousVariants === undefined) delete process.env.SUPPLIER_VARIANTS_ENABLED;
    else process.env.SUPPLIER_VARIANTS_ENABLED = previousVariants;
  }
});

test('variant procurement activation also requires concurrency and seller inventory readiness', () => {
  const source = read('services/variantProcurementReadinessService.js');
  assert.match(source, /SUPPLIER_VARIANT_PROCUREMENT_CONCURRENCY_VERIFIED/);
  assert.match(source, /const sellerVariantInventoryReady = false/);
  assert.match(source, /enabled: requested && mappingWritesEnabled && concurrencyVerified && sellerVariantInventoryReady/);
});

test('simple procurement and customer/payment surfaces remain outside Phase 2', () => {
  const controller = read('controllers/purchaseOrderController.js');
  assert.match(controller, /withPublishedSupplierProduct/);
  const changed = read('services/variantProcurementReadinessService.js');
  assert.doesNotMatch(changed, /PayMongo|checkout|OrderCheckoutBatch|customer/i);
});
