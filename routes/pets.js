const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  getAllPets,
  getPetById,
  createPet,
  updatePet,
  deletePet
} = require('../controllers/petController');
const { authenticate, adminOrStaff, requirePermission } = require('../middleware/auth');

const listingDocumentValidation = [
  body('pcciRegistration.status').optional().isIn(['yes', 'no', 'not_sure']).withMessage('Invalid PCCI registration status'),
  body('pcciRegistration.registrationNumber').optional({ checkFalsy: true }).isLength({ max: 100 }).withMessage('PCCI registration number is too long'),
  body('pcciRegistration.certificateUrl').optional({ checkFalsy: true }).isURL().withMessage('PCCI certificate must be a valid URL'),
  body('supportingDocuments.*.url').optional({ checkFalsy: true }).isURL().withMessage('Supporting document must be a valid URL'),
  body('supportingDocuments.*.name').optional({ checkFalsy: true }).isLength({ max: 200 }).withMessage('Supporting document name is too long'),
  body('healthNotes').optional({ checkFalsy: true }).isLength({ max: 2000 }).withMessage('Health notes are too long'),
  body('availabilityNotes').optional({ checkFalsy: true }).isLength({ max: 1000 }).withMessage('Availability notes are too long')
];

// Validation rules
const createPetValidation = [
  body('name').trim().notEmpty().withMessage('Pet name is required'),
  body('species').isIn(['dog', 'cat', 'bird', 'fish', 'rabbit', 'hamster', 'reptile', 'other']).withMessage('Invalid species'),
  body('breed').trim().notEmpty().withMessage('Breed is required'),
  body('age').isInt({ min: 0 }).withMessage('Age must be a positive number'),
  body('ageUnit').optional().isIn(['months', 'years']).withMessage('Invalid age unit'),
  body('gender').isIn(['male', 'female']).withMessage('Gender must be male or female'),
  body('size').isIn(['small', 'medium', 'large', 'extra_large']).withMessage('Invalid size'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('vaccinationStatus').optional().isIn(['complete', 'partial', 'none']).withMessage('Invalid vaccination status'),
  body('healthStatus').optional().isIn(['excellent', 'good', 'fair', 'needs_attention']).withMessage('Invalid health status'),
  body('healthCondition').optional().isIn(['healthy', 'needs_monitoring', 'condition_present']).withMessage('Invalid health condition'),
  body('listingType').optional().isIn(['sale', 'adoption']).withMessage('Invalid listing type'),
  body('status').optional().isIn(['available', 'reserved', 'sold', 'adopted', 'unavailable']).withMessage('Invalid pet availability status'),
  body('quantity').optional().equals('1').withMessage('Each pet listing must represent exactly one pet'),
  body('fulfillmentType').optional().isIn(['pickup_only', 'shipping', 'both']).withMessage('Invalid fulfillment type'),
  body('paymentType').optional().equals('online_only').withMessage('PayMongo online payment is required'),
  ...listingDocumentValidation
];

const updatePetValidation = [
  body('name').optional().trim().notEmpty().withMessage('Pet name cannot be empty'),
  body('species').optional().isIn(['dog', 'cat', 'bird', 'fish', 'rabbit', 'hamster', 'reptile', 'other']).withMessage('Invalid species'),
  body('breed').optional().trim().notEmpty().withMessage('Breed cannot be empty'),
  body('age').optional().isInt({ min: 0 }).withMessage('Age must be a positive number'),
  body('ageUnit').optional().isIn(['months', 'years']).withMessage('Invalid age unit'),
  body('gender').optional().isIn(['male', 'female']).withMessage('Gender must be male or female'),
  body('size').optional().isIn(['small', 'medium', 'large', 'extra_large']).withMessage('Invalid size'),
  body('description').optional().trim().notEmpty().withMessage('Description cannot be empty'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('vaccinationStatus').optional().isIn(['complete', 'partial', 'none']).withMessage('Invalid vaccination status'),
  body('healthStatus').optional().isIn(['excellent', 'good', 'fair', 'needs_attention']).withMessage('Invalid health status'),
  body('healthCondition').optional().isIn(['healthy', 'needs_monitoring', 'condition_present']).withMessage('Invalid health condition'),
  body('status').optional().isIn(['available', 'reserved', 'sold', 'adopted', 'unavailable']).withMessage('Invalid pet availability status'),
  ...listingDocumentValidation
];

// Public routes (exclude admin routes)
router.get('/', (req, res, next) => {
  // Skip this route if it's an admin route (check full original URL)
  if (req.originalUrl && req.originalUrl.includes('/admin')) {
    console.log('🚫 Skipping regular pets route for admin URL:', req.originalUrl);
    return next('route'); // Skip to next route
  }
  next();
}, getAllPets);
router.get('/:id', getPetById);

// Protected routes (Admin/Staff)
router.post('/', authenticate, adminOrStaff, requirePermission('pets.manage', 'inventory.adjust'), createPetValidation, createPet);
router.put('/:id', authenticate, adminOrStaff, requirePermission('pets.manage', 'inventory.adjust'), updatePetValidation, updatePet);
router.delete('/:id', authenticate, adminOrStaff, requirePermission('pets.manage', 'inventory.adjust'), deletePet);

module.exports = router;
