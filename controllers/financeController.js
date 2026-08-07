const Expense = require('../models/Expense');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProcurementPayment = require('../models/ProcurementPayment');
const { calculateTax, roundMoney } = require('../utils/taxCalculator');
const resolveStore = require('../utils/resolveStore');

const populateExpense = (query) => query
  .populate('supplier', 'businessName email phone')
  .populate('purchaseOrder', 'orderNumber totalCost paymentStatus paidAmount')
  .populate('createdBy approvedBy', 'firstName lastName');

const syncPurchaseOrderPayment = async (purchaseOrderId) => {
  const order = await PurchaseOrder.findById(purchaseOrderId);
  if (!order) return null;
  const [{ total = 0 } = {}] = await ProcurementPayment.aggregate([
    { $match: { purchaseOrder: order._id, status: 'recorded' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  order.paidAmount = roundMoney(total);
  order.paymentStatus = order.paidAmount <= 0 ? 'unpaid'
    : order.paidAmount >= order.totalCost ? 'paid' : 'partially_paid';
  if (order.paymentStatus === 'paid') order.paymentDate = new Date();
  await order.save();
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
    const order = await PurchaseOrder.findOne({ _id: req.body.purchaseOrder, store, isDeleted: false });
    if (!order) return res.status(404).json({ message: 'Purchase order not found for this store.' });
    if (['cancelled', 'returned'].includes(order.status)) return res.status(409).json({ message: 'Payments cannot be recorded for cancelled or returned orders.' });
    const amount = roundMoney(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'Payment amount must be greater than zero.' });
    const activePaid = await ProcurementPayment.aggregate([{ $match: { purchaseOrder: order._id, status: 'recorded' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    const balance = roundMoney(order.totalCost - (activePaid[0]?.total || 0));
    if (amount > balance) return res.status(400).json({ message: `Payment exceeds the remaining balance of ${balance}.` });
    const payment = await ProcurementPayment.create({ ...req.body, amount, store, supplier: order.supplier, recordedBy: req.user._id });
    await syncPurchaseOrderPayment(order._id);
    await payment.populate('purchaseOrder supplier recordedBy');
    res.status(201).json(payment);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

const voidProcurementPayment = async (req, res) => {
  try {
    const store = await resolveStore(req);
    const payment = await ProcurementPayment.findOne({ _id: req.params.id, store });
    if (!payment) return res.status(404).json({ message: 'Payment not found.' });
    if (payment.status === 'void') return res.status(409).json({ message: 'Payment is already void.' });
    if (!req.body.reason?.trim()) return res.status(400).json({ message: 'A void reason is required.' });
    payment.status = 'void'; payment.voidReason = req.body.reason.trim(); payment.voidedBy = req.user._id; payment.voidedAt = new Date();
    await payment.save();
    await syncPurchaseOrderPayment(payment.purchaseOrder);
    res.json(payment);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

const getFinancialSummary = async (req, res) => {
  try {
    const store = await resolveStore(req);
    if (!store) return res.status(400).json({ message: 'Store is required.' });
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30 * 86400000);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    if (Number.isNaN(from.valueOf()) || Number.isNaN(to.valueOf()) || from > to) return res.status(400).json({ message: 'Invalid date range.' });
    const [orders, bookings, expenses, purchaseOrders, payments] = await Promise.all([
      Order.find({ store, paymentStatus: 'paid', createdAt: { $gte: from, $lte: to }, isDeleted: { $ne: true } }),
      Booking.find({ store, paymentStatus: 'paid', createdAt: { $gte: from, $lte: to }, isDeleted: { $ne: true } }),
      Expense.find({ store, status: { $in: ['approved', 'paid'] }, expenseDate: { $gte: from, $lte: to } }),
      PurchaseOrder.find({ store, createdAt: { $gte: from, $lte: to }, isDeleted: false, status: { $nin: ['cancelled', 'returned'] } }),
      ProcurementPayment.find({ store, status: 'recorded', paymentDate: { $gte: from, $lte: to } })
    ]);
    const salesRevenue = orders.reduce((sum, row) => sum + row.totalAmount, 0);
    const serviceRevenue = bookings.reduce((sum, row) => sum + row.totalPrice, 0);
    const operatingExpenses = expenses.reduce((sum, row) => sum + row.grossAmount, 0);
    const procurementCommitted = purchaseOrders.reduce((sum, row) => sum + row.totalCost, 0);
    const procurementPaid = payments.reduce((sum, row) => sum + row.amount, 0);
    res.json({ period: { from, to }, revenue: { productSales: roundMoney(salesRevenue), services: roundMoney(serviceRevenue), total: roundMoney(salesRevenue + serviceRevenue) }, expenses: { operating: roundMoney(operatingExpenses), procurementCommitted: roundMoney(procurementCommitted), procurementPaid: roundMoney(procurementPaid), procurementOutstanding: roundMoney(purchaseOrders.reduce((s, p) => s + Math.max(0, p.totalCost - (p.paidAmount || 0)), 0)) }, operatingResultBeforeCogs: roundMoney(salesRevenue + serviceRevenue - operatingExpenses - procurementPaid) });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

module.exports = { createExpense, listExpenses, updateExpense, changeExpenseStatus, listProcurementPayments, createProcurementPayment, voidProcurementPayment, getFinancialSummary };
