const express = require('express');
const router = express.Router();
const { verifyVoucher, claimVoucher, getMyVouchers, getAvailableVouchers } = require('../controllers/voucherController');
const { authenticate } = require('../middleware/auth');

router.get('/available', authenticate, getAvailableVouchers);
router.post('/claim', authenticate, claimVoucher);
router.get('/my-vouchers', authenticate, getMyVouchers);
router.post('/verify', authenticate, verifyVoucher);

module.exports = router;
