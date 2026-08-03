const express = require('express');
const { authenticate, requirePermission } = require('../middleware/auth');
const { createExpense, listExpenses, getFinancialSummary } = require('../controllers/financeController');

const router = express.Router();
router.get('/summary', authenticate, requirePermission('finance.view', 'finance.manage', 'reports.finance'), getFinancialSummary);
router.get('/expenses', authenticate, requirePermission('finance.view', 'finance.manage', 'reports.finance'), listExpenses);
router.post('/expenses', authenticate, requirePermission('finance.manage'), createExpense);

module.exports = router;
