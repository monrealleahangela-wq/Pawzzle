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
const { authenticate, adminOrStaff, requirePermission } = require('../middleware/auth');
const { MAX_CATALOG_IMAGES, PRODUCT_WEIGHT_UNITS, isCatalogImageReference } = require('../utils/catalogListing');
const { normalizeProductCategory } = require('../utils/productCategories');

// Validation rules
// Validation rules
const createProductValidation = [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('category').custom(value => Boolean(normalizeProductCategory(value))).withMessage('Invalid product category'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('shortDescription').trim().notEmpty().withMessage('Short description is required'),
  body('price').isFloat({ gt: 0 }).withMessage('Price must be greater than 0'),
  body('sku').trim().notEmpty().withMessage('SKU is required'),
  body('stockQuantity').isInt({ min: 0 }).withMessage('Stock quantity must be a positive integer'),
  body('images').isArray({ min: 1, max: MAX_CATALOG_IMAGES }).withMessage(`Provide between 1 and ${MAX_CATALOG_IMAGES} product images`),
  body('images.*').custom(isCatalogImageReference).withMessage('Each product image must be a valid uploaded image reference'),
  body('weight').optional({ checkFalsy: true }).isFloat({ gt: 0, max: 10000 }).withMessage('Package weight must be greater than zero'),
  body('weightUnit').optional().isIn(PRODUCT_WEIGHT_UNITS).withMessage('Package weight unit must be g or kg'),
  body('fulfillmentType').equals('pickup_only').withMessage('Fulfillment must be pickup_only'),
  body('visibility').optional().isIn(['published', 'draft', 'hidden']).withMessage('Invalid visibility status'),
  body('barcode').optional().trim().isLength({ max: 100 }).withMessage('Barcode is too long'),
  body('unit').optional().isIn(['piece', 'pack', 'box', 'bottle', 'bag', 'kg']).withMessage('Invalid product unit')
];

const updateProductValidation = [
  body('name').optional().trim().notEmpty().withMessage('Product name cannot be empty'),
  body('category').optional().custom(value => Boolean(normalizeProductCategory(value))).withMessage('Invalid product category'),
  body('description').optional().trim().notEmpty().withMessage('Description cannot be empty'),
  body('shortDescription').optional().trim().notEmpty().withMessage('Short description cannot be empty'),
  body('price').optional().isFloat({ gt: 0 }).withMessage('Price must be greater than 0'),
  body('sku').optional().trim().notEmpty().withMessage('SKU cannot be empty'),
  body('stockQuantity').optional().isInt({ min: 0 }).withMessage('Stock quantity must be a positive integer'),
  body('images').optional().isArray({ min: 1, max: MAX_CATALOG_IMAGES }).withMessage(`Provide between 1 and ${MAX_CATALOG_IMAGES} product images`),
  body('images.*').optional().custom(isCatalogImageReference).withMessage('Each product image must be a valid uploaded image reference'),
  body('weight').optional({ checkFalsy: true }).isFloat({ gt: 0, max: 10000 }).withMessage('Package weight must be greater than zero'),
  body('weightUnit').optional().isIn(PRODUCT_WEIGHT_UNITS).withMessage('Package weight unit must be g or kg'),
  body('visibility').optional().isIn(['published', 'draft', 'hidden']).withMessage('Invalid visibility status'),
  body('barcode').optional().trim().isLength({ max: 100 }).withMessage('Barcode is too long'),
  body('unit').optional().isIn(['piece', 'pack', 'box', 'bottle', 'bag', 'kg']).withMessage('Invalid product unit')
];

const updateStockValidation = [
  body('stockQuantity').isInt({ min: 0 }).withMessage('Stock quantity must be a positive integer')
];

// Public routes
router.get('/', getAllProducts);
router.get('/:id', getProductById);

// Protected routes (Admin/Staff)
router.post('/', authenticate, adminOrStaff, requirePermission('products.manage', 'inventory.adjust'), createProductValidation, createProduct);
router.put('/:id', authenticate, adminOrStaff, requirePermission('products.manage', 'inventory.adjust'), updateProductValidation, updateProduct);
router.delete('/:id', authenticate, adminOrStaff, requirePermission('products.manage', 'inventory.adjust'), deleteProduct);
router.patch('/:id/stock', authenticate, adminOrStaff, requirePermission('inventory.adjust'), updateStockValidation, updateStock);

module.exports = router;
