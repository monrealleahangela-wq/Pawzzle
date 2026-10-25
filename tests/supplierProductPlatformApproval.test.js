const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const SupplierProduct = require('../models/SupplierProduct');
const {
  withPublishedSupplierProduct,
  isSupplierProductPublished,
  hasReviewedContentUpdate
} = require('../utils/supplierProductApproval');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('new supply approval state is represented without changing legacy publication', () => {
  const supplier = new mongoose.Types.ObjectId();
  const legacy = new SupplierProduct({
    supplier, name: 'Legacy supply', sku: 'LEGACY-1', category: 'other', wholesalePrice: 10, availableStock: 2
  });
  const pending = new SupplierProduct({
    supplier, name: 'New supply', sku: 'NEW-1', category: 'other', wholesalePrice: 20, availableStock: 2,
    requiresPlatformReview: true, approvalStatus: 'pending_review'
  });
  const approved = new SupplierProduct({
    supplier, name: 'Approved supply', sku: 'APPROVED-1', category: 'other', wholesalePrice: 30, availableStock: 2,
    requiresPlatformReview: true, approvalStatus: 'approved'
  });

  assert.equal(isSupplierProductPublished(legacy), true);
  assert.equal(isSupplierProductPublished(pending), false);
  assert.equal(isSupplierProductPublished(approved), true);
  assert.deepEqual(withPublishedSupplierProduct({ isActive: true }), {
    $and: [
      { isActive: true },
      { $or: [{ requiresPlatformReview: { $ne: true } }, { approvalStatus: 'approved' }] }
    ]
  });
});

test('material content changes require rereview but operational stock changes do not', () => {
  assert.equal(hasReviewedContentUpdate({ name: 'Changed' }), true);
  assert.equal(hasReviewedContentUpdate({ wholesalePrice: 100 }), true);
  assert.equal(hasReviewedContentUpdate({ ingredients: 'Chicken' }), true);
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

  assert.match(controller, /requiresPlatformReview: true/);
  assert.match(controller, /approvalStatus: 'pending_review'/);
  assert.match(controller, /Verify and activate the supplier account before approving its supplies/);
  assert.match(controller, /approvalStatus: 'pending_review',[\s\S]*This supply is not awaiting review or was already reviewed/);
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

test('supplier and platform admin UIs expose review status, evidence, and publication actions', () => {
  const supplierUi = read('client/src/pages/supplier/SupplierDashboard.js');
  const adminUi = read('client/src/pages/superadmin/SupplierManagement.js');
  const procurementUi = read('client/src/pages/admin/PurchaseOrders.js');

  assert.match(supplierUi, /Submit Supply for Review/);
  assert.match(supplierUi, /Pet food and nutrition information/);
  assert.match(supplierUi, /Compliance documents/);
  assert.match(adminUi, /Supply approvals/);
  assert.match(adminUi, /Approve & publish/);
  assert.match(adminUi, /Request changes/);
  assert.match(procurementUi, /Platform Verified Supply/);
});
