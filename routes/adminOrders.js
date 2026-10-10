const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  getAllAdminOrders
} = require('../controllers/adminOrderController');

const {
  getOrderById,
  updateOrderStatus,
  cancelOrder
} = require('../controllers/orderController');
const { authenticate, adminOrStaff, requirePermission } = require('../middleware/auth');
const canViewOrders = requirePermission('sales.view', 'sales.manage', 'orders.view');
const canUpdateOrders = requirePermission('sales.manage', 'orders.update');

// Validation rules
const updateOrderStatusValidation = [
  body('status').isIn(['pending_payment', 'paid', 'awaiting_confirmation', 'confirmed', 'preparing', 'ready_for_pickup', 'rider_assigned', 'picked_up', 'in_transit', 'delivered', 'completed', 'cancelled', 'payment_failed', 'delivery_failed', 'returned', 'pending', 'processing', 'shipped', 'finalized']).withMessage('Invalid order status')
];

// Admin routes (filtered by user's store)
router.get('/', authenticate, adminOrStaff, canViewOrders, getAllAdminOrders);
router.get('/:id', authenticate, adminOrStaff, canViewOrders, getOrderById);
router.patch('/:id/status', authenticate, adminOrStaff, canUpdateOrders, updateOrderStatusValidation, updateOrderStatus);
router.patch('/:id/cancel', authenticate, adminOrStaff, canUpdateOrders, cancelOrder);

module.exports = router;
