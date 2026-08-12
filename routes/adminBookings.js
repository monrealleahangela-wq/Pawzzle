const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  getAllAdminBookings
} = require('../controllers/adminBookingController');

const {
  getBookingById,
  updateBookingStatus,
  cancelBooking,
  getEligibleBookingStaff,
  assignBookingStaff
} = require('../controllers/bookingController');
const { authenticate, adminOrStaff } = require('../middleware/auth');

// Validation rules
const updateBookingStatusValidation = [
  body('status').isIn(['confirmed', 'approved', 'processing', 'finished', 'completed', 'cancelled', 'no_show']).withMessage('Invalid booking status')
];

// Admin routes (filtered by user's store)
router.get('/', authenticate, adminOrStaff, getAllAdminBookings);
router.get('/:id', authenticate, adminOrStaff, getBookingById);
router.get('/:id/eligible-staff', authenticate, adminOrStaff, getEligibleBookingStaff);
router.put('/:id/assign-staff', authenticate, adminOrStaff, body('staffId').isMongoId().withMessage('Valid staff ID is required'), assignBookingStaff);
router.put('/:id/status', authenticate, adminOrStaff, updateBookingStatusValidation, updateBookingStatus);
router.put('/:id/cancel', authenticate, adminOrStaff, cancelBooking);

module.exports = router;
