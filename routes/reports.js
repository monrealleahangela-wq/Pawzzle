const express = require('express');
const router = express.Router();
const {
    createReport,
    getAllReports,
    updateReportStatus
} = require('../controllers/reportController');
const { authenticate, superAdminOnly } = require('../middleware/auth');

// Seller/User reporting
router.post('/', authenticate, createReport);

// Super Admin Management
router.get('/all', authenticate, superAdminOnly, getAllReports);
router.patch('/:reportId', authenticate, superAdminOnly, updateReportStatus);

module.exports = router;
