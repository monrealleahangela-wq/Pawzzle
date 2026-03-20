const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  getAllOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
  cancelOrder
} = require('../controllers/orderController');
const { authenticate, adminOrStaff, customerOnly } = require('../middleware/auth');

// Validation rules
const createOrderValidation = [
  body('items').isArray({ min: 1 }).withMessage('Order must contain at least one item'),
  body('items.*.itemType').isIn(['pet', 'product']).withMessage('Invalid item type'),
  body('items.*.itemId').notEmpty().withMessage('Item ID is required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('deliveryMethod').isIn(['delivery', 'pickup']).withMessage('Invalid delivery method'),
  body('phoneNumber').notEmpty().withMessage('Phone number is required'),
  body('paymentMethod').isIn(['credit_card', 'debit_card', 'paypal', 'gcash', 'maya', 'cash_on_delivery', 'cash_on_pickup']).withMessage('Invalid payment method'),
  body('notes').optional().trim()
];

const updateOrderStatusValidation = [
  body('status').isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']).withMessage('Invalid status'),
  body('trackingNumber').optional().trim()
];

// Protected routes
router.get('/', authenticate, getAllOrders);
router.get('/:id', authenticate, getOrderById);

// Customer only routes
router.post('/', authenticate, customerOnly, createOrderValidation, createOrder);
router.patch('/:id/cancel', authenticate, cancelOrder);

// Admin/Staff routes
router.patch('/:id/status', authenticate, adminOrStaff, updateOrderStatusValidation, updateOrderStatus);

module.exports = router;
