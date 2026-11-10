const express = require('express');
const router = express.Router();
const { requireSubscriptionEntitlement } = require('../middleware/subscriptionEntitlement');
const { ENTITLEMENTS } = require('../config/subscriptionPlans');
const promotionsPlan = requireSubscriptionEntitlement(ENTITLEMENTS.PROMOTIONS);
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
router.post('/', authenticate, adminOrStaff, canManageVouchers, promotionsPlan, createVoucher);
router.put('/:id', authenticate, adminOrStaff, canManageVouchers, promotionsPlan, updateVoucher);
router.delete('/:id', authenticate, adminOrStaff, canManageVouchers, promotionsPlan, deleteVoucher);
router.patch('/:id/status', authenticate, adminOrStaff, canManageVouchers, promotionsPlan, toggleVoucherStatus);

module.exports = router;
