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
const { authenticate, adminOrStaff, requirePermission } = require('../middleware/auth');
const { MAX_CATALOG_IMAGES, PRODUCT_WEIGHT_UNITS, isCatalogImageReference } = require('../utils/catalogListing');
const { normalizeProductCategory } = require('../utils/productCategories');

// Enhanced Validation rules for detailed product management
const createProductValidation = [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('category').custom(value => Boolean(normalizeProductCategory(value))).withMessage('Invalid product category'),

  // Optional detailed fields
  body('brand').optional().trim(),
  body('barcode').optional().trim().isLength({ max: 100 }).withMessage('Barcode is too long'),
  body('unit').optional().isIn(['piece', 'pack', 'box', 'bottle', 'bag', 'kg']).withMessage('Invalid product unit'),
  body('weight').optional({ checkFalsy: true }).isFloat({ gt: 0, max: 10000 }).withMessage('Package weight must be greater than zero'),
  body('weightUnit').optional().isIn(PRODUCT_WEIGHT_UNITS).withMessage('Package weight unit must be g or kg'),
  body('images').isArray({ min: 1, max: MAX_CATALOG_IMAGES }).withMessage(`Provide between 1 and ${MAX_CATALOG_IMAGES} product images`),
  body('images.*').custom(isCatalogImageReference).withMessage('Each product image must be a valid uploaded image reference'),
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
  body('category').optional().custom(value => Boolean(normalizeProductCategory(value))).withMessage('Invalid product category'),

  body('brand').optional().trim(),
  body('barcode').optional().trim().isLength({ max: 100 }).withMessage('Barcode is too long'),
  body('unit').optional().isIn(['piece', 'pack', 'box', 'bottle', 'bag', 'kg']).withMessage('Invalid product unit'),
  body('weight').optional({ checkFalsy: true }).isFloat({ gt: 0, max: 10000 }).withMessage('Package weight must be greater than zero'),
  body('weightUnit').optional().isIn(PRODUCT_WEIGHT_UNITS).withMessage('Package weight unit must be g or kg'),
  body('images').optional().isArray({ min: 1, max: MAX_CATALOG_IMAGES }).withMessage(`Provide between 1 and ${MAX_CATALOG_IMAGES} product images`),
  body('images.*').optional().custom(isCatalogImageReference).withMessage('Each product image must be a valid uploaded image reference'),
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
router.get('/', authenticate, adminOrStaff, requirePermission('products.view', 'inventory.view'), getAllProducts);
router.get('/:id', authenticate, adminOrStaff, requirePermission('products.view', 'inventory.view'), getProductById);
router.post('/', authenticate, adminOrStaff, requirePermission('products.manage', 'inventory.adjust'), createProductValidation, createProduct);
router.put('/:id', authenticate, adminOrStaff, requirePermission('products.manage', 'inventory.adjust'), updateProductValidation, updateProduct);
router.delete('/:id', authenticate, adminOrStaff, requirePermission('products.manage', 'inventory.adjust'), deleteProduct);

module.exports = router;
