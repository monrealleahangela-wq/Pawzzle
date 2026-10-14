const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const ActivityLog = require('../models/ActivityLog');
const Notification = require('../models/Notification');
const PayrollPeriod = require('../models/PayrollPeriod');
const Payslip = require('../models/Payslip');
const RiderEarning = require('../models/RiderEarning');
const { finalizePayrollPayment } = require('../services/payrollFinalizationService');

const transactionTestUri = process.env.MONGODB_TRANSACTION_TEST_URI;
const isolatedTestUri = transactionTestUri ? (() => {
  const uri = new URL(transactionTestUri);
  const baseDatabase = uri.pathname.replace(/^\//, '') || 'pawzzle_transaction_test';
  uri.pathname = `/${baseDatabase}_payroll_batch1_${process.pid}`;
  return uri.toString();
})() : null;

const periodDocument = (id, store, actor) => ({
  _id: id,
  store,
  frequency: 'semi_monthly',
  periodStart: new Date('2026-09-01'),
  periodEnd: new Date('2026-09-15'),
  payDate: new Date('2026-09-20'),
  status: 'approved',
  policySnapshot: {},
  generatedBy: actor,
  approvedBy: actor,
  approvedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date()
});

const slipDocument = ({ id, period, store, employee, earning }) => ({
  _id: id,
  payrollPeriod: period,
  store,
  employee,
  employeeSnapshot: { name: 'Test Employee', role: 'delivery_rider', compensationType: 'salary', compensationBasis: 'legacy_period', baseRate: 10000 },
  attendanceSummary: {},
  basePay: 10000,
  additions: earning ? [{ _id: new mongoose.Types.ObjectId(), type: 'Delivery Incentive', amount: 100, reason: 'Test earning', source: 'rider_earning', sourceId: earning, createdBy: employee, createdAt: new Date() }] : [],
  deductions: [],
  grossPay: earning ? 10100 : 10000,
  netPay: earning ? 10100 : 10000,
  paymentStatus: 'unpaid',
  createdAt: new Date(),
  updatedAt: new Date()
});

test('payroll finalization is concurrent-idempotent and rolls back every financial write on failure', {
  skip: !transactionTestUri
}, async () => {
  await mongoose.connect(isolatedTestUri, { autoIndex: false });
  await mongoose.connection.dropDatabase();
  try {
    const store = new mongoose.Types.ObjectId();
    const owner = new mongoose.Types.ObjectId();
    const employee = new mongoose.Types.ObjectId();
    const periodId = new mongoose.Types.ObjectId();
    const slipId = new mongoose.Types.ObjectId();
    const earningId = new mongoose.Types.ObjectId();
    await PayrollPeriod.collection.insertOne(periodDocument(periodId, store, owner));
    await Payslip.collection.insertOne(slipDocument({ id: slipId, period: periodId, store, employee, earning: earningId }));
    await RiderEarning.collection.insertOne({ _id: earningId, rider: employee, store, delivery: new mongoose.Types.ObjectId(), amount: 100, status: 'processing', payrollPayslip: slipId, earnedAt: new Date(), createdAt: new Date(), updatedAt: new Date() });

    const request = { periodId, storeId: store, actor: { _id: owner, role: 'store_owner' }, payment: { method: 'bank_transfer', referenceNumber: 'PAYROLL-ONE', paymentDate: new Date('2026-09-20') } };
    const outcomes = await Promise.all([finalizePayrollPayment(request), finalizePayrollPayment(request)]);
    assert.equal(outcomes.filter(item => item.idempotent).length, 1);
    assert.equal((await PayrollPeriod.findById(periodId).lean()).status, 'paid');
    assert.equal((await Payslip.findById(slipId).lean()).paymentStatus, 'recorded_paid');
    assert.equal((await RiderEarning.findById(earningId).lean()).status, 'paid');
    assert.equal(await Notification.countDocuments({ relatedId: slipId }), 1);
    assert.equal(await ActivityLog.countDocuments({ action: 'Payroll paid', store }), 1);

    const rollbackPeriod = new mongoose.Types.ObjectId();
    const rollbackSlip = new mongoose.Types.ObjectId();
    await PayrollPeriod.collection.insertOne(periodDocument(rollbackPeriod, store, owner));
    await Payslip.collection.insertOne(slipDocument({ id: rollbackSlip, period: rollbackPeriod, store, employee, earning: new mongoose.Types.ObjectId() }));
    await assert.rejects(() => finalizePayrollPayment({
      periodId: rollbackPeriod,
      storeId: store,
      actor: { _id: owner, role: 'store_owner' },
      payment: { method: 'bank_transfer', referenceNumber: 'PAYROLL-ROLLBACK', paymentDate: new Date('2026-09-20') }
    }), /Rider earning changed/);
    assert.equal((await PayrollPeriod.findById(rollbackPeriod).lean()).status, 'approved');
    assert.equal((await Payslip.findById(rollbackSlip).lean()).paymentStatus, 'unpaid');
    assert.equal(await Notification.countDocuments({ relatedId: rollbackSlip }), 0);
    assert.equal(await ActivityLog.countDocuments({ action: 'Payroll paid', store }), 1);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
