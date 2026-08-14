const express = require('express');
const router = express.Router();
const { authenticate, superAdminOnly } = require('../middleware/auth');

const {
  registerSupplier, getMySupplierProfile, updateSupplierProfile, getSupplierDashboard,
  addProduct, getMyProducts, updateProduct, deleteProduct,
  getSupplierOrders, updateOrderStatus,
  browseSuppliers, getSupplierCatalog,
  adminGetAllSuppliers, adminVerifySupplier, adminGetSupplierDetails,
  adminUpdateSupplier, adminDeactivateSupplier
} = require('../controllers/supplierController');

// ── Supplier self-service routes ──────────────────────────
router.post('/register', authenticate, registerSupplier);
router.get('/me', authenticate, getMySupplierProfile);
router.put('/me', authenticate, updateSupplierProfile);
router.get('/dashboard', authenticate, getSupplierDashboard);

// ── Supplier product management ───────────────────────────
router.post('/products', authenticate, addProduct);
router.get('/products', authenticate, getMyProducts);
router.put('/products/:id', authenticate, updateProduct);
router.delete('/products/:id', authenticate, deleteProduct);

// ── Supplier order management ─────────────────────────────
router.get('/orders', authenticate, getSupplierOrders);
router.patch('/orders/:id/status', authenticate, updateOrderStatus);

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
