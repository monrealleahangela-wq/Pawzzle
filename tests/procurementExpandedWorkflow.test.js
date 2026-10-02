const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  validateProcurementQuantity,
  normalizeInspectionItem,
  determineInspectionOutcome
} = require('../utils/procurementCart');
const { amountCentavos } = require('../services/paymentReconciliationService');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('live-pet procurement represents one exact animal and rejects bulk quantities', () => {
  assert.deepEqual(validateProcurementQuantity({
    quantity: 1,
    minimumOrderQuantity: 1,
    availableStock: 1,
    itemType: 'live_pet'
  }), { valid: true, quantity: 1 });
  assert.equal(validateProcurementQuantity({
    quantity: 2,
    minimumOrderQuantity: 1,
    availableStock: 10,
    itemType: 'live_pet'
  }).reason, 'live_pet_quantity');

  const supplierProduct = read('models/SupplierProduct.js');
  const purchaseOrder = read('models/PurchaseOrder.js');
  assert.match(supplierProduct, /pet:[\s\S]*ref: 'Pet'/);
  assert.match(supplierProduct, /supplier: 1, pet: 1[\s\S]*unique: true/);
  assert.match(purchaseOrder, /itemType:[\s\S]*'live_pet'[\s\S]*pet:[\s\S]*ref: 'Pet'/);
});

