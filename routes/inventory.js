const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  getStoreInventory,
  updateInventoryQuantity,
  addToInventory,
  getLowStockAlerts,
  deleteInventoryItem,
  getAdminInventory,
  getLowStockAlertsAdmin,
  addToAdminInventory
} = require('../controllers/inventoryController');
const {
  listLots,
  getExpiryAlerts,
  receiveLot,
  listTransactions
} = require('../controllers/inventoryLotController');
const {
  listAdjustmentRequests,
  createAdjustmentRequest,
  reviewAdjustmentRequest
} = require('../controllers/inventoryAdjustmentController');
const { authenticate, requirePermission } = require('../middleware/auth');
const { storeAdminOnly, canAccessStore } = require('../middleware/storeAuth');
const { requireSubscriptionEntitlement } = require('../middleware/subscriptionEntitlement');
const { ENTITLEMENTS } = require('../config/subscriptionPlans');
const lowStockPlan = requireSubscriptionEntitlement(ENTITLEMENTS.LOW_STOCK_ALERTS);
const historyPlan = requireSubscriptionEntitlement(ENTITLEMENTS.INVENTORY_HISTORY);
const lossApprovalPlan = requireSubscriptionEntitlement(ENTITLEMENTS.STOCK_LOSS_APPROVALS);

// Validation rules
const updateQuantityValidation = [
  body('quantity').isInt({ min: 0 }).withMessage('Quantity must be a non-negative integer'),
  body('operation').optional().isIn(['set', 'add', 'subtract']).withMessage('Invalid operation'),
  body('notes').optional().isString().trim()
];

const addToInventoryValidation = [
  body('productId').isMongoId().withMessage('Valid product ID is required'),
  body('productVariantId').optional({ checkFalsy: true }).isMongoId().withMessage('Valid product variant ID is required'),
  body('operatingLocation').optional({ checkFalsy: true }).isMongoId().withMessage('Valid operating location ID is required'),
  body('quantity').isInt({ min: 0 }).withMessage('Quantity must be a non-negative integer'),
  body('operation').optional().isIn(['set', 'add', 'subtract']).withMessage('Invalid operation'),
  body('reorderLevel').optional({ checkFalsy: true }).isInt({ min: 0 }).withMessage('Reorder level must be a non-negative integer'),
  body('maxStock').optional({ checkFalsy: true }).isInt({ min: 0 }).withMessage('Max stock must be a non-negative integer'),
  body('costPrice').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Cost price must be a positive number'),
  body('location.aisle').optional({ checkFalsy: true }).isString().trim(),
  body('location.shelf').optional({ checkFalsy: true }).isString().trim(),
  body('location.bin').optional({ checkFalsy: true }).isString().trim(),
  body('supplier.name').optional({ checkFalsy: true }).isString().trim(),
  body('supplier.contact').optional({ checkFalsy: true }).isString().trim(),
  body('supplier.email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid supplier email'),
  body('supplier.phone').optional({ checkFalsy: true }).isString().trim(),
  body('notes').optional({ checkFalsy: true }).isString().trim()
];

// ─── Admin routes (no storeId needed — admin IS the store) ───────────────────
router.get('/admin', authenticate, requirePermission('inventory.view'), getAdminInventory);
router.get('/admin/alerts', authenticate, requirePermission('inventory.view'), lowStockPlan, getLowStockAlertsAdmin);
router.post('/admin', authenticate, requirePermission('inventory.adjust'), addToInventoryValidation, addToAdminInventory);

// Lot ledger and vaccine/medicine monitoring
router.get('/lots', authenticate, requirePermission('inventory.view', 'inventory.vaccine'), listLots);
router.post('/lots/receive', authenticate, requirePermission('inventory.receive'), receiveLot);
router.get('/expiry-alerts', authenticate, requirePermission('inventory.view', 'inventory.vaccine'), getExpiryAlerts);
router.get('/transactions', authenticate, requirePermission('inventory.view'), historyPlan, listTransactions);

// Stock reductions are auditable requests. Supplier receiving is the only
// normal stock-in path; staff reductions require independent review.
router.get('/adjustment-requests', authenticate, requirePermission('inventory.view'), lossApprovalPlan, listAdjustmentRequests);
router.post('/adjustment-requests', authenticate, storeAdminOnly, requirePermission('inventory.adjust'), lossApprovalPlan, [
  body('inventoryId').isMongoId().withMessage('Valid inventory ID is required'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be a whole number greater than 0'),
  body('adjustmentType').isIn(['damage', 'expired', 'missing', 'internal_use', 'count_discrepancy', 'other']).withMessage('Choose a valid reason category'),
  body('reason').isString().trim().isLength({ min: 8, max: 1000 }).withMessage('A clear reason is required'),
  body('evidence').optional().isArray({ max: 5 }).withMessage('Evidence must be a list of uploaded files')
], createAdjustmentRequest);
router.patch('/adjustment-requests/:id/review', authenticate, storeAdminOnly, lossApprovalPlan, [
  body('decision').isIn(['approve', 'reject']).withMessage('Choose approve or reject'),
  body('reviewNotes').optional().isString().trim().isLength({ max: 1000 })
], reviewAdjustmentRequest);

// ─── Store-specific routes ────────────────────────────────────────────────────
router.get('/store/:storeId', authenticate, canAccessStore, getStoreInventory);
router.get('/store/:storeId/alerts', authenticate, canAccessStore, lowStockPlan, getLowStockAlerts);
router.post('/store/:storeId', authenticate, storeAdminOnly, addToInventoryValidation, addToInventory);

// Inventory item routes
router.put('/:id', authenticate, storeAdminOnly, requirePermission('inventory.adjust'), updateQuantityValidation, updateInventoryQuantity);
router.delete('/:id', authenticate, storeAdminOnly, requirePermission('inventory.adjust'), deleteInventoryItem);

module.exports = router;
