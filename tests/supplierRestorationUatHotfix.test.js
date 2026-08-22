const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  getActiveSupplierFilter,
  isSupplierAvailable,
  applySupplierLifecycleAction
} = require('../utils/supplierLifecycle');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

const activeSupplier = () => ({
  _id: 'supplier-identity-1',
  status: 'verified',
  isActive: true,
  isDeleted: false,
  verifiedAt: new Date('2025-01-01T00:00:00.000Z'),
  purchaseOrders: [{ _id: 'po-1', total: 1200 }],
  procurementHistory: [{ _id: 'procurement-1' }],
  relationships: [{ store: 'store-1', state: 'connected' }],
  performance: { completedOrders: 9 }
});

test('active supplier filter is the shared seller, procurement, and DSS source of truth', () => {
  assert.deepEqual(getActiveSupplierFilter(), {
    status: 'verified',
    isActive: true,
    isDeleted: false
  });
  assert.equal(isSupplierAvailable(activeSupplier()), true);
  assert.equal(isSupplierAvailable({ ...activeSupplier(), status: 'suspended' }), false);
  assert.equal(isSupplierAvailable({ ...activeSupplier(), isActive: false }), false);
  assert.equal(isSupplierAvailable({ ...activeSupplier(), isDeleted: true }), false);
});

test('suspend and reactivate preserve supplier identity and historical data', () => {
  const supplier = activeSupplier();
  const originalIdentity = supplier._id;
  const originalVerifiedAt = supplier.verifiedAt;
  const historicalState = JSON.parse(JSON.stringify({
    purchaseOrders: supplier.purchaseOrders,
    procurementHistory: supplier.procurementHistory,
    relationships: supplier.relationships,
    performance: supplier.performance
  }));

  applySupplierLifecycleAction(supplier, 'suspend', {
    actorId: 'platform-admin-1',
    reason: 'UAT lifecycle test'
  });
  assert.equal(supplier.status, 'suspended');
  assert.equal(supplier.isActive, false);
  assert.equal(isSupplierAvailable(supplier), false);

  applySupplierLifecycleAction(supplier, 'reactivate', { actorId: 'platform-admin-1' });
  assert.equal(supplier._id, originalIdentity);
  assert.equal(supplier.status, 'verified');
  assert.equal(supplier.isActive, true);
  assert.equal(supplier.verifiedAt, originalVerifiedAt);
  assert.equal(isSupplierAvailable(supplier), true);
  assert.deepEqual(JSON.parse(JSON.stringify({
    purchaseOrders: supplier.purchaseOrders,
    procurementHistory: supplier.procurementHistory,
    relationships: supplier.relationships,
    performance: supplier.performance
  })), historicalState);
});

test('reactivation is restricted to suspended non-archived suppliers', () => {
  assert.throws(
    () => applySupplierLifecycleAction(activeSupplier(), 'reactivate'),
    /Only a suspended supplier can be reactivated/
  );
  assert.throws(
    () => applySupplierLifecycleAction({ ...activeSupplier(), status: 'suspended', isActive: false, isDeleted: true }, 'reactivate'),
    /Archived suppliers cannot be restored/
  );
  assert.throws(
    () => applySupplierLifecycleAction({ ...activeSupplier(), status: 'suspended', isActive: false }, 'verify'),
    /Use Reactivate/
  );
});

test('seller discovery, catalog, procurement, and DSS all enforce current supplier availability', () => {
  const supplierController = read('controllers/supplierController.js');
  const purchaseOrderController = read('controllers/purchaseOrderController.js');
  const decisionSupportService = read('services/decisionSupportService.js');

  assert.match(supplierController, /let filter = getActiveSupplierFilter\(\)/);
  assert.match(supplierController, /if \(!isSupplierAvailable\(supplier\)\)[\s\S]*Supplier not found or unavailable/);
  assert.match(purchaseOrderController, /if \(!isSupplierAvailable\(supplier\)\)[\s\S]*Only active verified suppliers can receive orders/);
  assert.match(decisionSupportService, /Supplier\.find\(getActiveSupplierFilter\(\)\)/);
});

test('platform reactivation preserves product state and repairs only unaudited legacy deactivations', () => {
  const controller = read('controllers/supplierController.js');
  const logModel = read('models/SupplyChainLog.js');

  assert.match(controller, /action === 'reactivate' && legacyDeactivation/);
  assert.match(controller, /isDeleted: false, isActive: false/);
  assert.doesNotMatch(controller, /SupplierProduct\.updateMany\(\{ supplier: supplier\._id \}, \{ isActive: false \}\)/);
  assert.match(controller, /productAvailabilityPreserved: true/);
  assert.match(logModel, /'supplier_reactivated', 'supplier_deactivated', 'supplier_updated'/);
  assert.match(logModel, /'super_admin', 'platform_admin'/);
});

test('admin UI exposes Reactivate and refetches while server route remains platform-admin only', () => {
  const ui = read('client/src/pages/superadmin/SupplierManagement.js');
  const routes = read('routes/suppliers.js');
  const controller = read('controllers/supplierController.js');

  assert.match(ui, /handleAction\(s\._id, 'reactivate'\)/);
  assert.match(ui, /Reactivate supplier/);
  assert.match(ui, /await fetchSuppliers\(\)/);
  assert.match(routes, /router\.patch\('\/admin\/:id\/verify', authenticate, superAdminOnly, adminVerifySupplier\)/);
  assert.doesNotMatch(controller, /const allowed = \[[^\]]*'isActive'/);
});

test('store ownership checks and historical purchase-order queries remain intact', () => {
  const purchaseOrderController = read('controllers/purchaseOrderController.js');
  const supplierController = read('controllers/supplierController.js');

  assert.match(purchaseOrderController, /canOperateStore/);
  assert.match(purchaseOrderController, /Product\.exists\(\{ _id: item\.storeProductId, store,/);
  assert.match(supplierController, /PurchaseOrder\.find\(\{ supplier: supplier\._id, isDeleted: false \}\)/);
});
