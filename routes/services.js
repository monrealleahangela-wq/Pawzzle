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
  createAdminService
} = require('../controllers/serviceController');
const { authenticate } = require('../middleware/auth');
const { storeAdminOnly, canAccessStore } = require('../middleware/storeAuth');

// Validation rules
const createServiceValidation = [
  body('name').trim().notEmpty().withMessage('Service name is required'),
  body('description').trim().notEmpty().withMessage('Service description is required'),
  body('category').isIn(['grooming', 'health_wellness', 'boarding_hotel', 'pet_services', 'other']).withMessage('Invalid category'),
  body('duration').isInt({ min: 15 }).withMessage('Duration must be at least 15 minutes'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('homeServiceAvailable').optional().isBoolean().withMessage('Home service availability must be boolean'),
  body('homeServicePrice').optional().isFloat({ min: 0 }).withMessage('Home service price must be positive'),
  body('maxPetsPerSession').optional().isInt({ min: 1 }).withMessage('Max pets per session must be at least 1')
];

const updateServiceValidation = [
  body('name').optional().trim().notEmpty().withMessage('Service name cannot be empty'),
  body('description').optional().trim().notEmpty().withMessage('Service description cannot be empty'),
  body('category').optional().isIn(['grooming', 'health_wellness', 'boarding_hotel', 'pet_services', 'other']).withMessage('Invalid category'),
  body('duration').optional().isInt({ min: 15 }).withMessage('Duration must be at least 15 minutes'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('homeServiceAvailable').optional().isBoolean().withMessage('Home service availability must be boolean'),
  body('homeServicePrice').optional().isFloat({ min: 0 }).withMessage('Home service price must be positive'),
  body('maxPetsPerSession').optional().isInt({ min: 1 }).withMessage('Max pets per session must be at least 1')
];

// Public routes
router.get('/all', getAllServices);

// Admin-specific routes (no store required)
router.post('/admin', authenticate, createServiceValidation, createAdminService);

// Store-specific routes
router.get('/store/:storeId', canAccessStore, getStoreServices);
router.post('/store/:storeId', authenticate, storeAdminOnly, createServiceValidation, createService);
router.get('/:id', getServiceById);
router.put('/:id', authenticate, storeAdminOnly, updateServiceValidation, updateService);
router.delete('/:id', authenticate, storeAdminOnly, deleteService);

module.exports = router;
