const express = require('express');
const router = express.Router();
const { authenticate, adminOrStaff, requirePermission } = require('../middleware/auth');
const { getStoreCustomers, getStoreCustomerDetails } = require('../controllers/customerController');

// All routes require authentication and admin/staff role
router.use(authenticate, adminOrStaff, requirePermission('customers.view', 'customers.manage'));

router.get('/', getStoreCustomers);
router.get('/:customerId', getStoreCustomerDetails);

module.exports = router;
