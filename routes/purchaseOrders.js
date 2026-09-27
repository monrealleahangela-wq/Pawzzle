const express = require('express');
const router = express.Router();
const { authenticate, requirePermission, superAdminOnly } = require('../middleware/auth');

const {
  getProcurementCart, addProcurementCartItem, updateProcurementCartItem,
  removeProcurementCartItem, clearProcurementCart, submitProcurementCart,
  createPurchaseOrder, getSellerOrders, getOrderById,
  cancelOrder, confirmDelivery, adminGetAllOrders
} = require('../controllers/purchaseOrderController');

// ── Seller routes ─────────────────────────────────────────
router.post('/', authenticate, requirePermission('procurement.manage'), createPurchaseOrder);
router.get('/', authenticate, requirePermission('procurement.view', 'procurement.manage', 'purchase_orders.own'), getSellerOrders);
router.get('/admin/all', authenticate, superAdminOnly, adminGetAllOrders);
router.get('/cart/current', authenticate, requirePermission('procurement.manage'), getProcurementCart);
router.post('/cart/items', authenticate, requirePermission('procurement.manage'), addProcurementCartItem);
router.patch('/cart/items/:itemId', authenticate, requirePermission('procurement.manage'), updateProcurementCartItem);
router.delete('/cart/items/:itemId', authenticate, requirePermission('procurement.manage'), removeProcurementCartItem);
router.delete('/cart', authenticate, requirePermission('procurement.manage'), clearProcurementCart);
router.post('/cart/submit', authenticate, requirePermission('procurement.manage'), submitProcurementCart);
router.get('/:id', authenticate, getOrderById);
router.patch('/:id/cancel', authenticate, requirePermission('procurement.manage'), cancelOrder);
router.patch('/:id/confirm-delivery', authenticate, requirePermission('inventory.receive'), confirmDelivery);

// ── Admin routes ──────────────────────────────────────────
module.exports = router;
