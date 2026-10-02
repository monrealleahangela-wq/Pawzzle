const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const InventoryTransaction = require('../models/InventoryTransaction');
const InventoryLot = require('../models/InventoryLot');
const {
  RECEIVING_PROCESSING_STALE_MS,
  getReceivingProcessingCutoff
} = require('../utils/procurementCart');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('receiving processing uses the established five-minute stale lease', () => {
  const now = Date.UTC(2026, 0, 1, 0, 10, 0);
  assert.equal(RECEIVING_PROCESSING_STALE_MS, 5 * 60 * 1000);
  assert.equal(getReceivingProcessingCutoff(now).getTime(), now - RECEIVING_PROCESSING_STALE_MS);
});

test('inventory receipt idempotency and lot identity are protected by unique indexes', () => {
  const transactionIndexes = InventoryTransaction.schema.indexes();
  const lotIndexes = InventoryLot.schema.indexes();
  assert.ok(transactionIndexes.some(([fields, options]) => fields.idempotencyKey === 1 && options.unique && options.sparse));
  assert.ok(lotIndexes.some(([fields, options]) => (
    fields.store === 1 && fields.product === 1 && fields.lotNumber === 1 && options.unique
  )));
});

test('receiveLot claims idempotency and mutates inventory in one session boundary', () => {
  const service = read('services/inventoryLedgerService.js');
  const receiveLot = service.match(/static async receiveLot\(data, options = \{\}\)[\s\S]*?static async issueFEFO/)?.[0] || '';
  assert.match(receiveLot, /mongoose\.connection\.transaction\(async session/);
  assert.match(receiveLot, /receiveLotInSession\(data, options\.session\)/);
  assert.match(receiveLot, /InventoryTransaction\.create\(\[\{/);
  assert.match(receiveLot, /InventoryLot\.findOne\([\s\S]*?\.session\(session\)/);
  assert.match(receiveLot, /lot\.save\(\{ session \}\)/);
  assert.match(receiveLot, /movement\.save\(\{ session \}\)/);
  assert.match(receiveLot, /refreshBalance\(store, product, \{ session \}\)/);
});

test('initial receiving finalizes report, inventory and purchase order in one transaction', () => {
  const controller = read('controllers/purchaseOrderController.js');
  const reportModel = read('models/ProcurementReceivingReport.js');
  const receiving = controller.match(/const submitReceivingInspection[\s\S]*?const reviewSupplierResolution/)?.[0] || '';
  assert.match(receiving, /mongoose\.connection\.transaction\(async session/);
  assert.match(receiving, /applyReceivingItem\([\s\S]*?session/);
  assert.match(receiving, /report\.receivedAt = new Date\(\);[\s\S]*?report\.processingStatus = 'completed'/);
  assert.doesNotMatch(receiving, /req\.body\.receivedAt/);
  assert.match(receiving, /report\.save\(\{ session \}\)/);
  assert.match(receiving, /order\.save\(\{ session \}\)/);
  assert.match(receiving, /updatedAt: receivingClaimTimestamp/);
  assert.match(receiving, /processingStatus: 'processing', updatedAt: receivingClaimTimestamp/);
  assert.match(receiving, /receivingCommitted = true;[\s\S]*?Promise\.allSettled/);
  assert.match(reportModel, /receivedAt: Date/);
  assert.doesNotMatch(reportModel, /receivedAt: \{ type: Date, default: Date\.now/);
});

test('reinspection has an atomic stale lease and transactional completion', () => {
  const controller = read('controllers/purchaseOrderController.js');
  const reportModel = read('models/ProcurementReceivingReport.js');
  const reinspection = controller.match(/const submitResolutionReinspection[\s\S]*?const getReceivingInspection/)?.[0] || '';
  assert.match(reinspection, /resolutionStatus: 'reinspection_processing', updatedAt: \{ \$lte: staleProcessingCutoff \}/);
  assert.match(reinspection, /updatedAt: reinspectionClaimTimestamp/);
  assert.match(reinspection, /resolutionStatus: 'reinspection_processing',[\s\S]*?updatedAt: reinspectionClaimTimestamp/);
  assert.match(reinspection, /\['processing', 'failed'\]\.includes\(row\.processingStatus\)/);
  assert.match(reinspection, /mongoose\.connection\.transaction\(async session/);
  assert.match(reinspection, /po-resolution-receipt:\$\{committedOrder\._id\}:\$\{transactionSubmission\._id\}:\$\{orderItem\._id\}/);
  assert.match(reinspection, /transactionAttempt\.inspectedAt = new Date\(\);[\s\S]*?transactionAttempt\.processingStatus = 'completed'/);
  assert.doesNotMatch(reinspection, /req\.body\.inspectedAt/);
  assert.match(reinspection, /report\.save\(\{ session \}\)/);
  assert.match(reinspection, /committedOrder\.save\(\{ session \}\)/);
  assert.match(reportModel, /inspectedAt: Date/);
  assert.doesNotMatch(reportModel, /inspectedAt: \{ type: Date, default: Date\.now/);
});

test('resolution submission, decision, and delivery handoff commit PO and report together', () => {
  const supplier = read('controllers/supplierController.js');
  const purchaseOrders = read('controllers/purchaseOrderController.js');
  const submission = supplier.match(/const submitOrderResolution[\s\S]*?const markResolutionDelivered/)?.[0] || '';
  const delivery = supplier.match(/const markResolutionDelivered[\s\S]*?\/\/ [^\n]*PUBLIC/)?.[0] || '';
  const decision = purchaseOrders.match(/const reviewSupplierResolution[\s\S]*?const authorizeResolutionReinspectionUpload/)?.[0] || '';

  for (const transition of [submission, delivery, decision]) {
    assert.match(transition, /mongoose\.connection\.transaction/);
    assert.match(transition, /report\.save\(\{ session \}\)/);
    assert.match(transition, /order\.save\(\{ session \}\)/);
  }
});

test('supplier lifecycle side effects are settled after authoritative state writes', () => {
  const supplier = read('controllers/supplierController.js');
  assert.match(supplier, /const settleSupplierSecondaryEffects[\s\S]*Promise\.allSettled/);
  assert.match(supplier, /adminVerifySupplier[\s\S]*supplier\.save\(\)[\s\S]*settleSupplierSecondaryEffects/);
  assert.match(supplier, /adminDeactivateSupplier[\s\S]*supplier\.save\(\)[\s\S]*settleSupplierSecondaryEffects/);
});

test('live-pet receiving remains exact-document transfer inside the receiving transaction', () => {
  const controller = read('controllers/purchaseOrderController.js');
  const applyItem = controller.match(/const applyReceivingItem[\s\S]*?const submitReceivingInspection/)?.[0] || '';
  assert.match(applyItem, /'procurementReservation\.purchaseOrder': order\._id/);
  assert.match(applyItem, /pet\.acquiredThroughPurchaseOrder = order\._id/);
  assert.match(applyItem, /pet\.approvalStatus = 'pending'/);
  assert.match(applyItem, /pet\.status = 'unavailable'/);
  assert.match(applyItem, /pet\.save\(\{ session \}\)/);
  assert.doesNotMatch(applyItem, /Pet\.create/);
});
