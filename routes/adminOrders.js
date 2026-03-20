const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  getAllAdminOrders
} = require('../controllers/adminOrderController');

const {
  getOrderById,
  updateOrderStatus,
  confirmOrderPayment,
  cancelOrder
} = require('../controllers/orderController');
const { authenticate, adminOrStaff } = require('../middleware/auth');

// Validation rules
const updateOrderStatusValidation = [
  body('status').isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']).withMessage('Invalid order status')
];

// Admin routes (filtered by user's store)
router.get('/', authenticate, adminOrStaff, getAllAdminOrders);
router.get('/:id', authenticate, adminOrStaff, getOrderById);
router.patch('/:id/status', authenticate, adminOrStaff, updateOrderStatusValidation, updateOrderStatus);
router.patch('/:id/confirm-payment', authenticate, adminOrStaff, confirmOrderPayment);
router.patch('/:id/cancel', authenticate, adminOrStaff, cancelOrder);

module.exports = router;
