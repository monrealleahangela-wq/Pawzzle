const express = require('express');
const router = express.Router();
const {
    getAllVouchers,
    createVoucher,
    updateVoucher,
    deleteVoucher,
    toggleVoucherStatus
} = require('../controllers/adminVoucherController');
const { authenticate, adminOrStaff, requirePermission } = require('../middleware/auth');

const canViewVouchers = requirePermission('sales.view', 'sales.manage');
const canManageVouchers = requirePermission('sales.manage');

router.get('/', authenticate, adminOrStaff, canViewVouchers, getAllVouchers);
router.post('/', authenticate, adminOrStaff, canManageVouchers, createVoucher);
router.put('/:id', authenticate, adminOrStaff, canManageVouchers, updateVoucher);
router.delete('/:id', authenticate, adminOrStaff, canManageVouchers, deleteVoucher);
router.patch('/:id/status', authenticate, adminOrStaff, canManageVouchers, toggleVoucherStatus);

module.exports = router;
