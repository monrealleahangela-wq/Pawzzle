const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  createBooking,
  getCustomerBookings,
  getStoreBookings,
  getAllBookings,
  getCalendarBookings,
  updateBookingStatus,
  updatePaymentMethod,
  cancelBooking
} = require('../controllers/bookingController');
const { authenticate, superAdminOnly } = require('../middleware/auth');
const { storeAdminOnly, canAccessStore } = require('../middleware/storeAuth');

// Validation rules
const createBookingValidation = [
  body('serviceId').notEmpty().withMessage('Service ID is required'),
  body('pet.name').trim().notEmpty().withMessage('Pet name is required'),
  body('pet.type').trim().notEmpty().withMessage('Pet type is required'),
  body('pet.breed').trim().notEmpty().withMessage('Pet breed is required'),
  body('pet.age').isInt({ min: 0, max: 30 }).withMessage('Pet age must be between 0 and 30'),
  body('pet.weight').isFloat({ min: 0 }).withMessage('Pet weight must be positive'),
  body('bookingDate').isISO8601().withMessage('Valid booking date is required'),
  body('startTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Start time must be in HH:MM format'),
  body('endTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('End time must be in HH:MM format'),
  body('isHomeService').optional().isBoolean().withMessage('Home service must be boolean'),
  body('serviceAddress.street').optional().trim().notEmpty().withMessage('Street address is required for home service'),
  body('serviceAddress.city').optional().trim().notEmpty().withMessage('City is required for home service'),
  body('serviceAddress.province').optional().trim().notEmpty().withMessage('Province is required for home service')
];

const updateStatusValidation = [
  body('status').isIn(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']).withMessage('Invalid status'),
  body('adminNotes').optional().trim()
];

const updatePaymentValidation = [
  body('paymentMethod').isIn(['online', 'in_person']).withMessage('Invalid payment method')
];

// Customer routes
router.post('/', authenticate, createBookingValidation, createBooking);
router.get('/my-bookings', authenticate, getCustomerBookings);
router.get('/calendar', authenticate, getCalendarBookings);
router.put('/:bookingId/payment', authenticate, updatePaymentValidation, updatePaymentMethod);
router.delete('/:bookingId', authenticate, cancelBooking);

// Admin routes (accessible by both admin and super_admin)
router.get('/all', authenticate, getAllBookings);

// Store admin routes
router.get('/store/:storeId', authenticate, storeAdminOnly, getStoreBookings);
router.put('/:bookingId/status', authenticate, storeAdminOnly, updateStatusValidation, updateBookingStatus);

module.exports = router;
