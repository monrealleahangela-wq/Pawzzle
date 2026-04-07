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
// Validation rules
const createProductValidation = [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('category').notEmpty().withMessage('Category is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('shortDescription').trim().notEmpty().withMessage('Short description is required'),
  body('price').isFloat({ gt: 0 }).withMessage('Price must be greater than 0'),
  body('sku').trim().notEmpty().withMessage('SKU is required'),
  body('stockQuantity').isInt({ min: 0 }).withMessage('Stock quantity must be a positive integer'),
  body('images').isArray({ min: 1 }).withMessage('At least one product image is required'),
  body('fulfillmentType').equals('pickup_only').withMessage('Fulfillment must be pickup_only'),
  body('visibility').optional().isIn(['published', 'draft', 'hidden']).withMessage('Invalid visibility status')
];

const updateProductValidation = [
  body('name').optional().trim().notEmpty().withMessage('Product name cannot be empty'),
  body('category').optional().notEmpty().withMessage('Category cannot be empty'),
  body('description').optional().trim().notEmpty().withMessage('Description cannot be empty'),
  body('shortDescription').optional().trim().notEmpty().withMessage('Short description cannot be empty'),
  body('price').optional().isFloat({ gt: 0 }).withMessage('Price must be greater than 0'),
  body('sku').optional().trim().notEmpty().withMessage('SKU cannot be empty'),
  body('stockQuantity').optional().isInt({ min: 0 }).withMessage('Stock quantity must be a positive integer'),
  body('images').optional().isArray({ min: 1 }).withMessage('At least one product image is required'),
  body('visibility').optional().isIn(['published', 'draft', 'hidden']).withMessage('Invalid visibility status')
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
