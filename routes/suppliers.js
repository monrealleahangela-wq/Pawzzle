const express = require('express');
const router = express.Router();
const { authenticate, superAdminOnly, requirePermission, requirePasswordChangeCompleted } = require('../middleware/auth');
const { uploadDoc, handleUploadError } = require('../middleware/upload');

const {
  registerSupplier, resubmitSupplierApplication,
  createStoreSupplier, getStoreManagedSuppliers, resendStoreSupplierInvitation, activateSupplierInvitation,
  updateStoreSupplierAssociation,
  getMySupplierProfile, updateSupplierProfile, getSupplierDashboard,
  addProduct, getMyProducts, updateProduct, deleteProduct,
  getSupplierOrders, updateOrderStatus,
  browseSuppliers, getSupplierCatalog,
  adminGetAllSuppliers, adminVerifySupplier, adminGetSupplierDetails,
  adminUpdateSupplier, adminDeactivateSupplier
} = require('../controllers/supplierController');

// ── Supplier self-service routes ──────────────────────────
const supplierDocumentUpload = uploadDoc.fields([
  { name: 'businessRegistration', maxCount: 1 },
  { name: 'birCertificate', maxCount: 1 }
]);

router.get('/activate/:token', activateSupplierInvitation);
router.post('/register', authenticate, supplierDocumentUpload, handleUploadError, registerSupplier);
router.post('/application/resubmit', authenticate, supplierDocumentUpload, handleUploadError, resubmitSupplierApplication);
router.get('/me', authenticate, requirePasswordChangeCompleted, getMySupplierProfile);
router.put('/me', authenticate, requirePasswordChangeCompleted, updateSupplierProfile);
router.get('/dashboard', authenticate, requirePasswordChangeCompleted, getSupplierDashboard);

// ── Supplier product management ───────────────────────────
router.post('/products', authenticate, requirePasswordChangeCompleted, addProduct);
router.get('/products', authenticate, requirePasswordChangeCompleted, getMyProducts);
router.put('/products/:id', authenticate, requirePasswordChangeCompleted, updateProduct);
router.delete('/products/:id', authenticate, requirePasswordChangeCompleted, deleteProduct);

// ── Supplier order management ─────────────────────────────
router.get('/orders', authenticate, requirePasswordChangeCompleted, getSupplierOrders);
router.patch('/orders/:id/status', authenticate, requirePasswordChangeCompleted, updateOrderStatus);

// Store-scoped supplier invitations and lifecycle. The server resolves the
// caller's store; no client-provided store or owner id is trusted.
router.get('/store-managed', authenticate, requirePermission('suppliers.manage', 'procurement.manage'), getStoreManagedSuppliers);
router.post('/store-managed', authenticate, requirePermission('suppliers.manage', 'procurement.manage'), createStoreSupplier);
router.post('/store-managed/:id/resend-invitation', authenticate, requirePermission('suppliers.manage', 'procurement.manage'), resendStoreSupplierInvitation);
router.patch('/store-managed/:id/status', authenticate, requirePermission('suppliers.manage', 'procurement.manage'), updateStoreSupplierAssociation);

// ── Public: Browse verified suppliers (for sellers) ───────
router.get('/browse', authenticate, browseSuppliers);
router.get('/catalog/:supplierId', authenticate, getSupplierCatalog);

// ── Admin: Supplier verification & management ─────────────
router.get('/admin/all', authenticate, superAdminOnly, adminGetAllSuppliers);
router.get('/admin/:id', authenticate, superAdminOnly, adminGetSupplierDetails);
router.patch('/admin/:id/verify', authenticate, superAdminOnly, adminVerifySupplier);
router.put('/admin/:id', authenticate, superAdminOnly, adminUpdateSupplier);
router.delete('/admin/:id', authenticate, superAdminOnly, adminDeactivateSupplier);

module.exports = router;
