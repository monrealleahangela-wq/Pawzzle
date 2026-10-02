const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const InventoryLot = require('../models/InventoryLot');
const InventoryTransaction = require('../models/InventoryTransaction');
const Product = require('../models/Product');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProcurementReceivingReport = require('../models/ProcurementReceivingReport');
const Supplier = require('../models/Supplier');
const SupplierProduct = require('../models/SupplierProduct');
const InventoryLedgerService = require('../services/inventoryLedgerService');
const { submitReceivingInspection } = require('../controllers/purchaseOrderController');

const transactionTestUri = process.env.MONGODB_TRANSACTION_TEST_URI;

test('real MongoDB transaction rolls back and concurrent idempotent receipts apply once', {
  skip: !transactionTestUri
}, async t => {
  await mongoose.connect(transactionTestUri);
  await Promise.all([
    Inventory.init(),
    InventoryLot.init(),
    InventoryTransaction.init()
  ]);

  const store = new mongoose.Types.ObjectId();
  const product = new mongoose.Types.ObjectId();
  const performedBy = new mongoose.Types.ObjectId();
  const rollbackKey = `test-receipt-rollback:${product}`;
  const concurrentKey = `test-receipt-concurrent:${product}`;
  const cleanup = async () => {
    await Promise.all([
      Inventory.deleteMany({ store, product }),
      InventoryLot.deleteMany({ store, product }),
      InventoryTransaction.deleteMany({ store, product }),
      Product.deleteOne({ _id: product })
    ]);
  };
  t.after(async () => {
    await cleanup();
    await mongoose.disconnect();
  });
  await cleanup();
  await Product.collection.insertOne({
    _id: product,
    store,
    name: 'Atomic receipt fixture',
    sku: `ATOMIC-${product}`,
    stockQuantity: 0,
    stockStatus: 'out_of_stock',
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const base = {
    store,
    product,
    lotNumber: 'ATOMIC-ROLLBACK',
    quantity: 4,
    unitCost: 10,
    performedBy,
    idempotencyKey: rollbackKey
  };
  await assert.rejects(
    mongoose.connection.transaction(async session => {
      await InventoryLedgerService.receiveLot(base, { session });
      throw new Error('forced transaction abort');
    }),
    /forced transaction abort/
  );
  assert.equal(await InventoryLot.countDocuments({ store, product }), 0);
  assert.equal(await InventoryTransaction.countDocuments({ idempotencyKey: rollbackKey }), 0);
  assert.equal(await Inventory.countDocuments({ store, product }), 0);

  await InventoryLedgerService.receiveLot(base);
  await InventoryLedgerService.receiveLot(base);
  assert.equal((await InventoryLot.findOne({ store, product, lotNumber: base.lotNumber })).quantityAvailable, 4);
  assert.equal(await InventoryTransaction.countDocuments({ idempotencyKey: rollbackKey }), 1);

  const concurrent = {
    ...base,
    lotNumber: 'ATOMIC-CONCURRENT',
    quantity: 3,
    idempotencyKey: concurrentKey
  };
  await Promise.all([
    InventoryLedgerService.receiveLot(concurrent),
    InventoryLedgerService.receiveLot(concurrent)
  ]);
  assert.equal((await InventoryLot.findOne({ store, product, lotNumber: concurrent.lotNumber })).quantityAvailable, 3);
  assert.equal(await InventoryTransaction.countDocuments({ idempotencyKey: concurrentKey }), 1);
});

test('real receiving transaction rolls back all lines and retries the failed report exactly once', {
  skip: !transactionTestUri
}, async t => {
  await mongoose.connect(transactionTestUri);
  const store = new mongoose.Types.ObjectId();
  const actor = new mongoose.Types.ObjectId();
  const supplierUser = new mongoose.Types.ObjectId();
  const supplier = new mongoose.Types.ObjectId();
  const supplierProductA = new mongoose.Types.ObjectId();
  const supplierProductB = supplierProductA;
  const productA = new mongoose.Types.ObjectId();
  const productB = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();
  const now = new Date();
  const cleanup = async () => {
    await Promise.all([
      Inventory.deleteMany({ store }),
      InventoryLot.deleteMany({ store }),
      InventoryTransaction.deleteMany({ store }),
      ProcurementReceivingReport.deleteMany({ store }),
      PurchaseOrder.deleteMany({ store }),
      SupplierProduct.deleteMany({ _id: { $in: [supplierProductA, supplierProductB] } }),
      Supplier.deleteOne({ _id: supplier }),
      Product.deleteMany({ _id: { $in: [productA, productB] } })
    ]);
  };
  t.after(async () => {
    await cleanup();
    await mongoose.disconnect();
  });
  await cleanup();
  await Product.collection.insertMany([
    { _id: productA, store, name: 'Receiving A', sku: `RECEIVE-A-${productA}`, stockQuantity: 0, stockStatus: 'out_of_stock', createdAt: now, updatedAt: now },
    { _id: productB, store, name: 'Receiving B', sku: `RECEIVE-B-${productB}`, stockQuantity: 0, stockStatus: 'out_of_stock', createdAt: now, updatedAt: now }
  ]);
  await Supplier.collection.insertOne({
    _id: supplier,
    user: supplierUser,
    businessName: 'Atomic Supplier',
    createdAt: now,
    updatedAt: now
  });
  await SupplierProduct.collection.insertOne(
    { _id: supplierProductA, supplier, itemType: 'product', name: 'Supply', sku: `SUPPLY-${supplierProductA}`, wholesalePrice: 10, availableStock: 10, minimumOrderQuantity: 1, isActive: true, isDeleted: false, createdAt: now, updatedAt: now }
  );
  const order = await PurchaseOrder.create({
    _id: orderId,
    orderNumber: `PO-ATOMIC-${orderId}`,
    seller: actor,
    store,
    supplier,
    items: [
      { supplierProduct: supplierProductA, itemType: 'product', storeProduct: productA, productName: 'Supply A', quantity: 2, unitPrice: 10, totalPrice: 20 },
      { supplierProduct: supplierProductB, itemType: 'product', storeProduct: new mongoose.Types.ObjectId(), productName: 'Supply B', quantity: 3, unitPrice: 20, totalPrice: 60 }
    ],
    subtotal: 80,
    totalCost: 80,
    status: 'delivered',
    paymentTiming: 'after_inspection',
    paymentStatus: 'awaiting_inspection',
    inspectionStatus: 'awaiting_inspection'
  });
  const requestBody = {
    receivedAt: '2099-12-31T23:59:59.000Z',
    items: JSON.stringify(order.items.map(item => ({
      purchaseOrderItem: item._id,
      receivedQuantity: item.quantity,
      damagedQuantity: 0,
      incorrectQuantity: 0
    })))
  };
  const invoke = async () => {
    const result = {};
    const res = {
      status(code) { result.status = code; return this; },
      json(payload) { result.body = payload; return this; }
    };
    await submitReceivingInspection({
      params: { id: orderId },
      body: requestBody,
      files: [],
      user: { _id: actor, role: 'platform_admin' }
    }, res);
    return result;
  };

  const failed = await invoke();
  assert.equal(failed.status, 409);
  assert.equal(await InventoryTransaction.countDocuments({ store }), 0);
  assert.equal(await InventoryLot.countDocuments({ store }), 0);
  assert.equal((await SupplierProduct.findById(supplierProductA)).availableStock, 10);
  assert.deepEqual((await PurchaseOrder.findById(orderId)).items.map(item => item.receivedQuantity), [0, 0]);
  const failedReport = await ProcurementReceivingReport.findOne({ purchaseOrder: orderId });
  assert.equal(failedReport.processingStatus, 'failed');
  assert.equal(failedReport.receivedAt == null, true);

  await PurchaseOrder.updateOne(
    { _id: orderId, 'items._id': order.items[1]._id },
    { $set: { 'items.$.storeProduct': productB } }
  );
  requestBody.receivedAt = '2000-01-01T00:00:00.000Z';
  const successfulRetryStartedAt = new Date();
  const succeeded = await invoke();
  const successfulRetryFinishedAt = new Date();
  assert.equal(succeeded.status, 201);
  assert.equal(await InventoryTransaction.countDocuments({ store }), 2);
  assert.equal((await Inventory.findOne({ store, product: productA })).quantity, 2);
  assert.equal((await Inventory.findOne({ store, product: productB })).quantity, 3);
  assert.deepEqual((await PurchaseOrder.findById(orderId)).items.map(item => item.receivedQuantity), [2, 3]);
  const completedReport = await ProcurementReceivingReport.findOne({ purchaseOrder: orderId });
  assert.equal(completedReport.processingStatus, 'completed');
  assert.ok(completedReport.receivedAt >= successfulRetryStartedAt);
  assert.ok(completedReport.receivedAt <= successfulRetryFinishedAt);

  const committedTimestamp = completedReport.receivedAt.getTime();
  requestBody.receivedAt = '2099-01-01T00:00:00.000Z';
  assert.equal((await invoke()).status, 409);
  assert.equal((await ProcurementReceivingReport.findOne({ purchaseOrder: orderId })).receivedAt.getTime(), committedTimestamp);

  const timestampVariants = [
    ['absent', undefined],
    ['future', '2099-12-31T23:59:59.000Z'],
    ['old-timezone', '2001-02-03T04:05:06+08:00'],
    ['malformed', 'not-a-date']
  ];
  for (const [suffix, suppliedTimestamp] of timestampVariants) {
    const variantOrder = await PurchaseOrder.create({
      orderNumber: `PO-TIMESTAMP-${suffix}-${new mongoose.Types.ObjectId()}`,
      seller: actor,
      store,
      supplier,
      items: [{
        supplierProduct: supplierProductA,
        itemType: 'product',
        storeProduct: productA,
        productName: `Timestamp ${suffix}`,
        quantity: 1,
        unitPrice: 10,
        totalPrice: 10
      }],
      subtotal: 10,
      totalCost: 10,
      status: 'delivered',
      paymentTiming: 'after_inspection',
      paymentStatus: 'awaiting_inspection',
      inspectionStatus: 'awaiting_inspection'
    });
    const body = {
      items: JSON.stringify([{
        purchaseOrderItem: variantOrder.items[0]._id,
        receivedQuantity: 1,
        damagedQuantity: 0,
        incorrectQuantity: 0
      }])
    };
    if (suppliedTimestamp !== undefined) body.receivedAt = suppliedTimestamp;
    const startedAt = new Date();
    const result = {};
    await submitReceivingInspection({
      params: { id: variantOrder._id },
      body,
      files: [],
      user: { _id: actor, role: 'platform_admin' }
    }, {
      status(code) { result.status = code; return this; },
      json(payload) { result.body = payload; return this; }
    });
    const finishedAt = new Date();
    assert.equal(result.status, 201);
    const variantReport = await ProcurementReceivingReport.findOne({ purchaseOrder: variantOrder._id });
    assert.ok(variantReport.receivedAt >= startedAt, suffix);
    assert.ok(variantReport.receivedAt <= finishedAt, suffix);
  }
});
