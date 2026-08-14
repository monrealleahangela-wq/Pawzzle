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
  assignBookingStaff,
  checkInBooking
} = require('../controllers/bookingController');
const { authenticate, adminOrStaff, requirePermission } = require('../middleware/auth');
const canViewBookings = requirePermission('bookings.assigned', 'bookings.view', 'bookings.manage');
const canUpdateBookings = requirePermission('bookings.update', 'bookings.manage');

// Validation rules
const updateBookingStatusValidation = [
  body('status').isIn(['confirmed', 'approved', 'processing', 'finished', 'completed', 'cancelled', 'no_show']).withMessage('Invalid booking status')
];

// Admin routes (filtered by user's store)
router.get('/', authenticate, adminOrStaff, canViewBookings, getAllAdminBookings);
router.get('/:id', authenticate, adminOrStaff, canViewBookings, getBookingById);
router.get('/:id/eligible-staff', authenticate, adminOrStaff, canViewBookings, getEligibleBookingStaff);
const proposalValidation = [
  body('staffId').isMongoId().withMessage('Valid staff ID is required'),
  body('estimatedDurationMinutes').optional().isInt({ min: 1, max: 1440 }).withMessage('Estimated duration must be between 1 and 1,440 minutes'),
  body('specialInstructions').optional().isString().trim().isLength({ max: 2000 }).withMessage('Special instructions must be 2,000 characters or fewer')
];
router.put('/:id/proposal', authenticate, adminOrStaff, canUpdateBookings, proposalValidation, assignBookingStaff);
router.put('/:id/assign-staff', authenticate, adminOrStaff, canUpdateBookings, proposalValidation, assignBookingStaff);
router.post('/:id/check-in', authenticate, adminOrStaff, canUpdateBookings, checkInBooking);
router.put('/:id/status', authenticate, adminOrStaff, canUpdateBookings, updateBookingStatusValidation, updateBookingStatus);
router.put('/:id/cancel', authenticate, adminOrStaff, canUpdateBookings, cancelBooking);

module.exports = router;
