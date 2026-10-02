const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  getResolutionQuantities,
  hasUnresolvedQuantities,
  outstandingProcurementBalance
} = require('../utils/procurementResolution');
const { amountCentavos } = require('../services/paymentReconciliationService');
const { normalizeInspectionItem, determineInspectionOutcome } = require('../utils/procurementCart');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

const reportWith = ({ initialAccepted = 8, replacementAccepted = 0, financialQuantity = 0 } = {}) => ({
  items: [{ purchaseOrderItem: 'line-1', expectedQuantity: 10, acceptedQuantity: initialAccepted }],
  reinspections: replacementAccepted ? [{
    processingStatus: 'completed',
    items: [{ purchaseOrderItem: 'line-1', acceptedQuantity: replacementAccepted }]
  }] : [],
  resolutionSubmissions: financialQuantity ? [{
    type: 'refund_credit',
    financialAdjustment: { status: 'approved' },
    items: [{ purchaseOrderItem: 'line-1', proposedQuantity: financialQuantity }]
  }] : []
});

test('unresolved quantity is derived from immutable initial acceptance plus completed reinspections', () => {
  const quantities = getResolutionQuantities(reportWith({ replacementAccepted: 2 }));
  assert.deepEqual(quantities[0], {
    purchaseOrderItem: 'line-1',
    orderedQuantity: 10,
    initiallyAcceptedQuantity: 8,
    replacementAcceptedQuantity: 2,
    financiallyResolvedQuantity: 0,
    unresolvedQuantity: 0
  });
  assert.equal(hasUnresolvedQuantities(reportWith({ replacementAccepted: 1 })), true);
  assert.equal(hasUnresolvedQuantities(reportWith({ replacementAccepted: 2 })), false);
});

test('approved financial quantity resolves only the explicitly reviewed lines', () => {
  assert.equal(getResolutionQuantities(reportWith({ financialQuantity: 2 }))[0].unresolvedQuantity, 0);
  assert.equal(getResolutionQuantities(reportWith({ financialQuantity: 1 }))[0].unresolvedQuantity, 1);
});

test('missing, damaged, incorrect, and partial deliveries remain server-derived discrepancies', () => {
  const orderItem = { _id: 'line-1', itemType: 'product', productName: 'Supply', quantity: 10 };
  const missing = normalizeInspectionItem({ orderItem, submitted: { receivedQuantity: 8, damagedQuantity: 0, incorrectQuantity: 0, condition: 'acceptable' } });
  const damaged = normalizeInspectionItem({ orderItem, submitted: { receivedQuantity: 10, damagedQuantity: 2, incorrectQuantity: 0, condition: 'acceptable' } });
  const incorrect = normalizeInspectionItem({ orderItem, submitted: { receivedQuantity: 10, damagedQuantity: 0, incorrectQuantity: 2, condition: 'acceptable' } });
  assert.equal(missing.condition, 'missing');
  assert.equal(damaged.condition, 'damaged');
  assert.equal(incorrect.condition, 'incorrect');
  assert.equal(missing.acceptedQuantity, 8);
  assert.equal(damaged.acceptedQuantity, 8);
  assert.equal(incorrect.acceptedQuantity, 8);
  assert.equal(determineInspectionOutcome([missing]), 'partially_accepted');
});

test('procurement balance includes only authoritative approved adjustments', () => {
  assert.equal(outstandingProcurementBalance({ totalCost: 100, paidAmount: 20 }), 80);
  assert.equal(outstandingProcurementBalance({ totalCost: 100, paidAmount: 80, approvedAdjustmentTotal: 20 }), 0);
  assert.equal(outstandingProcurementBalance({
    totalCost: 100,
    paidAmount: 80,
    approvedAdjustmentTotal: 0,
    resolutionSubmissions: [{ type: 'refund_credit', financialAdjustment: { status: 'pending_finance_review', approvedAmount: 20 } }]
  }), 20);
  assert.equal(outstandingProcurementBalance({
    totalCost: 100,
    paidAmount: 80,
    approvedAdjustmentTotal: 0,
    resolutionSubmissions: [{ type: 'refund_credit', financialAdjustment: { status: 'rejected', approvedAmount: 20 } }]
  }), 20);
  assert.equal(outstandingProcurementBalance({ totalCost: 100, paidAmount: 0, approvedAdjustmentTotal: 20 }), 80);
  assert.equal(outstandingProcurementBalance({ totalCost: 100, paidAmount: 125, approvedAdjustmentTotal: 0 }), 0);
  assert.equal(amountCentavos({ totalCost: 100, paidAmount: 80, approvedAdjustmentTotal: 20 }, 'procurement'), 0);
});

