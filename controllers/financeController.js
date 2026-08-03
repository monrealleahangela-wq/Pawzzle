const Expense = require('../models/Expense');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const { calculateTax } = require('../utils/taxCalculator');
const resolveStore = require('../utils/resolveStore');

const createExpense = async (req, res) => {
  try {
    const store = await resolveStore(req);
    if (!store) return res.status(400).json({ message: 'Store is required.' });
    const totals = calculateTax(req.body.amount, req.body.taxCode);
    const expense = await Expense.create({
      ...req.body, ...totals, store, createdBy: req.user._id
    });
    res.status(201).json(expense);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const listExpenses = async (req, res) => {
  try {
    const store = await resolveStore(req);
    if (!store) return res.status(400).json({ message: 'Store is required.' });
    const filter = { store };
    if (req.query.status) filter.status = req.query.status;
    const expenses = await Expense.find(filter).sort({ expenseDate: -1 });
    res.json({ expenses });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getFinancialSummary = async (req, res) => {
  try {
    const store = await resolveStore(req);
    if (!store) return res.status(400).json({ message: 'Store is required.' });
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30 * 86400000);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    const [orders, bookings, expenses] = await Promise.all([
      Order.find({ store, paymentStatus: 'paid', createdAt: { $gte: from, $lte: to }, isDeleted: { $ne: true } }),
      Booking.find({ store, paymentStatus: 'paid', createdAt: { $gte: from, $lte: to }, isDeleted: { $ne: true } }),
      Expense.find({ store, status: { $in: ['approved', 'paid'] }, expenseDate: { $gte: from, $lte: to } })
    ]);
    const salesRevenue = orders.reduce((sum, row) => sum + row.totalAmount, 0);
    const serviceRevenue = bookings.reduce((sum, row) => sum + row.totalPrice, 0);
    const operatingExpenses = expenses.reduce((sum, row) => sum + row.netAmount, 0);
    const vatFromExpenses = expenses.reduce((sum, row) => sum + row.vatAmount, 0);
    res.json({
      period: { from, to },
      revenue: { productSales: salesRevenue, services: serviceRevenue, total: salesRevenue + serviceRevenue },
      expenses: { operating: operatingExpenses, inputVatRecorded: vatFromExpenses },
      operatingResultBeforeCogs: salesRevenue + serviceRevenue - operatingExpenses,
      warning: 'COGS and output VAT require line-level posting before this becomes a complete profit/tax statement.'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { createExpense, listExpenses, getFinancialSummary };
