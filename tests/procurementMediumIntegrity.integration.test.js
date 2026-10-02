const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProcurementReceivingReport = require('../models/ProcurementReceivingReport');
const Supplier = require('../models/Supplier');
const SupplyChainLog = require('../models/SupplyChainLog');
const Notification = require('../models/Notification');
const { cloudinary } = require('../middleware/upload');
const {
  reviewSupplierResolution,
  submitResolutionReinspection,
  getReceivingEvidenceAccess
} = require('../controllers/purchaseOrderController');
const {
  submitOrderResolution,
  markResolutionDelivered,
  adminDeactivateSupplier,
  updateOrderStatus
} = require('../controllers/supplierController');

const transactionTestUri = process.env.MONGODB_TRANSACTION_TEST_URI;
const isolatedTransactionTestUri = transactionTestUri ? (() => {
  const uri = new URL(transactionTestUri);
  const baseDatabase = uri.pathname.replace(/^\//, '') || 'pawzzle_transaction_test';
  uri.pathname = `/${baseDatabase}_medium_integrity_${process.pid}`;
  return uri.toString();
})() : null;

const invoke = async (handler, req) => {
  const result = { status: 200, headers: {} };
  const res = {
    status(code) { result.status = code; return this; },
    set(name, value) { result.headers[name] = value; return this; },
    json(body) { result.body = body; return this; }
  };
  await handler(req, res);
  return result;
};

test('real MongoDB guards resolution transitions, lifecycle side effects, and evidence scope', {
  skip: !transactionTestUri
}, async t => {
  await mongoose.connect(isolatedTransactionTestUri, { autoIndex: false });
  await mongoose.connection.dropDatabase();

  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const store = new mongoose.Types.ObjectId();
  const otherStore = new mongoose.Types.ObjectId();
  const supplierId = new mongoose.Types.ObjectId();
  const supplierUser = new mongoose.Types.ObjectId();
  const otherSupplierId = new mongoose.Types.ObjectId();
  const otherSupplierUser = new mongoose.Types.ObjectId();
  const storeActor = new mongoose.Types.ObjectId();
  const orderIds = [];

  t.after(async () => {
    await Promise.all([
      ProcurementReceivingReport.deleteMany({ store: { $in: [store, otherStore] } }),
      PurchaseOrder.deleteMany({ store: { $in: [store, otherStore] } }),
      Notification.deleteMany({ relatedId: { $in: orderIds } }),
      SupplyChainLog.deleteMany({ supplier: { $in: [supplierId, otherSupplierId] } }),
      Supplier.deleteMany({ _id: { $in: [supplierId, otherSupplierId] } })
    ]);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  await Supplier.collection.insertMany([
    {
      _id: supplierId,
      user: supplierUser,
      businessName: `Medium Integrity Supplier ${nonce}`,
      businessSlug: `medium-integrity-${nonce}`,
      contactPerson: 'Supplier One',
      email: `supplier-one-${nonce}@example.test`,
      phone: '09170000001',
      address: { street: '1 Test Street', city: 'Test City', province: 'Test Province', country: 'PH' },
      supplierType: 'platform', status: 'verified', isActive: true, isDeleted: false,
      performance: { totalOrders: 0, completedOrders: 0, cancelledOrders: 0, averageDeliveryDays: 0, reliabilityScore: 100, totalRevenue: 0 },
      createdAt: new Date(), updatedAt: new Date()
    },
    {
      _id: otherSupplierId,
      user: otherSupplierUser,
      businessName: `Other Medium Supplier ${nonce}`,
      businessSlug: `other-medium-${nonce}`,
      contactPerson: 'Supplier Two',
      email: `supplier-two-${nonce}@example.test`,
      phone: '09170000002',
      address: { street: '2 Test Street', city: 'Test City', province: 'Test Province', country: 'PH' },
      supplierType: 'platform', status: 'verified', isActive: true, isDeleted: false,
      performance: { totalOrders: 0, completedOrders: 0, cancelledOrders: 0, averageDeliveryDays: 0, reliabilityScore: 100, totalRevenue: 0 },
      createdAt: new Date(), updatedAt: new Date()
    }
  ]);

  const createIssueFixture = async suffix => {
    const supplierProduct = new mongoose.Types.ObjectId();
    const order = await PurchaseOrder.create({
      orderNumber: `PO-MEDIUM-${nonce}-${suffix}`,
      seller: storeActor,
      store,
      supplier: supplierId,
      items: [{
        supplierProduct,
        itemType: 'product',
        productName: `Supply ${suffix}`,
        quantity: 10,
        unitPrice: 10,
        totalPrice: 100,
        receivedQuantity: 8
      }],
      subtotal: 100,
      totalCost: 100,
      status: 'issue_reported',
      paymentTiming: 'after_inspection',
      paymentStatus: 'awaiting_inspection',
      inspectionStatus: 'issue_reported'
    });
    orderIds.push(order._id);
    const report = await ProcurementReceivingReport.create({
      purchaseOrder: order._id,
      store,
      supplier: supplierId,
      receivedBy: storeActor,
      outcome: 'partially_accepted',
      processingStatus: 'completed',
      resolutionStatus: 'pending_supplier_resolution',
      paymentReady: false,
      items: [{
        purchaseOrderItem: order.items[0]._id,
        itemType: 'product',
        expectedQuantity: 10,
        receivedQuantity: 8,
        damagedQuantity: 0,
        incorrectQuantity: 0,
        acceptedQuantity: 8,
        missingQuantity: 2,
        condition: 'missing',
        inventoryApplied: true
      }]
    });
    await PurchaseOrder.updateOne({ _id: order._id }, { $set: { receivingReport: report._id } });
    return { order, report };
  };

  const resolutionRequest = fixture => ({
    params: { id: fixture.order._id },
    body: {
      type: 'replacement',
      items: [{ purchaseOrderItem: fixture.order.items[0]._id, proposedQuantity: 2 }],
      notes: 'Replace two missing units.'
    },
    query: {},
    user: { _id: supplierUser, role: 'supplier' }
  });

  const prepareReinspection = async suffix => {
    const fixture = await createIssueFixture(suffix);
    const submitted = await invoke(submitOrderResolution, resolutionRequest(fixture));
    assert.equal(submitted.status, 201);
    const resolutionId = submitted.body.resolution._id;
    assert.equal((await invoke(reviewSupplierResolution, {
      params: { id: fixture.order._id, resolutionId },
      body: { decision: 'accept' }, query: {},
      user: { _id: storeActor, role: 'platform_admin' }
    })).status, 200);
    assert.equal((await invoke(markResolutionDelivered, {
      params: { id: fixture.order._id, resolutionId },
      body: { notes: 'Replacement delivered.' }, query: {},
      user: { _id: supplierUser, role: 'supplier' }
    })).status, 200);
    return { ...fixture, resolutionId };
  };

  const reinspectionRequest = (fixture, inspectedAt) => ({
    params: { id: fixture.order._id, resolutionId: fixture.resolutionId },
    body: {
      items: JSON.stringify([{
        purchaseOrderItem: fixture.order.items[0]._id,
        receivedQuantity: 0,
        damagedQuantity: 0,
        incorrectQuantity: 0
      }]),
      ...(inspectedAt === undefined ? {} : { inspectedAt })
    },
    files: [],
    query: {},
    user: { _id: storeActor, role: 'platform_admin' }
  });

  await t.test('concurrent supplier resolution submissions commit one PO/report transition', async () => {
    const fixture = await createIssueFixture('submit-race');
    const results = await Promise.all([
      invoke(submitOrderResolution, resolutionRequest(fixture)),
      invoke(submitOrderResolution, resolutionRequest(fixture))
    ]);
    assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
    const [order, report] = await Promise.all([
      PurchaseOrder.findById(fixture.order._id),
      ProcurementReceivingReport.findById(fixture.report._id)
    ]);
    assert.equal(order.status, 'resolution_submitted');
    assert.equal(report.resolutionStatus, 'resolution_submitted');
    assert.equal(report.resolutionSubmissions.length, 1);
  });

  await t.test('concurrent Store accept/reject decisions cannot overwrite each other', async () => {
    const fixture = await createIssueFixture('decision-race');
    const submitted = await invoke(submitOrderResolution, resolutionRequest(fixture));
    assert.equal(submitted.status, 201);
    const resolutionId = submitted.body.resolution._id;
    const request = decision => ({
      params: { id: fixture.order._id, resolutionId },
      body: { decision, notes: `${decision} concurrently` },
      query: {},
      user: { _id: storeActor, role: 'platform_admin' }
    });
    const results = await Promise.all([
      invoke(reviewSupplierResolution, request('accept')),
      invoke(reviewSupplierResolution, request('reject'))
    ]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    const [order, report] = await Promise.all([
      PurchaseOrder.findById(fixture.order._id),
      ProcurementReceivingReport.findById(fixture.report._id)
    ]);
    const submission = report.resolutionSubmissions.id(resolutionId);
    if (submission.status === 'rejected') {
      assert.equal(order.status, 'resolution_rejected');
      assert.equal(report.resolutionStatus, 'resolution_rejected');
    } else {
      assert.equal(submission.status, 'awaiting_replacement');
      assert.equal(order.status, 'awaiting_replacement');
      assert.equal(report.resolutionStatus, 'awaiting_replacement');
    }
  });

  await t.test('concurrent replacement-delivery reports advance to reinspection once', async () => {
    const fixture = await createIssueFixture('delivery-race');
    const submitted = await invoke(submitOrderResolution, resolutionRequest(fixture));
    const resolutionId = submitted.body.resolution._id;
    const accepted = await invoke(reviewSupplierResolution, {
      params: { id: fixture.order._id, resolutionId },
      body: { decision: 'accept' }, query: {},
      user: { _id: storeActor, role: 'platform_admin' }
    });
    assert.equal(accepted.status, 200);
    const request = {
      params: { id: fixture.order._id, resolutionId },
      body: { notes: 'Replacement delivered.' }, query: {},
      user: { _id: supplierUser, role: 'supplier' }
    };
    const results = await Promise.all([
      invoke(markResolutionDelivered, request),
      invoke(markResolutionDelivered, request)
    ]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    const [order, report] = await Promise.all([
      PurchaseOrder.findById(fixture.order._id),
      ProcurementReceivingReport.findById(fixture.report._id)
    ]);
    assert.equal(order.status, 'reinspection');
    assert.equal(report.resolutionStatus, 'reinspection');
    assert.equal(report.resolutionSubmissions.id(resolutionId).status, 'replacement_delivered');
    assert.equal(report.resolutionHistory.filter(row => row.action === 'replacement_delivery_reported').length, 1);
  });

  await t.test('reinspection event time is server-authored for absent, forged, old-timezone, and malformed input', async () => {
    const timestampVariants = [
      ['absent', undefined],
      ['future', '2099-12-31T23:59:59.000Z'],
      ['old-timezone', '2001-02-03T04:05:06+08:00'],
      ['malformed', 'not-a-date']
    ];
    for (const [suffix, suppliedTimestamp] of timestampVariants) {
      const fixture = await prepareReinspection(`timestamp-${suffix}`);
      const startedAt = new Date();
      const result = await invoke(submitResolutionReinspection, reinspectionRequest(fixture, suppliedTimestamp));
      const finishedAt = new Date();
      assert.equal(result.status, 201, suffix);
      const report = await ProcurementReceivingReport.findById(fixture.report._id);
      const attempt = report.reinspections.id(result.body.receivingReport.reinspections.at(-1)._id);
      assert.equal(attempt.processingStatus, 'completed');
      assert.ok(attempt.inspectedAt >= startedAt, suffix);
      assert.ok(attempt.inspectedAt <= finishedAt, suffix);
    }
  });

  await t.test('failed and stale reinspection attempts acquire an authoritative timestamp only on successful commit', async () => {
    const fixture = await prepareReinspection('timestamp-retry');
    const originalSave = PurchaseOrder.prototype.save;
    PurchaseOrder.prototype.save = async function forcedReinspectionFailure(options) {
      if (String(this._id) === String(fixture.order._id) && options?.session) {
        throw new Error('forced reinspection commit failure');
      }
      return originalSave.call(this, options);
    };
    let failed;
    try {
      failed = await invoke(submitResolutionReinspection, reinspectionRequest(fixture, '2099-12-31T23:59:59.000Z'));
    } finally {
      PurchaseOrder.prototype.save = originalSave;
    }
    assert.equal(failed.status, 500);
    let report = await ProcurementReceivingReport.findById(fixture.report._id);
    let attempt = report.reinspections.at(-1);
    assert.equal(attempt.processingStatus, 'failed');
    assert.equal(attempt.inspectedAt == null, true);

    const retryStartedAt = new Date();
    const retried = await invoke(submitResolutionReinspection, reinspectionRequest(fixture, '2000-01-01T00:00:00.000Z'));
    const retryFinishedAt = new Date();
    assert.equal(retried.status, 201);
    report = await ProcurementReceivingReport.findById(fixture.report._id);
    attempt = report.reinspections.at(-1);
    assert.equal(attempt.processingStatus, 'completed');
    assert.ok(attempt.inspectedAt >= retryStartedAt);
    assert.ok(attempt.inspectedAt <= retryFinishedAt);

    const staleFixture = await prepareReinspection('timestamp-stale');
    const legacyClientTime = new Date('2099-12-31T23:59:59.000Z');
    await ProcurementReceivingReport.updateOne({ _id: staleFixture.report._id }, {
      $set: {
        resolutionStatus: 'reinspection_processing',
        updatedAt: new Date(Date.now() - 10 * 60 * 1000)
      },
      $push: {
        reinspections: {
          resolutionSubmission: staleFixture.resolutionId,
          inspectedBy: storeActor,
          inspectedAt: legacyClientTime,
          items: [{
            purchaseOrderItem: staleFixture.order.items[0]._id,
            expectedQuantity: 2,
            receivedQuantity: 0,
            damagedQuantity: 0,
            incorrectQuantity: 0,
            acceptedQuantity: 0,
            receivedQuantityTarget: 8,
            missingQuantity: 2,
            condition: 'missing',
            inventoryApplied: false
          }],
          outcome: 'issue_reported',
          processingStatus: 'processing'
        }
      }
    }, { timestamps: false });
    const reclaimStartedAt = new Date();
    const reclaimed = await invoke(submitResolutionReinspection, reinspectionRequest(staleFixture));
    const reclaimFinishedAt = new Date();
    assert.equal(reclaimed.status, 201);
    report = await ProcurementReceivingReport.findById(staleFixture.report._id);
    attempt = report.reinspections.at(-1);
    assert.equal(attempt.processingStatus, 'completed');
    assert.ok(attempt.inspectedAt >= reclaimStartedAt);
    assert.ok(attempt.inspectedAt <= reclaimFinishedAt);
    assert.notEqual(attempt.inspectedAt.getTime(), legacyClientTime.getTime());
  });

  await t.test('a failed PO write rolls back the paired receiving-report transition', async () => {
    const fixture = await createIssueFixture('rollback');
    const originalSave = PurchaseOrder.prototype.save;
    PurchaseOrder.prototype.save = async function forcedFailure(options) {
      if (String(this._id) === String(fixture.order._id) && options?.session) {
        throw new Error('forced paired PO write failure');
      }
      return originalSave.call(this, options);
    };
    try {
      const failed = await invoke(submitOrderResolution, resolutionRequest(fixture));
      assert.equal(failed.status, 500);
    } finally {
      PurchaseOrder.prototype.save = originalSave;
    }
    const [order, report] = await Promise.all([
      PurchaseOrder.findById(fixture.order._id),
      ProcurementReceivingReport.findById(fixture.report._id)
    ]);
    assert.equal(order.status, 'issue_reported');
    assert.equal(report.resolutionStatus, 'pending_supplier_resolution');
    assert.equal(report.resolutionSubmissions.length, 0);
  });

  await t.test('supplier lifecycle success is not converted to 500 by a failed audit side effect', async () => {
    const originalCreate = SupplyChainLog.create;
    SupplyChainLog.create = async () => { throw new Error('forced audit outage'); };
    let result;
    try {
      result = await invoke(adminDeactivateSupplier, {
        params: { id: otherSupplierId },
        body: { reason: 'Lifecycle test' }, query: {},
        user: { _id: storeActor, role: 'platform_admin' }
      });
    } finally {
      SupplyChainLog.create = originalCreate;
    }
    assert.equal(result.status, 200);
    const supplier = await Supplier.findById(otherSupplierId);
    assert.equal(supplier.status, 'suspended');
    assert.equal(supplier.isActive, false);
    const retry = await invoke(adminDeactivateSupplier, {
      params: { id: otherSupplierId }, body: { reason: 'Duplicate retry' }, query: {},
      user: { _id: storeActor, role: 'platform_admin' }
    });
    assert.equal(retry.status, 409);
  });

  await t.test('supplier PO lifecycle success survives notification failure without duplicating the transition', async () => {
    const order = await PurchaseOrder.create({
      orderNumber: `PO-MEDIUM-${nonce}-notification`, seller: storeActor, store, supplier: supplierId,
      items: [], subtotal: 0, totalCost: 0, status: 'shipped', paymentTiming: 'after_inspection',
      paymentStatus: 'awaiting_inspection', inspectionStatus: 'awaiting_delivery'
    });
    orderIds.push(order._id);
    const originalSave = Notification.prototype.save;
    Notification.prototype.save = async () => { throw new Error('forced notification outage'); };
    let result;
    try {
      result = await invoke(updateOrderStatus, {
        params: { id: order._id }, body: { status: 'delivered' }, query: {},
        user: { _id: supplierUser, role: 'supplier' }
      });
    } finally {
      Notification.prototype.save = originalSave;
    }
    assert.equal(result.status, 200);
    assert.equal((await PurchaseOrder.findById(order._id)).status, 'delivered');
    const retry = await invoke(updateOrderStatus, {
      params: { id: order._id }, body: { status: 'delivered' }, query: {},
      user: { _id: supplierUser, role: 'supplier' }
    });
    assert.equal(retry.status, 400);
    assert.equal((await PurchaseOrder.findById(order._id)).statusHistory.filter(row => row.status === 'delivered').length, 1);
  });

  await t.test('signed reinspection evidence is available only to authorized PO parties', async () => {
    const fixture = await createIssueFixture('evidence');
    const evidenceId = new mongoose.Types.ObjectId();
    const otherEvidenceId = new mongoose.Types.ObjectId();
    await ProcurementReceivingReport.updateOne({ _id: fixture.report._id }, {
      $push: {
        reinspections: {
          resolutionSubmission: new mongoose.Types.ObjectId(),
          inspectedBy: storeActor,
          inspectedAt: new Date(),
          outcome: 'accepted',
          processingStatus: 'completed',
          items: [],
          evidence: [{
            _id: evidenceId,
            url: 'authenticated://fixture',
            publicId: `pawzzle/procurement-evidence/${nonce}`,
            deliveryType: 'authenticated',
            resourceType: 'image',
            format: 'jpg',
            uploadedBy: storeActor
          }]
        }
      }
    });
    const otherOrder = await PurchaseOrder.create({
      orderNumber: `PO-MEDIUM-${nonce}-other-evidence`, seller: storeActor, store, supplier: supplierId,
      items: [], subtotal: 0, totalCost: 0, status: 'issue_reported'
    });
    orderIds.push(otherOrder._id);
    await ProcurementReceivingReport.create({
      purchaseOrder: otherOrder._id, store, supplier: supplierId, receivedBy: storeActor,
      outcome: 'issue_reported', processingStatus: 'completed', resolutionStatus: 'pending_supplier_resolution',
      items: [], evidence: [{
        _id: otherEvidenceId, url: 'authenticated://other', publicId: 'pawzzle/procurement-evidence/other',
        deliveryType: 'authenticated', resourceType: 'image', format: 'jpg', uploadedBy: storeActor
      }]
    });

    const originalSigner = cloudinary.utils.private_download_url;
    cloudinary.utils.private_download_url = () => 'https://signed.example.test/reinspection';
    try {
      const request = user => ({
        params: { id: fixture.order._id, evidenceId }, body: {}, query: {}, user
      });
      const storeAccess = await invoke(getReceivingEvidenceAccess, request({
        _id: new mongoose.Types.ObjectId(), role: 'finance_staff', store
      }));
      const supplierAccess = await invoke(getReceivingEvidenceAccess, request({ _id: supplierUser, role: 'supplier' }));
      const adminAccess = await invoke(getReceivingEvidenceAccess, request({ _id: new mongoose.Types.ObjectId(), role: 'platform_admin' }));
      assert.equal(storeAccess.status, 200);
      assert.equal(supplierAccess.status, 200);
      assert.equal(adminAccess.status, 200);
      assert.equal(storeAccess.headers['Cache-Control'], 'no-store, private');
      assert.equal(storeAccess.body.url, 'https://signed.example.test/reinspection');

      assert.equal((await invoke(getReceivingEvidenceAccess, request({
        _id: new mongoose.Types.ObjectId(), role: 'finance_staff', store: otherStore
      }))).status, 403);
      assert.equal((await invoke(getReceivingEvidenceAccess, request({ _id: otherSupplierUser, role: 'supplier' }))).status, 403);
      assert.equal((await invoke(getReceivingEvidenceAccess, {
        params: { id: fixture.order._id, evidenceId: otherEvidenceId }, body: {}, query: {},
        user: { _id: storeActor, role: 'platform_admin' }
      })).status, 404);
      assert.equal((await invoke(getReceivingEvidenceAccess, {
        params: { id: fixture.order._id, evidenceId: new mongoose.Types.ObjectId() }, body: {}, query: {},
        user: { _id: storeActor, role: 'platform_admin' }
      })).status, 404);
    } finally {
      cloudinary.utils.private_download_url = originalSigner;
    }
  });
});
