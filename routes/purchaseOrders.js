const express = require('express');
const router = express.Router();
const { requireSubscriptionEntitlement } = require('../middleware/subscriptionEntitlement');
const { ENTITLEMENTS } = require('../config/subscriptionPlans');
const procurementPlan = requireSubscriptionEntitlement(ENTITLEMENTS.SUPPLIER_PROCUREMENT);
const receivingPlan = requireSubscriptionEntitlement(ENTITLEMENTS.GOODS_RECEIVING);
const supplierComparisonPlan = requireSubscriptionEntitlement(ENTITLEMENTS.SUPPLIER_COMPARISONS);
const { authenticate, requirePermission, superAdminOnly } = require('../middleware/auth');
const { uploadProcurementEvidence, handleUploadError } = require('../middleware/upload');

const {
  getProcurementCart, addProcurementCartItem, updateProcurementCartItem,
  getComparableSupplierOffers, confirmSupplierOfferMatch,
  getProcurementStoreProducts,
  removeProcurementCartItem, clearProcurementCart, submitProcurementCart,
  createPurchaseOrder, getSellerOrders, getOrderById,
  cancelOrder, confirmDelivery, authorizeReceivingInspectionUpload, authorizeResolutionReinspectionUpload,
  getReceivingProductLinks, linkReceivingStoreProduct, createReceivingStoreProduct,
  submitReceivingInspection, reviewSupplierResolution, submitResolutionReinspection,
  getReceivingInspection, getReceivingEvidenceAccess, adminGetAllOrders
} = require('../controllers/purchaseOrderController');
const {
  createVariantMapping,
  listVariantMappings,
  updateVariantMappingStatus
} = require('../controllers/supplierVariantMappingController');

// ── Seller routes ─────────────────────────────────────────
router.post('/', authenticate, requirePermission('procurement.manage'), createPurchaseOrder);
router.get('/', authenticate, requirePermission('procurement.view', 'procurement.manage', 'purchase_orders.own'), getSellerOrders);
router.get('/admin/all', authenticate, superAdminOnly, adminGetAllOrders);
router.get('/cart/current', authenticate, requirePermission('procurement.manage'), getProcurementCart);
router.get('/store-products', authenticate, requirePermission('procurement.manage'), getProcurementStoreProducts);
router.get('/offers/:storeProductId', authenticate, requirePermission('procurement.manage'), getComparableSupplierOffers);
router.get('/offer-comparisons/:storeProductId', authenticate, requirePermission('procurement.manage'), supplierComparisonPlan, getComparableSupplierOffers);
router.post('/offers', authenticate, requirePermission('procurement.manage'), procurementPlan, confirmSupplierOfferMatch);
router.post('/cart/items', authenticate, requirePermission('procurement.manage'), addProcurementCartItem);
router.patch('/cart/items/:itemId', authenticate, requirePermission('procurement.manage'), updateProcurementCartItem);
router.delete('/cart/items/:itemId', authenticate, requirePermission('procurement.manage'), removeProcurementCartItem);
router.delete('/cart', authenticate, requirePermission('procurement.manage'), clearProcurementCart);
router.post('/cart/submit', authenticate, requirePermission('procurement.manage'), submitProcurementCart);
router.get('/variant-mappings', authenticate, requirePermission('procurement.view', 'procurement.manage', 'inventory.receive'), procurementPlan, listVariantMappings);
router.post('/variant-mappings', authenticate, requirePermission('procurement.manage', 'inventory.receive'), procurementPlan, createVariantMapping);
router.patch('/variant-mappings/:id', authenticate, requirePermission('procurement.manage', 'inventory.receive'), procurementPlan, updateVariantMappingStatus);
router.get('/:id/receiving-product-links', authenticate, requirePermission('procurement.view', 'procurement.manage', 'inventory.receive'), getReceivingProductLinks);
router.patch('/:id/items/:itemId/store-product', authenticate, requirePermission('procurement.manage', 'inventory.receive'), linkReceivingStoreProduct);
router.post('/:id/items/:itemId/store-product', authenticate, requirePermission('procurement.manage', 'inventory.receive'), requirePermission('products.manage', 'inventory.adjust'), createReceivingStoreProduct);
router.get('/:id/inspection', authenticate, requirePermission('procurement.view', 'procurement.manage', 'inventory.receive', 'purchase_orders.own'), getReceivingInspection);
router.get('/:id/inspection/evidence/:evidenceId/access', authenticate, getReceivingEvidenceAccess);
router.post('/:id/inspection', authenticate, requirePermission('procurement.manage', 'inventory.receive'), receivingPlan, authorizeReceivingInspectionUpload, uploadProcurementEvidence, handleUploadError, submitReceivingInspection);
router.patch('/:id/resolutions/:resolutionId', authenticate, requirePermission('procurement.manage', 'inventory.receive'), reviewSupplierResolution);
router.post('/:id/resolutions/:resolutionId/reinspection', authenticate, requirePermission('procurement.manage', 'inventory.receive'), receivingPlan, authorizeResolutionReinspectionUpload, uploadProcurementEvidence, handleUploadError, submitResolutionReinspection);
router.get('/:id', authenticate, getOrderById);
router.patch('/:id/cancel', authenticate, requirePermission('procurement.manage'), cancelOrder);
router.patch('/:id/confirm-delivery', authenticate, requirePermission('procurement.manage', 'inventory.receive'), receivingPlan, confirmDelivery);

// ── Admin routes ──────────────────────────────────────────
module.exports = router;
