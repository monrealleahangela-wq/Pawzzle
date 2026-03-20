const express = require('express');
const router = express.Router();
const {
    createReport,
    getAllReports,
    updateReportStatus
} = require('../controllers/adminReportController');
const { authenticate, adminOrStaff } = require('../middleware/auth');

router.get('/', authenticate, adminOrStaff, getAllReports);
router.post('/', authenticate, adminOrStaff, createReport);
router.patch('/:id/status', authenticate, adminOrStaff, updateReportStatus);

module.exports = router;
