const express = require('express');
const router = express.Router();
const { authenticate, adminOrStaff, requirePermission } = require('../middleware/auth');

const {
  addSupply, getSupplies, updateSupply, deleteSupply,
  restockSupply, deductSupply, checkAvailability, getAlerts, getLogs
} = require('../controllers/serviceSupplyController');

// ── Supply CRUD ───────────────────────────────────────────
router.post('/', authenticate, adminOrStaff, requirePermission('inventory.adjust', 'inventory.manage'), addSupply);
router.get('/', authenticate, adminOrStaff, requirePermission('inventory.view', 'inventory.manage'), getSupplies);
router.put('/:id', authenticate, adminOrStaff, requirePermission('inventory.adjust', 'inventory.manage'), updateSupply);
router.delete('/:id', authenticate, adminOrStaff, requirePermission('inventory.adjust', 'inventory.manage'), deleteSupply);

// ── Operations ────────────────────────────────────────────
router.patch('/:id/restock', authenticate, adminOrStaff, requirePermission('inventory.adjust', 'inventory.manage'), restockSupply);
router.patch('/:id/deduct', authenticate, adminOrStaff, requirePermission('inventory.adjust', 'inventory.manage'), deductSupply);

// ── Checking ──────────────────────────────────────────────
router.get('/check-availability', authenticate, checkAvailability);
router.get('/alerts', authenticate, adminOrStaff, requirePermission('inventory.view', 'inventory.manage'), getAlerts);

// ── Audit Logs ────────────────────────────────────────────
router.get('/logs', authenticate, adminOrStaff, requirePermission('inventory.view', 'inventory.manage'), getLogs);

module.exports = router;
