const express = require('express');
const router = express.Router();
const {
    createReport,
    getAllReports,
    updateReportStatus
} = require('../controllers/adminReportController');
const { authenticate, adminOrStaff, platformAdminOnly, requirePermission } = require('../middleware/auth');

router.get('/', authenticate, adminOrStaff, requirePermission('reports.view'), getAllReports);
router.post('/', authenticate, adminOrStaff, createReport);
router.patch('/:id/status', authenticate, platformAdminOnly, updateReportStatus);

module.exports = router;
