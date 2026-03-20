const express = require('express');
const router = express.Router();
const { authenticate, superAdminOnly } = require('../middleware/auth');
const { getCustomerInsights, getAdminInsights, getSuperAdminInsights } = require('../controllers/dssController');

// Customer DSS - any authenticated user
router.get('/customer', authenticate, getCustomerInsights);

// Admin (Store Owner) DSS - admin or super_admin
router.get('/admin', authenticate, getAdminInsights);

// Super Admin DSS - super_admin only
router.get('/superadmin', authenticate, superAdminOnly, getSuperAdminInsights);

module.exports = router;
