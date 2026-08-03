const express = require('express');
const router = express.Router();
const { authenticate, requirePermission, superAdminOnly } = require('../middleware/auth');

const {
  createPurchaseOrder, getSellerOrders, getOrderById,
  cancelOrder, confirmDelivery, adminGetAllOrders
} = require('../controllers/purchaseOrderController');

// ── Seller routes ─────────────────────────────────────────
router.post('/', authenticate, requirePermission('procurement.manage'), createPurchaseOrder);
router.get('/', authenticate, requirePermission('procurement.view', 'procurement.manage', 'purchase_orders.own'), getSellerOrders);
router.get('/admin/all', authenticate, superAdminOnly, adminGetAllOrders);
router.get('/:id', authenticate, getOrderById);
router.patch('/:id/cancel', authenticate, requirePermission('procurement.manage'), cancelOrder);
router.patch('/:id/confirm-delivery', authenticate, requirePermission('inventory.receive'), confirmDelivery);

// ── Admin routes ──────────────────────────────────────────
module.exports = router;
