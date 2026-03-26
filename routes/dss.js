const express = require('express');
const router = express.Router();
const { authenticate, adminOnly, superAdminOnly } = require('../middleware/auth');
const { getCustomerInsights, getAdminInsights, getStaffInsights, getSuperAdminInsights } = require('../controllers/dssController');

// Customer DSS - any authenticated user
router.get('/customer', authenticate, getCustomerInsights);

// Staff-Specific Intelligence Dashboard (DSS) - staff or admin
router.get('/staff', authenticate, getStaffInsights);

// Admin (Store Owner) DSS - admin or super_admin ONLY
router.get('/admin', authenticate, adminOnly, getAdminInsights);

// Super Admin DSS - super_admin only
router.get('/superadmin', authenticate, superAdminOnly, getSuperAdminInsights);

module.exports = router;
