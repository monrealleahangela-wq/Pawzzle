const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  updateStock
} = require('../controllers/productController');
const { authenticate, adminOrStaff } = require('../middleware/auth');

// Validation rules
const createProductValidation = [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('category').isIn(['food', 'toys', 'toy', 'accessories', 'accessory', 'grooming', 'health', 'housing', 'training', 'other']).withMessage('Invalid category'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('weight').optional().isFloat({ min: 0 }).withMessage('Weight must be a positive number'),
  body('weightUnit').optional().isIn(['kg', 'g', 'lbs', 'oz']).withMessage('Invalid weight unit'),
  body('suitableFor').optional().isArray().withMessage('Suitable for must be an array'),
  body('suitableFor.*').optional().isIn(['dog', 'cat', 'bird', 'fish', 'rabbit', 'hamster', 'reptile', 'all']).withMessage('Invalid suitable for value'),
  body('brand').optional().trim().notEmpty().withMessage('Brand cannot be empty if provided')
];

const updateProductValidation = [
  body('name').optional().trim().notEmpty().withMessage('Product name cannot be empty'),
  body('category').optional().isIn(['food', 'toys', 'toy', 'accessories', 'accessory', 'grooming', 'health', 'housing', 'training', 'other']).withMessage('Invalid category'),
  body('description').optional().trim().notEmpty().withMessage('Description cannot be empty'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('stockQuantity').optional().isInt({ min: 0 }).withMessage('Stock quantity must be a positive integer'),
  body('weight').optional().isFloat({ min: 0 }).withMessage('Weight must be a positive number'),
  body('weightUnit').optional().isIn(['kg', 'g', 'lbs', 'oz']).withMessage('Invalid weight unit'),
  body('suitableFor').optional().isArray().withMessage('Suitable for must be an array'),
  body('suitableFor.*').optional().isIn(['dog', 'cat', 'bird', 'fish', 'rabbit', 'hamster', 'reptile', 'all']).withMessage('Invalid suitable for value')
];

const updateStockValidation = [
  body('stockQuantity').isInt({ min: 0 }).withMessage('Stock quantity must be a positive integer')
];

// Public routes
router.get('/', getAllProducts);
router.get('/:id', getProductById);

// Protected routes (Admin/Staff)
router.post('/', authenticate, adminOrStaff, createProductValidation, createProduct);
router.put('/:id', authenticate, adminOrStaff, updateProductValidation, updateProduct);
router.delete('/:id', authenticate, adminOrStaff, deleteProduct);
router.patch('/:id/stock', authenticate, adminOrStaff, updateStockValidation, updateStock);

module.exports = router;
