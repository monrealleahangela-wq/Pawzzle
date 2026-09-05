const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  getAllAdminPets,
  approvePet,
  rejectPet
} = require('../controllers/adminPetController');

const {
  getPetById,
  createPet,
  updatePet,
  deletePet
} = require('../controllers/petController');
const { authenticate, adminOrStaff, platformAdminOnly, requirePermission } = require('../middleware/auth');

const listingDocumentValidation = [
  body('pcciRegistration.status').optional().isIn(['yes', 'no', 'not_sure']).withMessage('Invalid PCCI registration status'),
  body('pcciRegistration.registrationNumber').optional({ checkFalsy: true }).isLength({ max: 100 }).withMessage('PCCI registration number is too long'),
  body('pcciRegistration.certificateUrl').optional({ checkFalsy: true }).isURL().withMessage('PCCI certificate must be a valid URL'),
  body('supportingDocuments.*.url').optional({ checkFalsy: true }).isURL().withMessage('Supporting document must be a valid URL'),
  body('supportingDocuments.*.name').optional({ checkFalsy: true }).isLength({ max: 200 }).withMessage('Supporting document name is too long'),
  body('healthNotes').optional({ checkFalsy: true }).isLength({ max: 2000 }).withMessage('Health notes are too long'),
  body('availabilityNotes').optional({ checkFalsy: true }).isLength({ max: 1000 }).withMessage('Availability notes are too long')
];

// Validation rules (same as regular pets)
const createPetValidation = [
  body('name').trim().notEmpty().withMessage('Pet name is required'),
  body('images').isArray({ min: 1 }).withMessage('Pet photo is required'),
  body('species').isIn(['dog', 'cat', 'bird', 'fish', 'rabbit', 'hamster', 'reptile', 'other']).withMessage('Invalid species'),
  body('breed').trim().notEmpty().withMessage('Breed is required'),
  body('age').optional().isInt({ min: 0 }).withMessage('Age must be zero or greater'),
  body('ageUnit').optional().isIn(['months', 'years']).withMessage('Invalid age unit'),
  body('gender').isIn(['male', 'female']).withMessage('Gender must be male or female'),
  body('size').isIn(['small', 'medium', 'large', 'extra_large']).withMessage('Invalid size'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('price').isFloat({ gt: 0 }).withMessage('Selling price must be greater than zero'),
  body('vaccinationStatus').optional().isIn(['complete', 'partial', 'none']).withMessage('Invalid vaccination status'),
  body('healthStatus').optional().isIn(['excellent', 'good', 'fair', 'needs_attention']).withMessage('Invalid health status'),
  body('healthCondition').optional().isIn(['healthy', 'needs_monitoring', 'condition_present']).withMessage('Invalid health condition'),
  body('listingType').optional().equals('sale').withMessage('Seller pet listings must be for sale'),
  body('status').optional().isIn(['available', 'unavailable']).withMessage('New pet listings must be available or unavailable'),
  body('quantity').optional().equals('1').withMessage('Each pet listing must represent exactly one pet'),
  body('fulfillmentType').optional().isIn(['pickup_only', 'shipping', 'both']).withMessage('Invalid fulfillment type'),
  body('paymentType').optional().equals('online_only').withMessage('PayMongo online payment is required'),
  body('birthday').isISO8601().toDate().withMessage('Valid birth date is required')
    .custom((value) => {
      const today = new Date();
      if (value > today) {
        throw new Error('Birth date cannot be in the future.');
      }
      return true;
    }),
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
  body('listingType').optional().isIn(['sale', 'adoption']).withMessage('Invalid listing type'),
  body('status').optional().isIn(['available', 'reserved', 'sold', 'adopted', 'unavailable']).withMessage('Invalid pet availability status'),
  ...listingDocumentValidation
];

// Debug endpoint to check all pets and their owners
router.get('/debug/all', authenticate, platformAdminOnly, async (req, res) => {
  try {
    const Pet = require('../models/Pet');
    const allPets = await Pet.find({})
      .populate('addedBy', 'username email firstName lastName')
      .select('name addedBy');

    console.log('🔍 DEBUG - All pets in database:');
    allPets.forEach((pet, index) => {
      console.log(`${index + 1}. Pet: ${pet.name}, Owner: ${pet.addedBy?.username || pet.addedBy?.email || 'Unknown'} (${pet.addedBy})`);
    });

    res.json({
      message: 'Debug info - check server console',
      totalPets: allPets.length,
      pets: allPets
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin routes (filtered by user's store)
router.get('/', authenticate, adminOrStaff, requirePermission('pets.view', 'pets.manage', 'inventory.view'), getAllAdminPets);
router.get('/:id', authenticate, adminOrStaff, requirePermission('pets.view', 'pets.manage', 'inventory.view'), getPetById);
router.post('/', authenticate, adminOrStaff, requirePermission('pets.manage', 'inventory.adjust'), createPetValidation, createPet);
router.put('/:id', authenticate, adminOrStaff, requirePermission('pets.manage', 'inventory.adjust'), updatePetValidation, updatePet);
router.delete('/:id', authenticate, adminOrStaff, requirePermission('pets.manage', 'inventory.adjust'), deletePet);

// Listing Moderation
router.post('/:id/approve', authenticate, adminOrStaff, requirePermission('pets.manage', 'inventory.adjust'), approvePet);
router.post('/:id/reject', authenticate, adminOrStaff, requirePermission('pets.manage', 'inventory.adjust'), rejectPet);

module.exports = router;
