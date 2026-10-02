const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProcurementPayment = require('../models/ProcurementPayment');
const ProcurementReceivingReport = require('../models/ProcurementReceivingReport');
const Supplier = require('../models/Supplier');
const SupplyChainLog = require('../models/SupplyChainLog');
const RiderEarning = require('../models/RiderEarning');
const RiderPayout = require('../models/RiderPayout');
const { calculateTax, roundMoney } = require('../utils/taxCalculator');
const resolveStore = require('../utils/resolveStore');
const { createNotification } = require('./notificationController');
const { hasUnresolvedQuantities, outstandingProcurementBalance } = require('../utils/procurementResolution');
const { sanitizeReceivingReport } = require('../utils/procurementEvidence');

const MANUAL_PROCUREMENT_PAYMENT_METHODS = new Set([
  'bank_transfer', 'gcash', 'maya', 'cod', 'credit_terms', 'cash', 'other'
]);

const populateExpense = (query) => query
  .populate('supplier', 'businessName email phone')
  .populate('purchaseOrder', 'orderNumber totalCost paymentStatus paidAmount')
  .populate('createdBy approvedBy', 'firstName lastName');

const syncPurchaseOrderPayment = async (purchaseOrderId, session = null) => {
  const orderQuery = PurchaseOrder.findById(purchaseOrderId);
  if (session) orderQuery.session(session);
  const order = await orderQuery;
  if (!order) return null;
  const paymentTotals = ProcurementPayment.aggregate([
    { $match: { purchaseOrder: order._id, status: 'recorded', transactionType: { $in: ['payment', null] } } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  if (session) paymentTotals.session(session);
  const [{ total = 0 } = {}] = await paymentTotals;
  order.paidAmount = roundMoney(total);
  const adjustedTotal = roundMoney(Math.max(0, Number(order.totalCost) - Number(order.approvedAdjustmentTotal || 0)));
  order.paymentStatus = adjustedTotal <= 0 && order.paidAmount <= 0 ? 'settled'
    : order.paidAmount <= 0 ? 'unpaid'
      : order.paidAmount >= adjustedTotal ? 'paid' : 'partially_paid';
  if (['paid', 'settled'].includes(order.paymentStatus)) {
    order.paymentDate = new Date();
    if (['accepted', 'resolved'].includes(order.inspectionStatus) && ['delivered', 'resolved'].includes(order.status)) {
      order.status = 'completed';
      order.completedAt = new Date();
    }
  } else if (order.status === 'completed') {
    if (order.inspectionStatus === 'accepted') {
      order.status = 'delivered';
      order.completedAt = undefined;
    } else if (order.inspectionStatus === 'resolved') {
      order.status = 'resolved';
      order.completedAt = undefined;
    }
  }
  if (order.paidAmount <= 0 && !['paid', 'settled'].includes(order.paymentStatus)) {
    order.paymentDate = undefined;
  }
  await order.save(session ? { session } : undefined);
  return order;
};

const createExpense = async (req, res) => {
  try {
    const store = await resolveStore(req);
    if (!store) return res.status(400).json({ message: 'Store is required.' });
    const { amount, taxCode, purchaseOrder, supplier } = req.body;
    if (purchaseOrder) {
      const order = await PurchaseOrder.findOne({ _id: purchaseOrder, store, isDeleted: false });
      if (!order) return res.status(400).json({ message: 'Purchase order does not belong to this store.' });
      if (supplier && String(supplier) !== String(order.supplier)) return res.status(400).json({ message: 'Supplier does not match the purchase order.' });
    }
    const totals = calculateTax(amount, taxCode);
    const expense = await Expense.create({ ...req.body, ...totals, store, createdBy: req.user._id });
    await expense.populate(['supplier', 'purchaseOrder', 'createdBy', 'approvedBy']);
    res.status(201).json(expense);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

const listExpenses = async (req, res) => {
  try {
    const store = await resolveStore(req);
    if (!store) return res.status(400).json({ message: 'Store is required.' });
    const filter = { store };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.purchaseOrder) filter.purchaseOrder = req.query.purchaseOrder;
    const expenses = await populateExpense(Expense.find(filter)).sort({ expenseDate: -1 });
    res.json({ expenses });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const updateExpense = async (req, res) => {
  try {
    const store = await resolveStore(req);
    const expense = await Expense.findOne({ _id: req.params.id, store });
    if (!expense) return res.status(404).json({ message: 'Expense not found.' });
    if (['paid', 'void'].includes(expense.status)) return res.status(409).json({ message: 'Paid or void records cannot be edited.' });
    const editable = ['category', 'payee', 'description', 'expenseDate', 'paymentMethod', 'paymentReference', 'attachmentUrl', 'status'];
    editable.forEach(key => { if (req.body[key] !== undefined) expense[key] = req.body[key]; });
    if (req.body.amount !== undefined || req.body.taxCode !== undefined) {
      const totals = calculateTax(req.body.amount ?? expense.grossAmount, req.body.taxCode ?? expense.taxCode);
      Object.assign(expense, totals);
    }
    await expense.save();
    await expense.populate('supplier purchaseOrder createdBy approvedBy');
    res.json(expense);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

const changeExpenseStatus = async (req, res) => {
  try {
    const store = await resolveStore(req);
    const expense = await Expense.findOne({ _id: req.params.id, store });
    if (!expense) return res.status(404).json({ message: 'Expense not found.' });
    const transitions = { draft: ['submitted', 'void'], submitted: ['approved', 'rejected', 'void'], approved: ['paid', 'void'], rejected: ['draft', 'void'] };
    if (!transitions[expense.status]?.includes(req.body.status)) return res.status(400).json({ message: `Cannot change ${expense.status} to ${req.body.status}.` });
    expense.status = req.body.status;
    if (req.body.status === 'approved') { expense.approvedBy = req.user._id; expense.approvedAt = new Date(); }
    if (req.body.status === 'rejected') expense.rejectionReason = req.body.reason || 'Rejected';
    await expense.save();
    res.json(expense);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

const listProcurementPayments = async (req, res) => {
  try {
    const store = await resolveStore(req);
    if (!store) return res.status(400).json({ message: 'Store is required.' });
    const filter = { store };
    if (req.query.purchaseOrder) filter.purchaseOrder = req.query.purchaseOrder;
    if (req.query.status) filter.status = req.query.status;
    const payments = await ProcurementPayment.find(filter)
      .populate('purchaseOrder', 'orderNumber totalCost paymentStatus paidAmount')
      .populate('supplier', 'businessName').populate('recordedBy voidedBy', 'firstName lastName')
      .sort({ paymentDate: -1 });
    res.json({ payments });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const createProcurementPayment = async (req, res) => {
  try {
    const store = await resolveStore(req);
    if (!store) return res.status(400).json({ message: 'Store is required.' });
    const amount = roundMoney(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'Payment amount must be greater than zero.' });
    const paymentMethod = String(req.body.paymentMethod || '').trim();
    if (!MANUAL_PROCUREMENT_PAYMENT_METHODS.has(paymentMethod)) {
      return res.status(400).json({ message: 'Select a valid manual payment method.' });
    }
    const paymentDate = req.body.paymentDate ? new Date(req.body.paymentDate) : new Date();
    if (Number.isNaN(paymentDate.getTime())) return res.status(400).json({ message: 'Payment date is invalid.' });
    let payment;
    await mongoose.connection.transaction(async session => {
      const order = await PurchaseOrder.findOne({ _id: req.body.purchaseOrder, store, isDeleted: false }).session(session);
      if (!order) throw Object.assign(new Error('Purchase order not found for this store.'), { statusCode: 404 });
      if (['cancelled', 'returned', 'issue_reported', 'pending_supplier_resolution', 'resolution_submitted', 'resolution_accepted', 'resolution_rejected', 'awaiting_replacement', 'reinspection'].includes(order.status)) {
        throw Object.assign(new Error('Payments cannot be recorded for cancelled, returned, or disputed orders.'), { statusCode: 409 });
      }
      if (order.paymentMethod === 'paymongo') {
        throw Object.assign(new Error('PayMongo payments must be verified through the PayMongo checkout flow.'), { statusCode: 400 });
      }
      if (order.paymentTiming === 'after_inspection') {
        throw Object.assign(new Error('Pay-after-inspection purchase orders must be paid through the verified PayMongo flow after acceptance.'), { statusCode: 409 });
      }
      const activePaid = await ProcurementPayment.aggregate([
        { $match: { purchaseOrder: order._id, status: 'recorded', transactionType: { $in: ['payment', null] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).session(session);
      const balance = roundMoney(Math.max(0, order.totalCost - Number(order.approvedAdjustmentTotal || 0) - (activePaid[0]?.total || 0)));
      if (amount > balance) throw Object.assign(new Error(`Payment exceeds the remaining balance of ${balance}.`), { statusCode: 400 });
      [payment] = await ProcurementPayment.create([{
        purchaseOrder: order._id,
        amount,
        paymentDate,
        paymentMethod,
        reference: req.body.reference === undefined ? undefined : String(req.body.reference).trim(),
        notes: req.body.notes === undefined ? undefined : String(req.body.notes).trim(),
        store,
        supplier: order.supplier,
        provider: 'manual',
        transactionType: 'payment',
        status: 'recorded',
        recordedBy: req.user._id
      }], { session });
      await syncPurchaseOrderPayment(order._id, session);
    });
    await payment.populate('purchaseOrder supplier recordedBy');
    res.status(201).json(payment);
  } catch (error) { res.status(error.statusCode || 400).json({ message: error.message }); }
};

const voidProcurementPayment = async (req, res) => {
  try {
    const store = await resolveStore(req);
    if (!req.body.reason?.trim()) return res.status(400).json({ message: 'A void reason is required.' });
    let payment;
    await mongoose.connection.transaction(async session => {
      payment = await ProcurementPayment.findOne({ _id: req.params.id, store }).session(session);
      if (!payment) throw Object.assign(new Error('Payment not found.'), { statusCode: 404 });
      if (payment.status === 'void') throw Object.assign(new Error('Payment is already void.'), { statusCode: 409 });
      if (payment.status !== 'recorded' || payment.transactionType !== 'payment') {
        throw Object.assign(new Error('Only a recorded manual payment can be voided through this workflow.'), { statusCode: 409 });
      }
      if (payment.provider === 'paymongo' || payment.paymentMethod === 'paymongo') {
        throw Object.assign(new Error('A verified PayMongo payment requires the authorized refund process and cannot be manually voided.'), { statusCode: 409 });
      }
      const order = await PurchaseOrder.findOne({ _id: payment.purchaseOrder, store, isDeleted: false }).session(session);
      if (!order) throw Object.assign(new Error('Purchase order not found for this payment.'), { statusCode: 404 });
      if (order.status === 'completed' && !['accepted', 'resolved'].includes(order.inspectionStatus)) {
        throw Object.assign(new Error('This completed purchase order has no supported payment-reversal state.'), { statusCode: 409 });
      }
      payment.status = 'void';
      payment.voidReason = req.body.reason.trim();
      payment.voidedBy = req.user._id;
      payment.voidedAt = new Date();
      await payment.save({ session });
      await syncPurchaseOrderPayment(payment.purchaseOrder, session);
    });
    res.json(payment);
  } catch (error) { res.status(error.statusCode || 400).json({ message: error.message }); }
};

const listProcurementAdjustments = async (req, res) => {
  try {
    const store = await resolveStore(req);
    if (!store) return res.status(400).json({ message: 'Store is required.' });
    const reports = await ProcurementReceivingReport.find({
      store,
      'resolutionSubmissions.financialAdjustment.status': 'pending_finance_review'
    })
      .populate('purchaseOrder', 'orderNumber totalCost paidAmount paymentStatus paymentTiming status approvedAdjustmentTotal')
      .populate('supplier', 'businessName')
      .populate('resolutionSubmissions.submittedBy resolutionSubmissions.decisionBy', 'firstName lastName')
      .sort({ updatedAt: -1 });
    const adjustments = reports.flatMap(report => {
      const sanitizedReport = sanitizeReceivingReport(report);
      return report.resolutionSubmissions
        .filter(submission => submission.type === 'refund_credit'
          && submission.financialAdjustment?.status === 'pending_finance_review')
        .map(submission => ({
          receivingReport: report._id,
          purchaseOrder: report.purchaseOrder,
          supplier: report.supplier,
          resolution: submission,
          evidence: sanitizedReport.evidence,
          reinspections: sanitizedReport.reinspections,
          inspectionNotes: report.notes
        }));
    });
    res.json({ adjustments });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const reviewProcurementAdjustment = async (req, res) => {
  let result;
  try {
    const store = await resolveStore(req);
    if (!store) return res.status(400).json({ message: 'Store is required.' });
    const action = req.body.action;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Action must be approve or reject.' });
    }
    await mongoose.connection.transaction(async session => {
      const report = await ProcurementReceivingReport.findOne({ _id: req.params.reportId, store }).session(session);
      if (!report) throw Object.assign(new Error('Receiving report not found for this store.'), { statusCode: 404 });
      const submission = report.resolutionSubmissions.id(req.params.resolutionId);
      if (!submission || submission.type !== 'refund_credit') {
        throw Object.assign(new Error('Refund/credit resolution not found.'), { statusCode: 404 });
      }
      if (submission.status !== 'accepted'
          || submission.financialAdjustment?.status !== 'pending_finance_review') {
        throw Object.assign(new Error('This financial adjustment has already been decided or is not ready for Finance review.'), { statusCode: 409 });
      }
      const order = await PurchaseOrder.findOne({ _id: report.purchaseOrder, store, isDeleted: false }).session(session);
      if (!order) throw Object.assign(new Error('Purchase order not found for this store.'), { statusCode: 404 });

      submission.financialAdjustment.reviewedBy = req.user._id;
      submission.financialAdjustment.reviewedAt = new Date();
      submission.financialAdjustment.notes = req.body.notes;
      if (action === 'reject') {
        submission.financialAdjustment.status = 'rejected';
        submission.status = 'rejected';
        report.resolutionStatus = 'resolution_rejected';
        order.status = 'resolution_rejected';
      } else {
        const amount = roundMoney(req.body.amount);
        const proposedAmount = Number(submission.financialProposal?.proposedAmount || 0);
        const maximumAdjustment = roundMoney(Math.max(0, Number(order.totalCost) - Number(order.approvedAdjustmentTotal || 0)));
        if (!Number.isFinite(amount) || amount <= 0 || amount > proposedAmount || amount > maximumAdjustment) {
          throw Object.assign(new Error('Approved amount must be positive and cannot exceed the supplier proposal or remaining order value.'), { statusCode: 400 });
        }
        const adjustmentType = submission.financialProposal?.adjustmentType === 'refund' ? 'refund' : 'credit';
        const [adjustment] = await ProcurementPayment.create([{
          store,
          purchaseOrder: order._id,
          supplier: order.supplier,
          transactionType: adjustmentType,
          amount,
          paymentDate: new Date(),
          paymentMethod: 'financial_adjustment',
          provider: 'manual',
          reference: `${adjustmentType.toUpperCase()}-${order.orderNumber}-${String(submission._id).slice(-6)}`,
          notes: req.body.notes || 'Authorized procurement discrepancy adjustment. No PayMongo refund was executed.',
          status: 'authorized',
          recordedBy: req.user._id,
          receivingReport: report._id,
          resolutionSubmission: submission._id
        }], { session });
        submission.financialAdjustment.status = 'approved';
        submission.financialAdjustment.approvedAmount = amount;
        submission.financialAdjustment.financeRecord = adjustment._id;
        submission.status = 'resolved';
        report.approvedAdjustmentTotal = roundMoney(Number(report.approvedAdjustmentTotal || 0) + amount);
        order.approvedAdjustmentTotal = roundMoney(Number(order.approvedAdjustmentTotal || 0) + amount);

        const unresolved = hasUnresolvedQuantities(report);
        if (unresolved) {
          report.resolutionStatus = 'pending_supplier_resolution';
          report.paymentReady = false;
          report.payableAmount = 0;
          order.status = 'issue_reported';
          order.inspectionStatus = 'issue_reported';
          if (order.paymentTiming === 'after_inspection' && !['paid', 'settled'].includes(order.paymentStatus)) {
            order.paymentStatus = 'awaiting_inspection';
          }
        } else {
          report.resolutionStatus = 'resolved';
          report.paymentReady = true;
          report.payableAmount = Math.max(0, Number(order.totalCost) - Number(order.approvedAdjustmentTotal || 0));
          order.inspectionStatus = 'resolved';
          const balance = outstandingProcurementBalance(order);
          if (balance <= 0 && Number(order.paidAmount || 0) <= 0) order.paymentStatus = 'settled';
          if (['paid', 'settled'].includes(order.paymentStatus)) {
            order.status = 'completed';
            order.completedAt = new Date();
          } else {
            order.status = 'resolved';
            if (order.paymentTiming === 'after_inspection') order.paymentStatus = 'awaiting_payment';
          }
        }
      }
      report.resolutionHistory.push({
        status: report.resolutionStatus,
        action: action === 'approve' ? 'financial_adjustment_approved' : 'financial_adjustment_rejected',
        actor: req.user._id,
        actorRole: req.user.role,
        resolutionSubmission: submission._id,
        notes: req.body.notes
      });
      order.statusHistory.push({
        status: order.status,
        changedBy: req.user._id,
        notes: req.body.notes || `Finance ${action}ed the proposed procurement adjustment.`
      });
      await Promise.all([report.save({ session }), order.save({ session })]);
      result = { report, order, submission };
    });

    const supplier = await Supplier.findById(result.order.supplier).select('user');
    await Promise.allSettled([
      supplier && createNotification({
        recipient: supplier.user,
        sender: req.user._id,
        type: 'purchase_order',
        title: `Financial Adjustment ${action === 'approve' ? 'Approved' : 'Rejected'}`,
        message: `Finance ${action}ed the proposed adjustment for ${result.order.orderNumber}.`,
        relatedId: result.order._id,
        relatedModel: 'PurchaseOrder'
      }),
      createNotification({
        recipient: result.order.seller,
        sender: req.user._id,
        type: 'purchase_order',
        title: `Financial Adjustment ${action === 'approve' ? 'Approved' : 'Rejected'}`,
        message: `Finance ${action}ed the proposed adjustment for ${result.order.orderNumber}.`,
        relatedId: result.order._id,
        relatedModel: 'PurchaseOrder'
      }),
      SupplyChainLog.create({
        action: action === 'approve' ? 'procurement_adjustment_approved' : 'procurement_adjustment_rejected',
        performedBy: req.user._id,
        userRole: req.user.role,
        relatedEntity: { type: 'PurchaseOrder', id: result.order._id },
        description: `Finance ${action}ed procurement adjustment for ${result.order.orderNumber}.`,
        store,
        supplier: result.order.supplier,
        metadata: { receivingReport: result.report._id, resolutionSubmission: result.submission._id }
      })
    ].filter(Boolean));
    res.json({ order: result.order, receivingReport: sanitizeReceivingReport(result.report), resolution: result.submission });
  } catch (error) {
    console.error('Review procurement adjustment error:', error);
    const duplicate = error.code === 11000;
    res.status(duplicate ? 409 : (error.statusCode || (error.name === 'CastError' ? 400 : 500))).json({
      message: duplicate ? 'This financial adjustment was already recorded.' : error.message
    });
  }
};

const getFinancialSummary = async (req, res) => {
  try {
    const store = await resolveStore(req);
    if (!store) return res.status(400).json({ message: 'Store is required.' });
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30 * 86400000);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    if (Number.isNaN(from.valueOf()) || Number.isNaN(to.valueOf()) || from > to) return res.status(400).json({ message: 'Invalid date range.' });
    const [orders, bookings, expenses, purchaseOrders, payments, riderEarnings, riderPayouts] = await Promise.all([
      Order.find({ store, paymentStatus: 'paid', status: { $nin: ['cancelled', 'returned'] }, createdAt: { $gte: from, $lte: to }, isDeleted: { $ne: true } }),
      Booking.find({ store, paymentStatus: 'paid', status: { $ne: 'cancelled' }, createdAt: { $gte: from, $lte: to }, isDeleted: { $ne: true } }),
      Expense.find({ store, status: { $in: ['approved', 'paid'] }, expenseDate: { $gte: from, $lte: to } }),
      PurchaseOrder.find({ store, createdAt: { $gte: from, $lte: to }, isDeleted: false, status: { $nin: ['cancelled', 'returned'] } }),
      ProcurementPayment.find({ store, status: 'recorded', transactionType: { $in: ['payment', null] }, paymentDate: { $gte: from, $lte: to } }),
      RiderEarning.find({ store, earnedAt: { $gte: from, $lte: to } }),
      RiderPayout.find({ store, createdAt: { $gte: from, $lte: to } })
    ]);
    const salesVat = orders.reduce((sum, row) => sum + Number(row.pricingBreakdown?.vatAmount || 0), 0);
    const serviceVat = bookings.reduce((sum, row) => sum + Number(row.pricingBreakdown?.vatAmount || 0), 0);
    const salesRevenue = orders.reduce((sum, row) => sum + row.totalAmount, 0) - salesVat;
    const serviceRevenue = bookings.reduce((sum, row) => sum + row.totalPrice, 0) - serviceVat;
    const operatingExpenses = expenses.reduce((sum, row) => sum + row.grossAmount, 0);
    const procurementCommitted = purchaseOrders.reduce((sum, row) => sum + row.totalCost, 0);
    const procurementPaid = payments.reduce((sum, row) => sum + row.amount, 0);
    const deliveryEarnings = riderEarnings.reduce((sum, row) => sum + row.amount, 0);
    const deliveryPaid = riderPayouts.filter(row => row.status === 'paid').reduce((sum, row) => sum + row.amount, 0);
    const deliveryPayable = riderEarnings.filter(row => ['available', 'processing'].includes(row.status)).reduce((sum, row) => sum + row.amount, 0);
    res.json({ period: { from, to }, revenue: { productSales: roundMoney(salesRevenue), services: roundMoney(serviceRevenue), total: roundMoney(salesRevenue + serviceRevenue) }, tax: { outputVat: roundMoney(salesVat + serviceVat), productSalesVat: roundMoney(salesVat), serviceVat: roundMoney(serviceVat) }, logistics: { riderEarnings: roundMoney(deliveryEarnings), riderPayoutsPaid: roundMoney(deliveryPaid), riderPayable: roundMoney(deliveryPayable) }, expenses: { operating: roundMoney(operatingExpenses), procurementCommitted: roundMoney(procurementCommitted), procurementPaid: roundMoney(procurementPaid), procurementOutstanding: roundMoney(purchaseOrders.reduce((sum, order) => sum + outstandingProcurementBalance(order), 0)) }, operatingResultBeforeCogs: roundMoney(salesRevenue + serviceRevenue - operatingExpenses - procurementPaid - deliveryPaid) });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

module.exports = {
  createExpense, listExpenses, updateExpense, changeExpenseStatus,
  listProcurementPayments, createProcurementPayment, voidProcurementPayment,
  listProcurementAdjustments, reviewProcurementAdjustment,
  getFinancialSummary, syncPurchaseOrderPayment
};