test('supplier live-pet catalog reuses Pet identity and is isolated from the customer marketplace', () => {
  const supplierController = read('controllers/supplierController.js');
  const petModel = read('models/Pet.js');
  assert.match(supplierController, /new Pet\(buildSupplierPet/);
  assert.match(supplierController, /pet\.save\(\{ session \}\)/);
  assert.match(supplierController, /listingContext: 'supplier_catalog'/);
  assert.match(supplierController, /approvalStatus: 'pending'/);
  assert.match(petModel, /listingContext:[\s\S]*\['marketplace', 'supplier_catalog'\]/);
  assert.match(petModel, /sourceSupplier:[\s\S]*ref: 'Supplier'/);
});

test('multi-supplier submission snapshots and reserves each exact live pet server-side', () => {
  const controller = read('controllers/purchaseOrderController.js');
  const commitments = read('services/procurementStockCommitmentService.js');
  const submit = controller.match(/const submitProcurementCart[\s\S]*?const createPurchaseOrder/)?.[0] || '';
  assert.match(submit, /groupProcurementItemsBySupplier/);
  assert.match(submit, /petSnapshot/);
  assert.match(submit, /commitPurchaseOrderStock\(\{ order, session \}\)/);
  assert.match(commitments, /procurementReservation\.purchaseOrder/);
  assert.match(commitments, /status: 'reserved'/);
  assert.match(commitments, /availableStock: 1[\s\S]*\$set: \{ availableStock: 0 \}/);
});

test('inspection normalization derives accepted, missing, and issue outcomes from quantities', () => {
  const full = normalizeInspectionItem({
    orderItem: { _id: 'line-1', itemType: 'pet_supply', productName: 'Food', quantity: 5 },
    submitted: { receivedQuantity: 5, damagedQuantity: 0, incorrectQuantity: 0 }
  });
  const partial = normalizeInspectionItem({
    orderItem: { _id: 'line-2', itemType: 'pet_supply', productName: 'Litter', quantity: 5 },
    submitted: { receivedQuantity: 4, damagedQuantity: 1, incorrectQuantity: 0 }
  });
  assert.equal(full.acceptedQuantity, 5);
  assert.equal(full.missingQuantity, 0);
  assert.equal(partial.acceptedQuantity, 3);
  assert.equal(partial.missingQuantity, 1);
  assert.equal(partial.condition, 'mixed');
  assert.equal(determineInspectionOutcome([full]), 'accepted');
  assert.equal(determineInspectionOutcome([partial]), 'partially_accepted');
  assert.throws(() => normalizeInspectionItem({
    orderItem: { _id: 'pet-line', itemType: 'live_pet', productName: 'Pet', quantity: 1 },
    submitted: { receivedQuantity: 2 }
  }), /Invalid receiving quantities|zero or one/);
});

test('receiving reports preserve evidence, store scope, payment readiness, and idempotent item processing', () => {
  const report = read('models/ProcurementReceivingReport.js');
  const controller = read('controllers/purchaseOrderController.js');
  const routes = read('routes/purchaseOrders.js');
  assert.match(report, /purchaseOrder:[\s\S]*unique: true/);
  assert.match(report, /store:[\s\S]*ref: 'Store'/);
  assert.match(report, /const evidenceSchema[\s\S]*uploadedBy/);
  assert.match(report, /evidence: \{ type: \[evidenceSchema\]/);
  assert.match(report, /paymentReady/);
  assert.match(report, /inventoryApplied/);
  assert.match(controller, /canOperateStore\(req\.user, order\.store, \['procurement\.manage', 'inventory\.receive'\]\)/);
  assert.match(controller, /po-inspection-receipt:/);
  assert.match(controller, /previously received item cannot be changed/);
  assert.match(controller, /Inspection quantities must be supplied exactly once for every purchase-order item/);
  assert.match(controller, /processingStatus: 'processing', updatedAt: \{ \$lte: staleProcessingCutoff \}/);
  assert.match(controller, /mongoose\.connection\.transaction[\s\S]*availableStock: \{ \$gte: increment \}/);
  assert.match(routes, /authorizeReceivingInspectionUpload, uploadProcurementEvidence, handleUploadError, submitReceivingInspection/);
});

test('accepted product quantities enter the existing ledger while exact pets transfer without bulk inventory', () => {
  const controller = read('controllers/purchaseOrderController.js');
  const receiving = controller.match(/const applyReceivingItem[\s\S]*?const submitReceivingInspection/)?.[0] || '';
  assert.match(receiving, /InventoryLedgerService\.receiveLot/);
  assert.match(receiving, /idempotencyKey = `po-inspection-receipt:/);
  assert.match(receiving, /pet\.acquiredThroughPurchaseOrder = order\._id/);
  assert.match(receiving, /pet\.store = order\.store/);
  assert.match(receiving, /pet\.approvalStatus = 'pending'/);
  assert.match(receiving, /pet\.status = 'unavailable'/);
  assert.doesNotMatch(receiving, /pet\.quantity \+=/);
});

test('procurement PayMongo amounts and status are server-authoritative and webhook-reconciled', () => {
  assert.equal(amountCentavos({ totalCost: 2500, paidAmount: 500 }, 'procurement'), 200000);
  const paymentController = read('controllers/paymentController.js');
  const reconciliation = read('services/paymentReconciliationService.js');
  const routes = read('routes/payment.js');
  assert.match(routes, /create-procurement-checkout-session/);
  assert.match(paymentController, /amountCentavos\(order, 'procurement'\)/);
  assert.match(paymentController, /ensureCheckoutSession\([\s\S]*type: 'procurement'/);
  assert.match(reconciliation, /const finalizeProcurement/);
  assert.match(reconciliation, /paymentMatches\(current, 'procurement', payment\)/);
  assert.match(reconciliation, /providerPaymentId: payment\.id/);
  assert.match(reconciliation, /duplicatePaymentIds/);
  assert.match(reconciliation, /current\?\.paymentDetails\?\.paymentId === payment\.id/);
  assert.match(reconciliation, /target\.type === 'procurement'/);
});

test('unused legacy purchase-order creation is explicitly retired in favor of the authoritative cart submission', () => {
  const controller = read('controllers/purchaseOrderController.js');
  const service = read('client/src/services/apiService.js');
  const page = read('client/src/pages/admin/PurchaseOrders.js');
  const directCreation = controller.match(/const createPurchaseOrder[\s\S]*?\/\/ Retained temporarily/)?.[0] || '';
  assert.match(directCreation, /status\(410\)/);
  assert.match(directCreation, /PROCUREMENT_CART_REQUIRED/);
  assert.match(page, /purchaseOrderService\.submitCart/);
  assert.doesNotMatch(page, /purchaseOrderService\.create\(/);
  assert.equal((service.match(/create: \(data\) => api\.post\('\/purchase-orders'/g) || []).length, 1);
});

test('pay-after-inspection is blocked until full acceptance and pay-now is blocked from supplier acceptance until paid', () => {
  const paymentController = read('controllers/paymentController.js');
  const supplierController = read('controllers/supplierController.js');
  const financeController = read('controllers/financeController.js');
  assert.match(paymentController, /\['not_required', 'resolved'\]\.includes\(report\.resolutionStatus\)/);
  assert.match(paymentController, /!report\.paymentReady/);
  assert.match(supplierController, /status === 'confirmed'[\s\S]*paymentTiming === 'pay_now'[\s\S]*paymentStatus !== 'paid'/);
  assert.match(financeController, /paymentTiming === 'after_inspection'/);
  assert.match(financeController, /must be paid through the verified PayMongo flow/);
  assert.match(financeController, /order\.paymentMethod === 'paymongo'/);
  assert.match(financeController, /payment\.provider === 'paymongo'/);
  assert.match(financeController, /mongoose\.connection\.transaction/);
});

test('active payments and receiving issues cannot be bypassed through cancellation', () => {
  const purchaseOrderController = read('controllers/purchaseOrderController.js');
  const supplierController = read('controllers/supplierController.js');
  assert.match(purchaseOrderController, /'issue_reported'[\s\S]*'awaiting_replacement'[\s\S]*'reinspection'[\s\S]*'resolved'[\s\S]*'completed'/);
  assert.match(purchaseOrderController, /paymentDetails\?\.sessionStatus === 'active'/);
  assert.match(supplierController, /paymentDetails\?\.sessionStatus === 'active'/);
});

test('procurement UI exposes item types, payment timing, inspection, evidence, and supplier issue visibility', () => {
  const procurement = read('client/src/pages/admin/PurchaseOrders.js');
  const supplier = read('client/src/pages/supplier/SupplierDashboard.js');
  assert.match(procurement, /Live pet · unique animal/);
  assert.match(procurement, /Pay after inspection/);
  assert.match(procurement, /Submit Inspection Report/);
  assert.match(procurement, /body\.append\('images', file\)/);
  assert.match(supplier, /Awaiting verified payment/);
  assert.match(supplier, /Receiving inspection/);
  assert.match(supplier, /ProcurementEvidenceGallery/);
});

test('customer discovery cannot expose an accepted live pet until it is made available', () => {
  const search = read('client/src/pages/customer/Search.js');
  const dss = read('controllers/dssController.js');
  assert.match(search, /petService\.getAllPets\(\{ \.\.\.params, isAvailable: true \}\)/);
  assert.match(dss, /approvalStatus: 'approved'[\s\S]*status: 'available'[\s\S]*isAvailable: true/);
});
