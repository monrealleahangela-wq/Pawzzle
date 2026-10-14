const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const ActivityLog = require('../models/ActivityLog');
const Notification = require('../models/Notification');
const PayrollPaymentAttempt = require('../models/PayrollPaymentAttempt');
const PayrollPeriod = require('../models/PayrollPeriod');
const Payslip = require('../models/Payslip');
const RiderEarning = require('../models/RiderEarning');
const { confirmPaymentAttempt, createPaymentAttempt } = require('../services/payrollPaymentWorkflowService');

const transactionTestUri = process.env.MONGODB_TRANSACTION_TEST_URI;
const isolatedTestUri = transactionTestUri ? (() => {
  const uri = new URL(transactionTestUri);
  const baseDatabase = uri.pathname.replace(/^\//, '') || 'pawzzle_transaction_test';
  uri.pathname = `/${baseDatabase}_payroll_batch2_${process.pid}`;
  return uri.toString();
})() : null;
const encryptionKey = Buffer.alloc(32, 19).toString('hex');
const pdfProof = { originalName: 'transfer-proof.pdf', mimeType: 'application/pdf', base64: Buffer.from('%PDF-1.4\nUAT evidence').toString('base64') };

const periodDocument = (id, store, owner) => ({
  _id: id, store, frequency: 'monthly', periodStart: new Date('2026-09-01'), periodEnd: new Date('2026-09-30'),
  payDate: new Date('2026-10-05'), status: 'approved', policySnapshot: {}, generatedBy: owner, approvedBy: owner,
  approvedAt: new Date(), createdAt: new Date(), updatedAt: new Date()
});
const slipDocument = ({ id, period, store, employee, additions = [] }) => ({
  _id: id, payrollPeriod: period, store, employee,
  employeeSnapshot: { name: 'Isolated Payment Test', role: 'delivery_rider', compensationType: 'salary', compensationBasis: 'legacy_period', baseRate: 10000 },
  attendanceSummary: {}, basePay: 10000, additions, deductions: [], grossPay: 10000, netPay: 10000,
  paymentStatus: 'unpaid', createdAt: new Date(), updatedAt: new Date()
});
const request = ({ periodId, slipId, storeId, actorId, actorRole = 'finance_staff', key, reference }) => ({
  periodId, payslipId: slipId, storeId, actor: { _id: actorId, role: actorRole }, ipAddress: '127.0.0.1',
  input: { idempotencyKey: key, status: 'for_confirmation', amount: 10000, externalMethod: 'bank_transfer', referenceNumber: reference, transferAt: new Date('2026-10-05T03:00:00Z'), destination: { type: 'bank_transfer', accountName: 'Test Recipient', accountNumber: '0000123456', bankName: 'Test Bank' }, proof: pdfProof }
});

test('per-employee payments confirm independently, isolate Stores, deny self-dealing, and rollback partial settlement', {
  skip: !transactionTestUri && 'Set MONGODB_TRANSACTION_TEST_URI to an isolated replica-set test database.'
}, async () => {
  const priorKey = process.env.PAYROLL_DATA_ENCRYPTION_KEY;
  process.env.PAYROLL_DATA_ENCRYPTION_KEY = encryptionKey;
  await mongoose.connect(isolatedTestUri, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
  await mongoose.connection.dropDatabase();
  try {
    await Promise.all([PayrollPaymentAttempt.createIndexes(), PayrollPeriod.createIndexes(), Payslip.createIndexes()]);
    const store = new mongoose.Types.ObjectId();
    const otherStore = new mongoose.Types.ObjectId();
    const owner = new mongoose.Types.ObjectId();
    const finance = new mongoose.Types.ObjectId();
    const employee = new mongoose.Types.ObjectId();
    const periodId = new mongoose.Types.ObjectId();
    const slipId = new mongoose.Types.ObjectId();
    await PayrollPeriod.collection.insertOne(periodDocument(periodId, store, owner));
    await Payslip.collection.insertOne(slipDocument({ id: slipId, period: periodId, store, employee }));
    await assert.rejects(() => createPaymentAttempt(request({ periodId, slipId, storeId: otherStore, actorId: finance, key: 'wrong-store-1', reference: 'XFER-1' })), error => error.statusCode === 404);
    await assert.rejects(() => createPaymentAttempt(request({ periodId, slipId, storeId: store, actorId: employee, key: 'self-pay-0001', reference: 'XFER-2' })), error => error.statusCode === 403);

    const simultaneousRequests = await Promise.all([
      createPaymentAttempt(request({ periodId, slipId, storeId: store, actorId: finance, key: 'pay-first-0001', reference: 'XFER-3001' })),
      createPaymentAttempt(request({ periodId, slipId, storeId: store, actorId: finance, key: 'pay-first-0001', reference: 'XFER-3001' }))
    ]);
    const created = simultaneousRequests[0];
    assert.equal(simultaneousRequests.filter(item => item.idempotent).length, 1);
    assert.equal(created.attempt.status, 'for_confirmation');
    assert.equal((await Payslip.findById(slipId).lean()).paymentStatus, 'for_confirmation');
    assert.equal(await PayrollPaymentAttempt.countDocuments({ payslip: slipId }), 1);

    const outcomes = await Promise.allSettled([
      confirmPaymentAttempt({ attemptId: created.attempt._id, storeId: store, actor: { _id: owner }, reason: 'Verified independently against bank record.', ipAddress: '127.0.0.1' }),
      confirmPaymentAttempt({ attemptId: created.attempt._id, storeId: store, actor: { _id: owner }, reason: 'Verified independently against bank record.', ipAddress: '127.0.0.1' })
    ]);
    assert.ok(outcomes.some(result => result.status === 'fulfilled'));
    assert.equal(await Payslip.countDocuments({ _id: slipId, paymentStatus: 'recorded_paid' }), 1);
    assert.equal(await PayrollPaymentAttempt.countDocuments({ _id: created.attempt._id, status: 'paid' }), 1);
    assert.equal(await Notification.countDocuments({ relatedId: slipId }), 1);
    assert.equal((await PayrollPeriod.findById(periodId).lean()).status, 'paid');

    const rollbackPeriod = new mongoose.Types.ObjectId();
    const rollbackSlip = new mongoose.Types.ObjectId();
    const rollbackEmployee = new mongoose.Types.ObjectId();
    const missingEarning = new mongoose.Types.ObjectId();
    await PayrollPeriod.collection.insertOne(periodDocument(rollbackPeriod, store, owner));
    await Payslip.collection.insertOne(slipDocument({ id: rollbackSlip, period: rollbackPeriod, store, employee: rollbackEmployee, additions: [{ _id: new mongoose.Types.ObjectId(), type: 'Delivery Incentive', amount: 100, reason: 'Test', source: 'rider_earning', sourceId: missingEarning, createdBy: rollbackEmployee, createdAt: new Date() }] }));
    const rollbackAttempt = await createPaymentAttempt(request({ periodId: rollbackPeriod, slipId: rollbackSlip, storeId: store, actorId: finance, key: 'pay-rollback-1', reference: 'XFER-4001' }));
    await assert.rejects(() => confirmPaymentAttempt({ attemptId: rollbackAttempt.attempt._id, storeId: store, actor: { _id: owner }, reason: 'Independent transfer record was checked.', ipAddress: '127.0.0.1' }), /Rider earning changed/);
    assert.equal((await PayrollPeriod.findById(rollbackPeriod).lean()).status, 'approved');
    assert.equal((await Payslip.findById(rollbackSlip).lean()).paymentStatus, 'for_confirmation');
    assert.equal((await PayrollPaymentAttempt.findById(rollbackAttempt.attempt._id).lean()).status, 'for_confirmation');
    assert.equal(await Notification.countDocuments({ relatedId: rollbackSlip }), 0);
    assert.equal(await ActivityLog.countDocuments({ subject: rollbackEmployee, action: 'Payroll employee payment confirmed' }), 0);

    const ownerPeriod = new mongoose.Types.ObjectId();
    const ownerSlip = new mongoose.Types.ObjectId();
    await PayrollPeriod.collection.insertOne(periodDocument(ownerPeriod, store, owner));
    await Payslip.collection.insertOne(slipDocument({ id: ownerSlip, period: ownerPeriod, store, employee: owner }));
    const ownerAttempt = await createPaymentAttempt(request({ periodId: ownerPeriod, slipId: ownerSlip, storeId: store, actorId: owner, actorRole: 'store_owner', key: 'owner-own-pay-1', reference: 'XFER-5001' }));
    assert.equal(ownerAttempt.attempt.status, 'for_confirmation');
    const ownerConfirmed = await confirmPaymentAttempt({ attemptId: ownerAttempt.attempt._id, storeId: store, actor: { _id: owner, role: 'store_owner' }, reason: 'Store Owner verified the external salary record.', ipAddress: '127.0.0.1' });
    assert.equal(ownerConfirmed.periodComplete, true);
    assert.equal((await Payslip.findById(ownerSlip).lean()).paymentStatus, 'recorded_paid');
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    if (priorKey === undefined) delete process.env.PAYROLL_DATA_ENCRYPTION_KEY;
    else process.env.PAYROLL_DATA_ENCRYPTION_KEY = priorKey;
  }
});
