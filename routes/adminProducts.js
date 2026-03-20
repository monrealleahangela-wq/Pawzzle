const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct
} = require('../controllers/productController');
const { authenticate, adminOrStaff } = require('../middleware/auth');

// Enhanced Validation rules for detailed product management
const createProductValidation = [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('category').isIn(['food', 'toys', 'toy', 'accessories', 'accessory', 'grooming', 'training', 'health', 'housing', 'other']).withMessage('Invalid category'),

  // Optional detailed fields
  body('brand').optional().trim(),
  body('weight').optional().isFloat({ min: 0 }),
  body('weightUnit').optional().isIn(['kg', 'g', 'lbs', 'oz']),
  body('suitableFor').optional().isArray(),
  body('material').optional().trim(),
  body('colors').optional().isArray(),
  body('tags').optional().isArray(),
  body('isFeatured').optional().isBoolean(),

  // Nested objects validation
  body('ageRange.min').optional().isNumeric(),
  body('ageRange.max').optional().isNumeric(),
  body('ageRange.unit').optional().isIn(['months', 'years']),

  body('dimensions.length').optional().isNumeric(),
  body('dimensions.width').optional().isNumeric(),
  body('dimensions.height').optional().isNumeric(),
  body('dimensions.unit').optional().isIn(['cm', 'in', 'm'])
];

const updateProductValidation = [
  body('name').optional().trim().notEmpty().withMessage('Product name cannot be empty'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('description').optional().trim().notEmpty().withMessage('Description cannot be empty'),
  body('category').optional().isIn(['food', 'toys', 'toy', 'accessories', 'accessory', 'grooming', 'training', 'health', 'housing', 'other']).withMessage('Invalid category'),

  body('brand').optional().trim(),
  body('weight').optional().isFloat({ min: 0 }),
  body('weightUnit').optional().isIn(['kg', 'g', 'lbs', 'oz']),
  body('suitableFor').optional().isArray(),
  body('material').optional().trim(),
  body('colors').optional().isArray(),
  body('tags').optional().isArray(),
  body('isFeatured').optional().isBoolean(),

  body('ageRange.min').optional().isNumeric(),
  body('ageRange.max').optional().isNumeric(),
  body('ageRange.unit').optional().isIn(['months', 'years']),

  body('dimensions.length').optional().isNumeric(),
  body('dimensions.width').optional().isNumeric(),
  body('dimensions.height').optional().isNumeric(),
  body('dimensions.unit').optional().isIn(['cm', 'in', 'm'])
];

// Admin routes (filtered by user's store)
router.get('/', authenticate, adminOrStaff, getAllProducts);
router.get('/:id', authenticate, adminOrStaff, getProductById);
router.post('/', authenticate, adminOrStaff, createProductValidation, createProduct);
router.put('/:id', authenticate, adminOrStaff, updateProductValidation, updateProduct);
router.delete('/:id', authenticate, adminOrStaff, deleteProduct);

module.exports = router;
