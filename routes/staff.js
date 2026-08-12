const express = require('express');
const router = express.Router();
const { authenticate, adminOnly, requirePermission } = require('../middleware/auth');
const {
    getMyStaff,
    getStaffConfiguration,
    getStaffProfile,
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
router.get('/riders/eligible', authenticate, requirePermission('logistics.manage'), getEligibleRiders);
router.get('/riders/:id', authenticate, requirePermission('logistics.manage'), getRiderDetails);

// Remaining routes require authentication and admin/super_admin role
router.use(authenticate, adminOnly);

router.get('/configuration', getStaffConfiguration);
router.get('/:id/profile', getStaffProfile);
router.get('/', getMyStaff);
router.post('/riders/:id/payouts', createRiderPayout);
router.patch('/rider-payouts/:payoutId', updateRiderPayout);
router.post('/', createStaff);
router.put('/:id', updateStaff);
router.patch('/:id/toggle-status', toggleStaffStatus);
router.patch('/:id/reset-password', resetStaffPassword);
router.delete('/:id', deleteStaff);

module.exports = router;
