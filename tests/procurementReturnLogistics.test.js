const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ProcurementReceivingReport = require('../models/ProcurementReceivingReport');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('receiving reports persist both tracked return and correction shipment legs', () => {
  const id = () => new mongoose.Types.ObjectId();
  const actor = id();
  const report = new ProcurementReceivingReport({
    purchaseOrder: id(), store: id(), supplier: id(), receivedBy: actor,
    outcome: 'issue_reported', processingStatus: 'completed', resolutionStatus: 'return_shipped',
    items: [{
      purchaseOrderItem: id(), itemType: 'product', expectedQuantity: 2,
      receivedQuantity: 2, damagedQuantity: 2, acceptedQuantity: 0,
      rejectedQuantity: 2, missingQuantity: 0, condition: 'damaged'
    }],
    resolutionSubmissions: [{
      type: 'return_correction', status: 'return_shipped', submittedBy: actor,
      items: [{ purchaseOrderItem: id(), unresolvedQuantity: 2, proposedQuantity: 2 }],
      returnShipment: {
        status: 'shipped', carrier: 'Return Carrier', trackingNumber: 'RETURN-123',
        shippedBy: actor, shippedAt: new Date(),
        history: [{ status: 'processing', actor }, { status: 'shipped', actor }]
      },
      replacementShipment: { status: 'not_required' }
    }]
  });

  assert.equal(report.validateSync(), undefined);
  const resolution = report.resolutionSubmissions[0];
  assert.equal(resolution.returnShipment.status, 'shipped');
  assert.equal(resolution.returnShipment.trackingNumber, 'RETURN-123');
  assert.equal(resolution.returnShipment.history.length, 2);
});

test('return/correction acceptance starts reverse logistics instead of jumping to a note-only resolution', () => {
  const controller = read('controllers/purchaseOrderController.js');
  assert.match(controller, /submission\.type === 'return_correction'[\s\S]*submission\.status = 'return_processing'/);
  assert.match(controller, /Carrier and tracking number are required before marking the return shipped/);
  assert.match(controller, /submission\.returnShipment\.status = 'shipped'/);
  assert.match(controller, /report\.resolutionStatus = 'return_shipped'/);
  const supplier = read('controllers/supplierController.js');
  assert.match(supplier, /Return\/correction quantities cannot exceed the damaged or incorrect units physically held by the Store/);
  const routes = read('routes/purchaseOrders.js');
  assert.match(routes, /resolutions\/:resolutionId\/return-shipment/);
});

test('supplier must receive the return and then ship the correction before delivery and reinspection', () => {
  const controller = read('controllers/supplierController.js');
  assert.match(controller, /confirm_return_received/);
  assert.match(controller, /mark_replacement_shipped/);
  assert.match(controller, /mark_replacement_delivered/);
  assert.match(controller, /submission\.returnShipment\.status = 'received'/);
  assert.match(controller, /submission\.replacementShipment\.status = 'shipped'/);
  assert.match(controller, /The replacement\/correction must be marked shipped before it can be delivered/);
  assert.match(controller, /report\.resolutionStatus = 'reinspection'/);
  const routes = read('routes/suppliers.js');
  assert.match(routes, /resolutions\/:resolutionId\/logistics/);
});

test('Store and supplier screens expose the tracked return timeline and role-specific actions', () => {
  const store = read('client/src/pages/admin/PurchaseOrders.js');
  const supplier = read('client/src/pages/supplier/SupplierDashboard.js');
  const timeline = read('client/src/components/procurement/ResolutionLogisticsTimeline.js');
  assert.match(store, /Mark return as shipped/);
  assert.match(store, /markResolutionReturnShipped/);
  assert.match(supplier, /Confirm return received/);
  assert.match(supplier, /Mark replacement\/correction shipped/);
  assert.match(supplier, /Mark replacement\/correction delivered/);
  assert.match(timeline, /Store → Supplier/);
  assert.match(timeline, /Supplier → Store/);
  assert.match(timeline, /Tracking/);
});

test('payment and cancellation remain blocked throughout both logistics legs', () => {
  const payment = read('controllers/paymentController.js');
  const finance = read('controllers/financeController.js');
  const purchaseOrders = read('controllers/purchaseOrderController.js');
  for (const status of ['return_processing', 'return_shipped', 'replacement_processing', 'replacement_shipped']) {
    assert.match(payment, new RegExp(status));
    assert.match(finance, new RegExp(status));
    assert.match(purchaseOrders, new RegExp(status));
  }
});
