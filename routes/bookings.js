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
  cancelBooking,
  validateBookingQR,
  getBookingById,
  getEligibleBookingStaff,
  selectBookingStaff,
  confirmBookingForPayment,
  getBookingStaffProfile
} = require('../controllers/bookingController');
const { authenticate, adminOrStaff, requirePermission } = require('../middleware/auth');
const { storeAdminOnly } = require('../middleware/storeAuth');

// Validation rules
const createBookingValidation = [
  body('serviceId').isMongoId().withMessage('Valid service ID is required'),
  body('petProfileId').optional({ checkFalsy: true }).isMongoId().withMessage('Valid pet profile ID is required'),
  body('pet.name').optional({ checkFalsy: true }).trim().isLength({ max: 120 }).withMessage('Pet name is too long'),
  body('pet.type').optional({ checkFalsy: true }).trim().isLength({ max: 80 }).withMessage('Pet type is too long'),
  body('pet.breed').optional({ checkFalsy: true }).trim().isLength({ max: 120 }).withMessage('Pet breed is too long'),
  body('pet.age').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 50 }).withMessage('Pet age must be between 0 and 50'),
  body('pet.weight').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 200 }).withMessage('Pet weight must be between 0 and 200'),
  body('bookingDate').isISO8601().withMessage('Valid booking date is required'),
  body('startTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Start time must be in HH:MM format'),
  body('endTime').optional({ checkFalsy: true }).matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('End time must be in HH:MM format'),
  body('isHomeService').optional().isBoolean().withMessage('Home service must be boolean'),
  body('serviceAddress.street').custom((value, { req }) => !req.body.isHomeService || Boolean(String(value || '').trim())).withMessage('Street address is required for home service'),
  body('serviceAddress.city').custom((value, { req }) => !req.body.isHomeService || Boolean(String(value || '').trim())).withMessage('City is required for home service'),
  body('serviceAddress.province').custom((value, { req }) => !req.body.isHomeService || Boolean(String(value || '').trim())).withMessage('Province is required for home service')
];

const updateStatusValidation = [
  body('status').isIn(['processing', 'finished', 'completed', 'cancelled', 'no_show']).withMessage('Invalid status'),
  body('adminNotes').optional().trim()
];

// Customer routes
router.post('/', authenticate, createBookingValidation, createBooking);
router.get('/my-bookings', authenticate, getCustomerBookings);
router.get('/calendar', authenticate, getCalendarBookings);
router.get('/:id/eligible-staff', authenticate, getEligibleBookingStaff);
router.get('/:id/staff/:staffId', authenticate, getBookingStaffProfile);
router.put('/:id/select-staff', authenticate, body('staffId').isMongoId().withMessage('Valid staff ID is required'), selectBookingStaff);
router.post('/:id/confirm', authenticate, confirmBookingForPayment);
router.put('/:id/cancel', authenticate, cancelBooking);
router.delete('/:bookingId', authenticate, cancelBooking);

// Admin routes (accessible by both admin and super_admin)
router.get('/all', authenticate, getAllBookings);

// Store admin routes
router.get('/store/:storeId', authenticate, requirePermission('bookings.assigned', 'bookings.view', 'bookings.manage'), storeAdminOnly, getStoreBookings);
router.put('/:bookingId/status', authenticate, requirePermission('bookings.update', 'bookings.manage'), storeAdminOnly, updateStatusValidation, updateBookingStatus);
router.post('/validate-qr', authenticate, adminOrStaff, requirePermission('bookings.update', 'bookings.manage'), validateBookingQR);
router.get('/:id', authenticate, getBookingById);

module.exports = router;
