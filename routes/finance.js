const express = require('express');
const { authenticate, requirePermission } = require('../middleware/auth');
const { createExpense, listExpenses, updateExpense, changeExpenseStatus, listProcurementPayments, createProcurementPayment, voidProcurementPayment, getFinancialSummary } = require('../controllers/financeController');

const router = express.Router();
router.get('/summary', authenticate, requirePermission('finance.view', 'finance.manage', 'reports.finance'), getFinancialSummary);
router.get('/expenses', authenticate, requirePermission('finance.view', 'finance.manage', 'reports.finance'), listExpenses);
router.post('/expenses', authenticate, requirePermission('finance.manage'), createExpense);
router.put('/expenses/:id', authenticate, requirePermission('finance.manage'), updateExpense);
router.patch('/expenses/:id/status', authenticate, requirePermission('finance.manage'), changeExpenseStatus);
router.get('/procurement-payments', authenticate, requirePermission('finance.view', 'finance.manage', 'reports.finance'), listProcurementPayments);
router.post('/procurement-payments', authenticate, requirePermission('finance.manage'), createProcurementPayment);
router.patch('/procurement-payments/:id/void', authenticate, requirePermission('finance.manage'), voidProcurementPayment);

module.exports = router;
