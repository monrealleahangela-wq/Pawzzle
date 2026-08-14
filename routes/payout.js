const express = require('express');
const router = express.Router();
const { authenticate, adminOnly, platformAdminOnly } = require('../middleware/auth');
const {
    getPayoutStats,
    requestPayout,
    getPayoutHistory,
    updatePayoutMethods,
    getAllPayoutRequests,
    processPayout
} = require('../controllers/payoutController');

// Admin: view & process all payout requests
router.get('/admin/all', authenticate, platformAdminOnly, getAllPayoutRequests);
router.patch('/admin/:id/process', authenticate, platformAdminOnly, processPayout);

// Store owner routes
router.get('/stats', authenticate, adminOnly, getPayoutStats);
router.get('/history', authenticate, adminOnly, getPayoutHistory);
router.post('/request', authenticate, adminOnly, requestPayout);
router.put('/methods', authenticate, adminOnly, updatePayoutMethods);

module.exports = router;
