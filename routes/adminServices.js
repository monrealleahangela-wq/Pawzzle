const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  getAllAdminServices
} = require('../controllers/adminServiceController');

const {
  getServiceById,
  createAdminService,
  updateService,
  deleteService
} = require('../controllers/serviceController');
const { authenticate, adminOrStaff } = require('../middleware/auth');

// Validation rules (same as regular services)
const createServiceValidation = [
  body('name').trim().notEmpty().withMessage('Service name is required'),
  body('category').isIn(['grooming', 'health_wellness', 'boarding_hotel', 'pet_services', 'training', 'home_services', 'other']).withMessage('Invalid category'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('duration').isInt({ min: 15 }).withMessage('Duration must be at least 15 minutes'),
  body('maxPetsPerSession').isInt({ min: 1 }).withMessage('Max pets per session must be at least 1')
];

const updateServiceValidation = [
  body('name').optional().trim().notEmpty().withMessage('Service name cannot be empty'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('description').optional().trim().notEmpty().withMessage('Description cannot be empty'),
  body('category').optional().isIn(['grooming', 'health_wellness', 'boarding_hotel', 'pet_services', 'training', 'home_services', 'other']).withMessage('Invalid category'),
  body('duration').optional().isInt({ min: 15 }).withMessage('Duration must be at least 15 minutes'),
  body('maxPetsPerSession').optional().isInt({ min: 1 }).withMessage('Max pets per session must be at least 1')
];

// Admin routes (filtered by user's store)
router.get('/', authenticate, adminOrStaff, getAllAdminServices);
router.get('/:id', authenticate, adminOrStaff, getServiceById);
router.post('/', authenticate, adminOrStaff, createServiceValidation, createAdminService);
router.put('/:id', authenticate, adminOrStaff, updateServiceValidation, updateService);
router.delete('/:id', authenticate, adminOrStaff, deleteService);

module.exports = router;
