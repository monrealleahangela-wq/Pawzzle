const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  getAllAdminBookings
} = require('../controllers/adminBookingController');

const {
  getBookingById,
  updateBookingStatus,
  updatePaymentMethod,
  cancelBooking
} = require('../controllers/bookingController');
const { authenticate, adminOrStaff } = require('../middleware/auth');

// Validation rules
const updateBookingStatusValidation = [
  body('status').isIn(['pending', 'confirmed', 'cancelled', 'completed']).withMessage('Invalid booking status')
];

const updatePaymentMethodValidation = [
  body('paymentMethod').isIn(['cash', 'gcash', 'maya', 'bank_transfer', 'credit_card']).withMessage('Invalid payment method')
];

// Admin routes (filtered by user's store)
router.get('/', authenticate, adminOrStaff, getAllAdminBookings);
router.put('/:id/status', authenticate, adminOrStaff, updateBookingStatusValidation, updateBookingStatus);
router.put('/:id/payment-method', authenticate, adminOrStaff, updatePaymentMethodValidation, updatePaymentMethod);
router.put('/:id/cancel', authenticate, adminOrStaff, cancelBooking);

module.exports = router;
