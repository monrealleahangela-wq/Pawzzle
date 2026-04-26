const express = require('express');
const router = express.Router();
const { authenticate, adminOrStaff, superAdminOnly } = require('../middleware/auth');

const {
  createPurchaseOrder, getSellerOrders, getOrderById,
  cancelOrder, confirmDelivery, adminGetAllOrders
} = require('../controllers/purchaseOrderController');

// ── Seller routes ─────────────────────────────────────────
router.post('/', authenticate, adminOrStaff, createPurchaseOrder);
router.get('/', authenticate, adminOrStaff, getSellerOrders);
router.get('/:id', authenticate, getOrderById);
router.patch('/:id/cancel', authenticate, adminOrStaff, cancelOrder);
router.patch('/:id/confirm-delivery', authenticate, adminOrStaff, confirmDelivery);

// ── Admin routes ──────────────────────────────────────────
router.get('/admin/all', authenticate, superAdminOnly, adminGetAllOrders);

module.exports = router;
