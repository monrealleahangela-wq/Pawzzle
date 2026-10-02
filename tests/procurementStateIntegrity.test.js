const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const Supplier = require('../models/Supplier');
const SupplierProduct = require('../models/SupplierProduct');
const PurchaseOrder = require('../models/PurchaseOrder');
const SupplyChainLog = require('../models/SupplyChainLog');
const { createPurchaseOrder } = require('../controllers/purchaseOrderController');
const { addProduct, updateProduct, deleteProduct } = require('../controllers/supplierController');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

const invoke = async (handler, req) => {
  const result = { status: 200 };
  const res = {
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; }
  };
  await handler(req, res);
  return result;
};

test('live-pet catalog creation is transactional and catalog audit logging is secondary', () => {
  const controller = read('controllers/supplierController.js');
  const add = controller.match(/const addProduct[\s\S]*?const getMyProducts/)?.[0] || '';
  const update = controller.match(/const updateProduct[\s\S]*?const deleteProduct/)?.[0] || '';
  const remove = controller.match(/const deleteProduct[\s\S]*?const getSupplierOrders/)?.[0] || '';

  assert.match(add, /if \(itemType === 'live_pet'\) \{[\s\S]*mongoose\.connection\.transaction\(persistCatalogEntry\)/);
  assert.match(add, /pet\.save\(\{ session \}\)/);
  assert.match(add, /product\.save\(\{ session \}\)/);
  assert.match(add, /Supplier\.updateOne\([\s\S]*\{ session \}\)/);
  assert.match(add, /settleSupplierSecondaryEffects\('Add supplier product'/);
  assert.match(update, /settleSupplierSecondaryEffects\('Update supplier product'/);
  assert.match(remove, /settleSupplierSecondaryEffects\('Delete supplier product'/);
  assert.doesNotMatch(add, /await SupplyChainLog\.create/);
  assert.doesNotMatch(update, /await SupplyChainLog\.create/);
  assert.doesNotMatch(remove, /await SupplyChainLog\.create/);
});

test('catalog audit failures do not turn successful add, update, or delete mutations into false failures', async () => {
  const originals = {
    supplierFindOne: Supplier.findOne,
    supplierUpdateOne: Supplier.updateOne,
    productSave: SupplierProduct.prototype.save,
    productFindOne: SupplierProduct.findOne,
    orderExists: PurchaseOrder.exists,
    logCreate: SupplyChainLog.create,
    transaction: mongoose.connection.transaction,
    consoleError: console.error
  };
  const supplierId = new mongoose.Types.ObjectId();
  const productId = new mongoose.Types.ObjectId();
  const supplier = {
    _id: supplierId,
    status: 'verified',
    isActive: true,
    isDeleted: false
  };
  const product = {
    _id: productId,
    supplier: supplierId,
    itemType: 'product',
    name: 'Existing supply',
    wholesalePrice: 20,
    availableStock: 4,
    isActive: true,
    isDeleted: false,
    async save() { return this; }
  };
  const loggedSecondaryFailures = [];

  Supplier.findOne = async () => supplier;
  Supplier.updateOne = async () => ({ acknowledged: true, modifiedCount: 1 });
  SupplierProduct.prototype.save = async function saveProduct() { return this; };
  SupplierProduct.findOne = () => ({ session: async () => product });
  PurchaseOrder.exists = () => ({ session: async () => null });
  mongoose.connection.transaction = async callback => callback({ id: 'mock-session' });
  SupplyChainLog.create = async () => { throw new Error('forced secondary log failure'); };
  console.error = (...args) => loggedSecondaryFailures.push(args);

  try {
    const actor = { _id: new mongoose.Types.ObjectId(), role: 'supplier' };
    const added = await invoke(addProduct, {
      user: actor,
      body: {
        itemType: 'product',
        name: 'New supply',
        sku: 'NEW-SUPPLY',
        category: 'general_product',
        wholesalePrice: 10,
        availableStock: 5
      },
      params: {}, query: {}
    });
    assert.equal(added.status, 201);
    assert.equal(added.body.name, 'New supply');

    const updated = await invoke(updateProduct, {
      user: actor,
      body: { name: 'Updated supply' },
      params: { id: String(productId) }, query: {}
    });
    assert.equal(updated.status, 200);
    assert.equal(product.name, 'Updated supply');

    const removed = await invoke(deleteProduct, {
      user: actor,
      body: {}, params: { id: String(productId) }, query: {}
    });
    assert.equal(removed.status, 200);
    assert.equal(product.isDeleted, true);
    assert.equal(product.isActive, false);
    assert.equal(loggedSecondaryFailures.length, 3);
    assert.ok(loggedSecondaryFailures.every(args => String(args[0]).includes('secondary operation failed')));
  } finally {
    Supplier.findOne = originals.supplierFindOne;
    Supplier.updateOne = originals.supplierUpdateOne;
    SupplierProduct.prototype.save = originals.productSave;
    SupplierProduct.findOne = originals.productFindOne;
    PurchaseOrder.exists = originals.orderExists;
    SupplyChainLog.create = originals.logCreate;
    mongoose.connection.transaction = originals.transaction;
    console.error = originals.consoleError;
  }
});

test('catalog database failures still fail the authoritative add operation', async () => {
  const originals = {
    supplierFindOne: Supplier.findOne,
    productSave: SupplierProduct.prototype.save,
    consoleError: console.error
  };
  Supplier.findOne = async () => ({
    _id: new mongoose.Types.ObjectId(),
    status: 'verified',
    isActive: true,
    isDeleted: false
  });
  SupplierProduct.prototype.save = async () => { throw new Error('forced catalog database failure'); };
  console.error = () => {};

  try {
    const result = await invoke(addProduct, {
      user: { _id: new mongoose.Types.ObjectId(), role: 'supplier' },
      body: {
        itemType: 'product',
        name: 'Failed supply',
        sku: 'FAILED-SUPPLY',
        category: 'general_product',
        wholesalePrice: 10,
        availableStock: 5
      },
      params: {}, query: {}
    });
    assert.equal(result.status, 500);
    assert.equal(result.body.message, 'forced catalog database failure');
  } finally {
    Supplier.findOne = originals.supplierFindOne;
    SupplierProduct.prototype.save = originals.productSave;
    console.error = originals.consoleError;
  }
});

test('supplier stock is conditionally committed during authoritative cart submission and not consumed twice at receiving', () => {
  const controller = read('controllers/purchaseOrderController.js');
  const model = read('models/PurchaseOrder.js');
  const commitments = read('services/procurementStockCommitmentService.js');
  const submit = controller.match(/const submitProcurementCart[\s\S]*?const createPurchaseOrder/)?.[0] || '';
  const receiving = controller.match(/const recordReceivedSupplierQuantity[\s\S]*?const applyReceivingItem/)?.[0] || '';

  assert.match(submit, /mongoose\.connection\.transaction/);
  assert.match(submit, /commitPurchaseOrderStock\(\{ order, session \}\)/);
  assert.match(commitments, /availableStock: \{ \$gte: quantity \}/);
  assert.match(commitments, /\$inc: \{ availableStock: -quantity \}/);
  assert.match(model, /supplierStockCommittedQuantity/);
  assert.match(model, /supplierStockCommitmentReleased/);
  assert.match(receiving, /committedQuantity > 0/);
  assert.match(receiving, /orderItem\.receivedQuantity = Number\(acceptedQuantity\)/);
});

test('store and supplier cancellation release exact commitments inside MongoDB transactions', () => {
  const purchaseController = read('controllers/purchaseOrderController.js');
  const supplierController = read('controllers/supplierController.js');
  const commitments = read('services/procurementStockCommitmentService.js');
  const storeCancel = purchaseController.match(/const cancelOrder[\s\S]*?const parseInspectionItems/)?.[0] || '';
  const supplierStatus = supplierController.match(/const updateOrderStatus[\s\S]*?const submitOrderResolution/)?.[0] || '';

  assert.match(storeCancel, /mongoose\.connection\.transaction\(async session/);
  assert.match(storeCancel, /releasePurchaseOrderStock\(\{ order, session \}\)/);
  assert.match(storeCancel, /order\.save\(\{ session \}\)/);
  assert.match(supplierStatus, /mongoose\.connection\.transaction\(async session/);
  assert.match(supplierStatus, /releasePurchaseOrderStock\(\{ order: cancelledOrder, session \}\)/);
  assert.match(commitments, /_id: item\.pet[\s\S]*'procurementReservation\.purchaseOrder': order\._id/);
  assert.match(commitments, /acquiredThroughPurchaseOrder: null/);
});

test('supplier cannot unilaterally return a delivered PO and must use discrepancy resolution', () => {
  const controller = read('controllers/supplierController.js');
  const status = controller.match(/const updateOrderStatus[\s\S]*?const submitOrderResolution/)?.[0] || '';
  assert.doesNotMatch(status, /delivered:\s*\['returned'\]/);
  assert.match(controller, /\['replacement', 'return_correction', 'refund_credit'\]/);
});

test('unused direct PO endpoint is retained as an explicit non-bypassable deprecation response', async () => {
  const result = { status: 200 };
  const res = {
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; }
  };
  await createPurchaseOrder({ body: {} }, res);
  assert.equal(result.status, 410);
  assert.equal(result.body.code, 'PROCUREMENT_CART_REQUIRED');

  const page = read('client/src/pages/admin/PurchaseOrders.js');
  assert.match(page, /purchaseOrderService\.submitCart/);
  assert.doesNotMatch(page, /purchaseOrderService\.create\(/);
});
