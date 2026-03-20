const express = require('express');
const router = express.Router();
const {
    getAllVouchers,
    createVoucher,
    updateVoucher,
    deleteVoucher,
    toggleVoucherStatus
} = require('../controllers/adminVoucherController');
const { authenticate, adminOrStaff } = require('../middleware/auth');

router.get('/', authenticate, adminOrStaff, getAllVouchers);
router.post('/', authenticate, adminOrStaff, createVoucher);
router.put('/:id', authenticate, adminOrStaff, updateVoucher);
router.delete('/:id', authenticate, adminOrStaff, deleteVoucher);
router.patch('/:id/status', authenticate, adminOrStaff, toggleVoucherStatus);

module.exports = router;
