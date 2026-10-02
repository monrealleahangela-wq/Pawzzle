const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProcurementPayment = require('../models/ProcurementPayment');
const { getFinancialSummary } = require('../controllers/financeController');

const transactionTestUri = process.env.MONGODB_TRANSACTION_TEST_URI;
const isolatedTestUri = transactionTestUri ? (() => {
  const uri = new URL(transactionTestUri);
  const baseDatabase = uri.pathname.replace(/^\//, '') || 'pawzzle_transaction_test';
  uri.pathname = `/${baseDatabase}_finance_summary_${process.pid}`;
  return uri.toString();
})() : null;

const invoke = async (handler, req) => {
  const result = { status: 200 };
  const res = {
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; }
  };
  await handler(req, res);
  return result;
};

test('Finance summary applies only the Purchase Order authoritative approved adjustment total', {
  skip: !transactionTestUri
}, async () => {
  await mongoose.connect(isolatedTestUri, { autoIndex: false });
  await mongoose.connection.dropDatabase();
  try {
    const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const store = new mongoose.Types.ObjectId();
    const supplier = new mongoose.Types.ObjectId();
    const actor = new mongoose.Types.ObjectId();
    const definitions = [
      { suffix: 'unpaid', paidAmount: 0, approvedAdjustmentTotal: 0 },
      { suffix: 'approved', paidAmount: 80, approvedAdjustmentTotal: 20 },
      { suffix: 'pending', paidAmount: 80, approvedAdjustmentTotal: 0 },
      { suffix: 'rejected', paidAmount: 80, approvedAdjustmentTotal: 0 },
      { suffix: 'partial', paidAmount: 20, approvedAdjustmentTotal: 0 }
    ];
    const orders = await PurchaseOrder.create(definitions.map(row => ({
      orderNumber: `PO-FINANCE-SUMMARY-${nonce}-${row.suffix}`,
      seller: actor,
      store,
      supplier,
      items: [],
      subtotal: 100,
      totalCost: 100,
      paidAmount: row.paidAmount,
      approvedAdjustmentTotal: row.approvedAdjustmentTotal,
      paymentStatus: row.paidAmount > 0 ? 'partially_paid' : 'unpaid',
      status: 'submitted'
    })));
    await ProcurementPayment.create(orders
      .filter((order, index) => definitions[index].paidAmount > 0)
      .map(order => ({
        store,
        purchaseOrder: order._id,
        supplier,
        amount: order.paidAmount,
        paymentMethod: 'bank_transfer',
        provider: 'manual',
        transactionType: 'payment',
        status: 'recorded',
        recordedBy: actor
      })));

    const result = await invoke(getFinancialSummary, {
      params: {},
      body: {},
      query: {},
      user: { _id: actor, role: 'finance_staff', store }
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.expenses.procurementCommitted, 500);
    assert.equal(result.body.expenses.procurementPaid, 260);
    assert.equal(result.body.expenses.procurementOutstanding, 220);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
