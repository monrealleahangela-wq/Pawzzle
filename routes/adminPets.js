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
const { authenticate, adminOrStaff } = require('../middleware/auth');

// Validation rules (same as regular pets)
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
  body('fulfillmentType').optional().isIn(['pickup_only', 'shipping', 'both']).withMessage('Invalid fulfillment type'),
  body('paymentType').optional().isIn(['online_only', 'cod', 'any']).withMessage('Invalid payment type')
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
  body('healthCondition').optional().isIn(['healthy', 'needs_monitoring', 'condition_present']).withMessage('Invalid health condition')
];

// Debug endpoint to check all pets and their owners
router.get('/debug/all', authenticate, adminOrStaff, async (req, res) => {
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
router.get('/', authenticate, adminOrStaff, getAllAdminPets);
router.get('/:id', authenticate, adminOrStaff, getPetById);
router.post('/', authenticate, adminOrStaff, createPetValidation, createPet);
router.put('/:id', authenticate, adminOrStaff, updatePetValidation, updatePet);
router.delete('/:id', authenticate, adminOrStaff, deletePet);

// Listing Moderation
router.post('/:id/approve', authenticate, adminOrStaff, approvePet);
router.post('/:id/reject', authenticate, adminOrStaff, rejectPet);

module.exports = router;
