const express = require('express');
const router = express.Router();
const { authenticate, requirePermission, superAdminOnly } = require('../middleware/auth');
const { uploadProcurementEvidence, handleUploadError } = require('../middleware/upload');

const {
  getProcurementCart, addProcurementCartItem, updateProcurementCartItem,
  removeProcurementCartItem, clearProcurementCart, submitProcurementCart,
  createPurchaseOrder, getSellerOrders, getOrderById,
  cancelOrder, confirmDelivery, authorizeReceivingInspectionUpload, authorizeResolutionReinspectionUpload,
  submitReceivingInspection, reviewSupplierResolution, submitResolutionReinspection,
  getReceivingInspection, getReceivingEvidenceAccess, adminGetAllOrders
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
router.get('/:id/inspection', authenticate, requirePermission('procurement.view', 'procurement.manage', 'inventory.receive', 'purchase_orders.own'), getReceivingInspection);
router.get('/:id/inspection/evidence/:evidenceId/access', authenticate, getReceivingEvidenceAccess);
router.post('/:id/inspection', authenticate, requirePermission('procurement.manage', 'inventory.receive'), authorizeReceivingInspectionUpload, uploadProcurementEvidence, handleUploadError, submitReceivingInspection);
router.patch('/:id/resolutions/:resolutionId', authenticate, requirePermission('procurement.manage', 'inventory.receive'), reviewSupplierResolution);
router.post('/:id/resolutions/:resolutionId/reinspection', authenticate, requirePermission('procurement.manage', 'inventory.receive'), authorizeResolutionReinspectionUpload, uploadProcurementEvidence, handleUploadError, submitResolutionReinspection);
router.get('/:id', authenticate, getOrderById);
router.patch('/:id/cancel', authenticate, requirePermission('procurement.manage'), cancelOrder);
router.patch('/:id/confirm-delivery', authenticate, requirePermission('procurement.manage', 'inventory.receive'), confirmDelivery);

// ── Admin routes ──────────────────────────────────────────
module.exports = router;
