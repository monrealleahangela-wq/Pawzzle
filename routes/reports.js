const express = require('express');
const router = express.Router();
const {
    createReport,
    getAllReports,
    updateReportStatus,
    getReportById,
    submitAppeal
} = require('../controllers/reportController');
const { authenticate, superAdminOnly } = require('../middleware/auth');

// Super Admin Management
router.get('/all', authenticate, superAdminOnly, getAllReports);
router.patch('/:reportId', authenticate, superAdminOnly, updateReportStatus);

// Seller/User reporting
router.post('/', authenticate, createReport);
router.get('/:reportId', authenticate, getReportById);
router.post('/appeal/:reportId', authenticate, submitAppeal);

module.exports = router;
