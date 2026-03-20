const express = require('express');
const router = express.Router();
const { authenticate, adminOnly } = require('../middleware/auth');
const {
    getMyStaff,
    createStaff,
    updateStaff,
    toggleStaffStatus,
    deleteStaff,
    resetStaffPassword
} = require('../controllers/staffController');

// All routes require authentication and admin/super_admin role
router.use(authenticate, adminOnly);

router.get('/', getMyStaff);
router.post('/', createStaff);
router.put('/:id', updateStaff);
router.patch('/:id/toggle-status', toggleStaffStatus);
router.patch('/:id/reset-password', resetStaffPassword);
router.delete('/:id', deleteStaff);

module.exports = router;
