const express = require('express');
const router = express.Router();
const { authenticate, adminOnly } = require('../middleware/auth');
const {
    getMyStaff,
    createStaff,
    updateStaff,
    toggleStaffStatus,
    deleteStaff,
    resetStaffPassword,
    getEligibleRiders,
    getRiderDetails,
    getMyRiderDetails,
    createRiderPayout,
    updateRiderPayout
} = require('../controllers/staffController');

router.get('/me/rider-summary', authenticate, getMyRiderDetails);

// Remaining routes require authentication and admin/super_admin role
router.use(authenticate, adminOnly);

router.get('/', getMyStaff);
router.get('/riders/eligible', getEligibleRiders);
router.get('/riders/:id', getRiderDetails);
router.post('/riders/:id/payouts', createRiderPayout);
router.patch('/rider-payouts/:payoutId', updateRiderPayout);
router.post('/', createStaff);
router.put('/:id', updateStaff);
router.patch('/:id/toggle-status', toggleStaffStatus);
router.patch('/:id/reset-password', resetStaffPassword);
router.delete('/:id', deleteStaff);

module.exports = router;
