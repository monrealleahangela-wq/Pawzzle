const express = require('express');
const router = express.Router();
const { authenticate, adminOnly, superAdminOnly, requirePermission } = require('../middleware/auth');
const {
  productForecast, replenishment, supplierScorecard, decideRecommendation
} = require('../controllers/decisionSupportController');
const { getCustomerInsights, getAdminInsights, getStaffInsights, getSuperAdminInsights } = require('../controllers/dssController');
const { getServiceRecommendations, getDSSConfig, updateDSSConfig } = require('../controllers/serviceRecommendationController');

// Customer DSS - any authenticated user
router.get('/customer', authenticate, getCustomerInsights);
router.get('/service-recommendations', authenticate, getServiceRecommendations);
router.get('/service-config', authenticate, adminOnly, getDSSConfig);
router.put('/service-config', authenticate, adminOnly, updateDSSConfig);

// Staff-Specific Intelligence Dashboard (DSS) - staff or admin
router.get('/staff', authenticate, getStaffInsights);

// Admin (Store Owner) DSS - admin or super_admin ONLY
router.get('/admin', authenticate, adminOnly, getAdminInsights);

// Super Admin DSS - super_admin only
router.get('/superadmin', authenticate, superAdminOnly, getSuperAdminInsights);

// Predictive and prescriptive DSS endpoints. Legacy endpoints above remain for compatibility.
router.get('/forecast/products/:productId', authenticate, requirePermission('dss.view', 'dss.manage', 'dss.inventory'), productForecast);
router.post('/replenishment/:productId', authenticate, requirePermission('dss.manage', 'dss.inventory'), replenishment);
router.get('/suppliers/scorecard', authenticate, requirePermission('dss.view', 'dss.manage', 'dss.suppliers'), supplierScorecard);
router.patch('/recommendations/:id/decision', authenticate, requirePermission('dss.manage'), decideRecommendation);

module.exports = router;
