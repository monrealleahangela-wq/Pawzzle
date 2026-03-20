const express = require('express');
const router = express.Router();
const { authenticate, adminOnly } = require('../middleware/auth');
const {
    getPayoutStats,
    requestPayout,
    getPayoutHistory,
    updatePayoutMethods,
    getAllPayoutRequests,
    processPayout
} = require('../controllers/payoutController');

// Admin: view & process all payout requests
router.get('/admin/all', authenticate, adminOnly, getAllPayoutRequests);
router.patch('/admin/:id/process', authenticate, adminOnly, processPayout);

// Store owner routes
router.get('/stats', authenticate, getPayoutStats);
router.get('/history', authenticate, getPayoutHistory);
router.post('/request', authenticate, requestPayout);
router.put('/methods', authenticate, updatePayoutMethods);

module.exports = router;
