const express = require('express');
const router = express.Router();
const { authenticate, adminOrStaff } = require('../middleware/auth');

const {
  addSupply, getSupplies, updateSupply, deleteSupply,
  restockSupply, deductSupply, checkAvailability, getAlerts, getLogs
} = require('../controllers/serviceSupplyController');

// ── Supply CRUD ───────────────────────────────────────────
router.post('/', authenticate, adminOrStaff, addSupply);
router.get('/', authenticate, adminOrStaff, getSupplies);
router.put('/:id', authenticate, adminOrStaff, updateSupply);
router.delete('/:id', authenticate, adminOrStaff, deleteSupply);

// ── Operations ────────────────────────────────────────────
router.patch('/:id/restock', authenticate, adminOrStaff, restockSupply);
router.patch('/:id/deduct', authenticate, adminOrStaff, deductSupply);

// ── Checking ──────────────────────────────────────────────
router.get('/check-availability', authenticate, checkAvailability);
router.get('/alerts', authenticate, adminOrStaff, getAlerts);

// ── Audit Logs ────────────────────────────────────────────
router.get('/logs', authenticate, adminOrStaff, getLogs);

module.exports = router;
