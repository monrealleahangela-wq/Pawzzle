const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  getServiceById,
  getStoreServices,
  createService,
  updateService,
  deleteService,
  getAllServices,
  createAdminService,
  calculatePrice
} = require('../controllers/serviceController');
const { authenticate, requirePermission } = require('../middleware/auth');
const { storeAdminOnly } = require('../middleware/storeAuth');

// Validation rules
const createServiceValidation = [
  body('name').trim().notEmpty().withMessage('Service name is required'),
  body('description').trim().notEmpty().withMessage('Service description is required'),
  body('category').isIn(['grooming', 'health_wellness', 'boarding_hotel', 'pet_services', 'training', 'other']).withMessage('Invalid category'),
  body('duration').custom((value, { req }) => req.body.category === 'boarding_hotel'
    ? Number(value) === 0
    : Number.isInteger(Number(value)) && Number(value) >= 15).withMessage('Duration must be at least 15 minutes for regular services and zero for boarding'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('pricingConfiguration').optional().isObject().withMessage('Pricing configuration must be an object'),
  body('pricingConfiguration.pricePerNight').if(body('category').equals('boarding_hotel')).isFloat({ min: 0 }).withMessage('Price per night is required'),
  body('pricingConfiguration.minimumNights').optional().isInt({ min: 0 }).withMessage('Minimum stay must be zero or more nights'),
  body('pricingConfiguration.maximumNights').optional().isInt({ min: 0 }).withMessage('Maximum stay must be zero or more nights'),
  body('maxPetsPerSession').optional().isInt({ min: 1 }).withMessage('Max pets per session must be at least 1')
];

const updateServiceValidation = [
  body('name').optional().trim().notEmpty().withMessage('Service name cannot be empty'),
  body('description').optional().trim().notEmpty().withMessage('Service description cannot be empty'),
  body('category').optional().isIn(['grooming', 'health_wellness', 'boarding_hotel', 'pet_services', 'training', 'other']).withMessage('Invalid category'),
  body('duration').optional().custom((value, { req }) => req.body.category === 'boarding_hotel'
    ? Number(value) === 0
    : Number.isInteger(Number(value)) && Number(value) >= 15).withMessage('Duration must be at least 15 minutes for regular services and zero for boarding'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('pricingConfiguration').optional().isObject().withMessage('Pricing configuration must be an object'),
  body('pricingConfiguration.pricePerNight').optional().isFloat({ min: 0 }).withMessage('Price per night must be a positive number'),
  body('pricingConfiguration.minimumNights').optional().isInt({ min: 0 }).withMessage('Minimum stay must be zero or more nights'),
  body('pricingConfiguration.maximumNights').optional().isInt({ min: 0 }).withMessage('Maximum stay must be zero or more nights'),
  body('maxPetsPerSession').optional().isInt({ min: 1 }).withMessage('Max pets per session must be at least 1')
];

// Public routes
router.get('/all', getAllServices);

// Price calculator (public, no auth needed for preview)
router.post('/calculate-price', calculatePrice);

// Admin-specific routes (no store required)
router.post('/admin', authenticate, requirePermission('services.create', 'services.manage'), createServiceValidation, createAdminService);

// Store-specific routes
// Customer-safe read. Management reads use /api/admin/services and retain RBAC.
router.get('/store/:storeId', getStoreServices);
router.post('/store/:storeId', authenticate, requirePermission('services.create', 'services.manage'), storeAdminOnly, createServiceValidation, createService);
router.get('/:id', getServiceById);
router.put('/:id', authenticate, requirePermission('services.update', 'services.manage'), storeAdminOnly, updateServiceValidation, updateService);
router.delete('/:id', authenticate, requirePermission('services.delete', 'services.manage'), storeAdminOnly, deleteService);

module.exports = router;
