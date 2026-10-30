const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const SupplierProduct = require('../models/SupplierProduct');
const {
  FDA_REVIEW_CATEGORIES,
  withPublishedSupplierProduct,
  isSupplierProductPublished,
  hasReviewedContentUpdate,
  requiresFdaComplianceReview,
  buildSupplierProductApprovalState
} = require('../utils/supplierProductApproval');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('new supply approval state is represented without changing legacy publication', () => {
  const supplier = new mongoose.Types.ObjectId();
  const legacy = new SupplierProduct({
    supplier, name: 'Legacy supply', sku: 'LEGACY-1', category: 'other', wholesalePrice: 10, availableStock: 2
  });
  const pending = new SupplierProduct({
    supplier, name: 'New food', sku: 'NEW-1', category: 'pet_food', wholesalePrice: 20, availableStock: 2,
    requiresPlatformReview: true, approvalStatus: 'pending_review'
  });
  const approved = new SupplierProduct({
    supplier, name: 'Approved medicine', sku: 'APPROVED-1', category: 'medical_supplies', wholesalePrice: 30, availableStock: 2,
    requiresPlatformReview: true, approvalStatus: 'approved'
  });
  const accessoryWithLegacyPendingFlag = new SupplierProduct({
    supplier, name: 'Accessory', sku: 'ACCESSORY-1', category: 'accessories', wholesalePrice: 10, availableStock: 2,
    requiresPlatformReview: true, approvalStatus: 'pending_review'
  });

  assert.equal(isSupplierProductPublished(legacy), true);
  assert.equal(isSupplierProductPublished(pending), false);
  assert.equal(isSupplierProductPublished(approved), true);
  assert.equal(isSupplierProductPublished(accessoryWithLegacyPendingFlag), true);
  assert.deepEqual(withPublishedSupplierProduct({ isActive: true }), {
    $and: [
      { isActive: true },
      { $or: [
        { category: { $nin: FDA_REVIEW_CATEGORIES } },
        { requiresPlatformReview: { $ne: true } },
        { approvalStatus: 'approved' }
      ] },
      { $or: [
        { productMode: 'simple' },
        { productMode: { $exists: false } },
        { productMode: null }
      ] }
    ]
  });
});

test('only food and medicine categories enter FDA compliance review', () => {
  assert.equal(SupplierProduct.schema.path('fdaRegistrationNumber').options.select, false);
  assert.equal(SupplierProduct.schema.path('fdaRegistrationExpiry').options.select, false);
  for (const category of ['pet_food', 'pet_treats', 'medical_supplies', 'health_supplements']) {
    assert.equal(requiresFdaComplianceReview(category), true);
    const state = buildSupplierProductApprovalState({ category, actor: new mongoose.Types.ObjectId() });
    assert.equal(state.requiresPlatformReview, true);
    assert.equal(state.approvalStatus, 'pending_review');
  }
  for (const category of ['accessories', 'toys', 'grooming_supplies', 'general_product', 'live_pets', 'other']) {
    assert.equal(requiresFdaComplianceReview(category), false);
    const state = buildSupplierProductApprovalState({ category, actor: new mongoose.Types.ObjectId() });
    assert.equal(state.requiresPlatformReview, false);
    assert.equal(state.approvalStatus, 'approved');
    assert.ok(state.publishedAt instanceof Date);
  }
});

test('material content changes require rereview but operational stock changes do not', () => {
  assert.equal(hasReviewedContentUpdate({ name: 'Changed' }), true);
  assert.equal(hasReviewedContentUpdate({ wholesalePrice: 100 }), true);
  assert.equal(hasReviewedContentUpdate({ ingredients: 'Chicken' }), true);
  assert.equal(hasReviewedContentUpdate({ fdaRegistrationNumber: 'FDA-123' }), true);
  assert.equal(hasReviewedContentUpdate({ regulatoryDocuments: [] }), true);
  assert.equal(hasReviewedContentUpdate({ availableStock: 50 }), false);
  assert.equal(hasReviewedContentUpdate({ minimumOrderQuantity: 5 }), false);
  assert.equal(hasReviewedContentUpdate({ isActive: false }), false);
});

test('supplier submissions, platform review routes, audit trail, and protected files are wired', () => {
  const controller = read('controllers/supplierController.js');
  const routes = read('routes/suppliers.js');
  const model = read('models/SupplierProduct.js');
  const logs = read('models/SupplyChainLog.js');
  const notification = read('models/Notification.js');

  assert.match(controller, /FDA_REVIEW_CATEGORIES/);
  assert.match(controller, /buildSupplierProductApprovalState/);
  assert.match(controller, /An FDA product registration number is required/);
  assert.match(controller, /select\('\+regulatoryDocuments\.documentUrl \+fdaRegistrationNumber \+fdaRegistrationExpiry'\)/);
  assert.match(controller, /Verify and activate the supplier account before accepting its FDA compliance evidence/);
  assert.match(controller, /approvalStatus: 'pending_review',[\s\S]*not awaiting FDA compliance review/);
  assert.match(routes, /admin\/products\/reviews'[\s\S]*superAdminOnly/);
  assert.match(routes, /admin\/products\/:id\/review'[\s\S]*superAdminOnly/);
  assert.match(model, /documentUrl: \{ type: String, required: true, select: false \}/);
  assert.match(logs, /supplier_product_approved/);
  assert.match(notification, /supplier_product_review/);
});

test('catalog, carts, offer comparison, and final cart submission enforce publication', () => {
  const supplierController = read('controllers/supplierController.js');
  const purchaseController = read('controllers/purchaseOrderController.js');

  assert.match(supplierController, /const publishedFilter = withPublishedSupplierProduct\(filter\)/);
  assert.match(purchaseController, /SupplierProduct\.findOne\(withPublishedSupplierProduct/);
  assert.match(purchaseController, /const publishedFilter = withPublishedSupplierProduct\(filter\)/);
  assert.match(purchaseController, /!isSupplierProductPublished\(product\)/);
});

test('supplier and platform admin UIs expose category-scoped FDA review and automatic publication', () => {
  const supplierUi = read('client/src/pages/supplier/SupplierDashboard.js');
  const adminUi = read('client/src/pages/superadmin/SupplierManagement.js');
  const procurementUi = read('client/src/pages/admin/PurchaseOrders.js');

  assert.match(supplierUi, /FDA review not required/);
  assert.match(supplierUi, /Submit for FDA Review/);
  assert.match(supplierUi, /Publish Supply/);
  assert.match(supplierUi, /Pet food and nutrition information/);
  assert.match(supplierUi, /FDA product registration details/);
  assert.match(adminUi, /FDA compliance reviews/);
  assert.match(adminUi, /Verify & publish/);
  assert.match(adminUi, /Request changes/);
  assert.match(procurementUi, /FDA Evidence Reviewed/);
  assert.doesNotMatch(`${supplierUi}\n${adminUi}`, /\bDFA\b/);
});