test('Finance summary reuses the authoritative procurement outstanding-balance calculation', () => {
  const finance = read('controllers/financeController.js');
  assert.match(finance, /procurementOutstanding: roundMoney\(purchaseOrders\.reduce\(\(sum, order\) => sum \+ outstandingProcurementBalance\(order\), 0\)\)/);
});

test('Finance UI excludes pay-after-inspection POs from manual payment while retaining backend fallback errors', () => {
  const finance = read('client/src/pages/admin/FinanceManagement.js');
  assert.match(finance, /orders\.filter\(o=>o\.paymentTiming !== 'after_inspection'&&/);
  assert.match(finance, /!\['paid','settled','refunded'\]\.includes\(o\.paymentStatus\)/);
  assert.match(finance, /toast\.error\(error\.response\?\.data\?\.message \|\| 'Unable to save record'\)/);
});

test('Supplier UI offers only refund-credit for unresolved live-pet lines and preserves ordinary resolution options', () => {
  const supplier = read('client/src/pages/supplier/SupplierDashboard.js');
  assert.match(supplier, /itemType: orderItem\?\.itemType/);
  assert.match(supplier, /resolutionTypeFor = order => unresolvedItemsFor\(order\)\.some\(item => item\.itemType === 'live_pet'\)[\s\S]*\? 'refund_credit'/);
  assert.match(supplier, /!unresolvedItemsFor\(order\)\.some\(item => item\.itemType === 'live_pet'\)[\s\S]*value="replacement"[\s\S]*value="return_correction"/);
  assert.match(supplier, /<option value="refund_credit">Refund \/ credit proposal<\/option>/);
  assert.match(supplier, /type: resolutionTypeFor\(order\)/);
});

test('receiving report preserves resolution submissions, decisions, reinspections, evidence, and audit actors', () => {
  const model = read('models/ProcurementReceivingReport.js');
  assert.match(model, /resolutionSubmissions/);
  assert.match(model, /resolutionHistory/);
  assert.match(model, /reinspections/);
  assert.match(model, /submittedBy:[\s\S]*decisionBy:[\s\S]*replacementDeliveredBy/);
  assert.match(model, /financialAdjustment:[\s\S]*pending_finance_review[\s\S]*financeRecord/);
  assert.match(model, /uploadedBy:[\s\S]*uploadedAt/);
});

test('supplier resolution endpoints are supplier-owned and support only the three policy types', () => {
  const controller = read('controllers/supplierController.js');
  const routes = read('routes/suppliers.js');
  assert.match(controller, /PurchaseOrder\.findOne\(\{ _id: req\.params\.id, supplier: supplier\._id/);
  assert.match(controller, /\['replacement', 'return_correction', 'refund_credit'\]/);
  assert.match(controller, /proposedQuantity > available/);
  assert.match(controller, /Exact live-pet procurement cannot use quantity-based replacement/);
  assert.match(routes, /orders\/:id\/resolutions/);
  assert.match(routes, /resolutions\/:resolutionId\/delivered/);
});

test('Store review preserves rejected submissions and accepted refund proposals require Finance', () => {
  const controller = read('controllers/purchaseOrderController.js');
  assert.match(controller, /const reviewSupplierResolution/);
  assert.match(controller, /submission\.status = 'rejected'/);
  assert.match(controller, /resolutionStatus = 'resolution_rejected'/);
  assert.match(controller, /financialAdjustment\.status = 'pending_finance_review'/);
  assert.doesNotMatch(
    controller.match(/const reviewSupplierResolution[\s\S]*?const authorizeResolutionReinspectionUpload/)?.[0] || '',
    /ProcurementPayment\.create/
  );
});

test('replacement delivery can only be received through Store-authorized reinspection', () => {
  const supplier = read('controllers/supplierController.js');
  const purchaseOrders = read('controllers/purchaseOrderController.js');
  const routes = read('routes/purchaseOrders.js');
  assert.match(supplier, /submission\.status = 'replacement_delivered'/);
  assert.match(purchaseOrders, /canOperateStore\(req\.user, order\.store, \['procurement\.manage', 'inventory\.receive'\]\)/);
  assert.match(routes, /authorizeResolutionReinspectionUpload, uploadProcurementEvidence, handleUploadError, submitResolutionReinspection/);
});

test('reinspection uses deterministic inventory idempotency and cumulative received targets', () => {
  const controller = read('controllers/purchaseOrderController.js');
  assert.match(controller, /receivedQuantityTarget/);
  assert.match(controller, /po-resolution-receipt:/);
  assert.match(controller, /resolutionStatus: 'reinspection'/);
  assert.match(controller, /This reinspection is already being processed/);
  assert.match(controller, /failed reinspection retry must use the same quantities/);
});

test('Pay After Inspection remains blocked until discrepancy resolution is payment-ready', () => {
  const payment = read('controllers/paymentController.js');
  assert.match(payment, /\['not_required', 'resolved'\]\.includes\(report\.resolutionStatus\)/);
  assert.match(payment, /!report\.paymentReady/);
  assert.match(payment, /pending_supplier_resolution[\s\S]*resolution_submitted[\s\S]*awaiting_replacement[\s\S]*reinspection/);
});

test('Finance approval creates a separate adjustment and never rewrites PayMongo verification', () => {
  const finance = read('controllers/financeController.js');
  const model = read('models/ProcurementPayment.js');
  assert.match(finance, /transactionType: adjustmentType/);
  assert.match(finance, /paymentMethod: 'financial_adjustment'/);
  assert.match(finance, /status: 'authorized'/);
  assert.match(finance, /No PayMongo refund was executed/);
  assert.match(model, /transactionType:[\s\S]*\['payment', 'refund', 'credit'\]/);
});

test('ordinary cancellation remains blocked throughout the discrepancy lifecycle', () => {
  const controller = read('controllers/purchaseOrderController.js');
  assert.match(controller, /'issue_reported'[\s\S]*'resolution_submitted'[\s\S]*'awaiting_replacement'[\s\S]*'reinspection'[\s\S]*'resolved'/);
});

test('notification failures are secondary to committed resolution state', () => {
  const supplier = read('controllers/supplierController.js');
  const purchaseOrders = read('controllers/purchaseOrderController.js');
  const finance = read('controllers/financeController.js');
  assert.match(supplier, /submitOrderResolution[\s\S]*settleSupplierSecondaryEffects/);
  assert.match(purchaseOrders, /reviewSupplierResolution[\s\S]*Promise\.allSettled/);
  assert.match(finance, /reviewProcurementAdjustment[\s\S]*Promise\.allSettled/);
});

test('frontend exposes supplier, Store, reinspection, and Finance actions without trusting them as authority', () => {
  const api = read('client/src/services/apiService.js');
  const supplier = read('client/src/pages/supplier/SupplierDashboard.js');
  const store = read('client/src/pages/admin/PurchaseOrders.js');
  const finance = read('client/src/pages/admin/FinanceManagement.js');
  assert.match(api, /submitOrderResolution/);
  assert.match(api, /reviewResolution/);
  assert.match(api, /submitReinspection/);
  assert.match(api, /reviewProcurementAdjustment/);
  assert.match(supplier, /Submit a resolution/);
  assert.match(store, /Reinspect replacement/);
  assert.match(finance, /No procurement adjustments awaiting Finance review/);
  assert.match(supplier, /ProcurementReinspectionEvidenceGallery/);
  assert.match(store, /ProcurementReinspectionEvidenceGallery/);
  assert.match(finance, /ProcurementReinspectionEvidenceGallery/);
});
