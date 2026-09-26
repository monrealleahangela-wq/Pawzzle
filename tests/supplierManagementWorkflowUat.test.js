const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
const {
  getActiveSupplierFilter,
  getSelectableSupplierFilterForStore,
  isSupplierSelectableForStore,
  applySupplierLifecycleAction
} = require('../utils/supplierLifecycle');

const active = overrides => ({
  status: 'verified', isActive: true, isDeleted: false,
  supplierType: 'platform', storeAssociations: [], ...overrides
});

test('one Supplier model represents platform and store-added pathways without a duplicate account system', () => {
  const model = read('models/Supplier.js');
  const user = read('models/User.js');
  const supplierModels = fs.readdirSync(path.join(__dirname, '..', 'models')).filter(name => /^Supplier.*\.js$/.test(name));
  assert.deepEqual(supplierModels.sort(), ['Supplier.js', 'SupplierProduct.js']);
  assert.match(model, /supplierType:[\s\S]*\['platform', 'store_added'\]/);
  assert.match(model, /storeAssociations:[\s\S]*pending_activation[\s\S]*active[\s\S]*inactive/);
  assert.match(model, /applicationDocuments:[\s\S]*business_registration[\s\S]*bir_certificate/);
  assert.match(model, /resubmission_required/);
  assert.match(user, /'supplier'/);
  assert.match(user, /requiresPasswordChange/);
});

test('platform discovery excludes store-added suppliers while store selection admits only the inviting store', () => {
  assert.deepEqual(getActiveSupplierFilter().$or, [
    { supplierType: 'platform' },
    { supplierType: { $exists: false } }
  ]);
  assert.equal(isSupplierSelectableForStore(active(), 'store-a'), true);
  const local = active({ supplierType: 'store_added', storeAssociations: [{ store: 'store-a', status: 'active' }] });
  assert.equal(isSupplierSelectableForStore(local, 'store-a'), true);
  assert.equal(isSupplierSelectableForStore(local, 'store-b'), false);
  assert.equal(isSupplierSelectableForStore(active({ ...local, isActive: false }), 'store-a'), false);
  const filter = getSelectableSupplierFilterForStore('store-a');
  assert.equal(filter.status, 'verified');
  assert.match(JSON.stringify(filter), /store_added/);
  assert.match(JSON.stringify(filter), /store-a/);
});

test('store invitation is server-scoped, tokenized, expiring, single-use, and forces password replacement', () => {
  const controller = read('controllers/supplierController.js');
  const routes = read('routes/suppliers.js');
  const middleware = read('middleware/auth.js');
  const email = read('utils/emailService.js');
  assert.match(controller, /const store = await resolveAuthorizedStore\(req\.user\)/);
  assert.doesNotMatch(controller.match(/const createStoreSupplier[\s\S]*?const getStoreManagedSuppliers/)?.[0] || '', /req\.body\.storeId/);
  assert.match(controller, /crypto\.randomBytes\(32\)/);
  assert.match(controller, /createHash\('sha256'\)/);
  assert.match(controller, /48 \* 60 \* 60 \* 1000/);
  assert.match(controller, /'invitation\.acceptedAt': \{ \$exists: false \}/);
  assert.match(controller, /requiresPasswordChange: true/);
  assert.match(routes, /requirePasswordChangeCompleted, getSupplierDashboard/);
  assert.match(middleware, /PASSWORD_CHANGE_REQUIRED/);
  assert.match(email, /sendSupplierInvitation/);
  assert.match(email, /Activate supplier account/);
});

test('store-added supplier endpoints are permissioned and never require platform documents', () => {
  const routes = read('routes/suppliers.js');
  const controller = read('controllers/supplierController.js');
  assert.match(routes, /post\('\/store-managed', authenticate, requirePermission\('suppliers\.manage', 'procurement\.manage'\), createStoreSupplier\)/);
  assert.match(routes, /patch\('\/store-managed\/:id\/status'[\s\S]*updateStoreSupplierAssociation/);
  const storeCreate = controller.match(/const createStoreSupplier[\s\S]*?const getStoreManagedSuppliers/)?.[0] || '';
  assert.match(storeCreate, /supplierType: 'store_added'/);
  assert.match(storeCreate, /status: 'verified'/);
  assert.doesNotMatch(storeCreate, /applicationDocuments|verificationDocuments|businessRegistration|birCertificate/);
});

test('platform applications require protected uploaded documents and support review resubmission', () => {
  const routes = read('routes/suppliers.js');
  const controller = read('controllers/supplierController.js');
  const lifecycle = read('utils/supplierLifecycle.js');
  assert.match(routes, /supplierDocumentUpload = uploadDoc\.fields/);
  assert.match(routes, /businessRegistration/);
  assert.match(routes, /birCertificate/);
  assert.match(controller, /applicationDocuments\.length !== REQUIRED_PLATFORM_DOCUMENTS\.length/);
  assert.match(controller, /action === 'request_resubmission'/);
  assert.match(controller, /hasRequiredPlatformDocuments\(supplier\)/);
  assert.match(lifecycle, /supplier\.status = 'resubmission_required'/);
  const supplier = active({ supplierType: 'platform' });
  applySupplierLifecycleAction(supplier, 'request_resubmission', { reason: 'Replace unreadable documents' });
  assert.equal(supplier.status, 'resubmission_required');
  assert.equal(supplier.isActive, false);
  assert.throws(() => applySupplierLifecycleAction(active({ supplierType: 'store_added' }), 'request_resubmission'), /do not use platform document verification/);
});

test('purchase orders route to the exact eligible supplier product and authoritative caller store', () => {
  const controller = read('controllers/purchaseOrderController.js');
  assert.match(controller, /const store = await resolveUserStore\(req\.user\)/);
  assert.match(controller, /isSupplierSelectableForStore\(supplier, store\)/);
  assert.match(controller, /_id: item\.supplierProductId,[\s\S]*supplier: supplierId/);
  assert.match(controller, /supplier: supplierId,[\s\S]*items: resolvedItems/);
  assert.doesNotMatch(controller.match(/const createPurchaseOrder[\s\S]*?const getSellerOrders/)?.[0] || '', /store\s*=\s*req\.body\.store/);
});

test('supplier and admin UIs expose invitation, document review, resubmission, products, and orders', () => {
  const procurement = read('client/src/pages/admin/PurchaseOrders.js');
  const supplier = read('client/src/pages/supplier/SupplierDashboard.js');
  const platform = read('client/src/pages/superadmin/SupplierManagement.js');
  const app = read('client/src/App.js');
  assert.match(procurement, /Add Store Supplier/);
  assert.match(procurement, /Create & Email Invitation/);
  assert.match(procurement, /Store-added/);
  assert.match(supplier, /Platform supplier verification/);
  assert.match(supplier, /Resubmit documents/);
  assert.match(supplier, /Add Product/);
  assert.match(supplier, /purchase orders received/);
  assert.match(platform, /Application Documents/);
  assert.match(platform, /request_resubmission/);
  assert.match(app, /supplier\/activate\/:token/);
  assert.match(app, /roles=\{\['super_admin', 'platform_admin'\]\}><SupplierManagement/);
});
