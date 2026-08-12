const express = require('express');
const { authenticate, requirePermission } = require('../middleware/auth');
const {
  getLogisticsDashboard,
  getDeliveries,
  getDeliveryDetails,
  getDeliveryIssues,
  resolveDeliveryIssue
} = require('../controllers/logisticsController');

const router = express.Router();
router.use(authenticate, requirePermission('logistics.manage'));
router.get('/dashboard', getLogisticsDashboard);
router.get('/deliveries', getDeliveries);
router.get('/deliveries/:id', getDeliveryDetails);
router.get('/issues', getDeliveryIssues);
router.patch('/issues/:deliveryId/:issueType/:issueId/resolve', resolveDeliveryIssue);

module.exports = router;
