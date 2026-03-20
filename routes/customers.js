const express = require('express');
const router = express.Router();
const { authenticate, adminOrStaff } = require('../middleware/auth');
const { getStoreCustomers } = require('../controllers/customerController');

// All routes require authentication and admin/staff role
router.use(authenticate, adminOrStaff);

router.get('/', getStoreCustomers);

module.exports = router;
