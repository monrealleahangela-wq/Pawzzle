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
const { authenticate, adminOrStaff } = require('../middleware/auth');

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
  body('vaccinationStatus').optional().isIn(['not_vaccinated', 'partially_vaccinated', 'fully_vaccinated']).withMessage('Invalid vaccination status'),
  body('healthStatus').optional().isIn(['excellent', 'good', 'fair', 'needs_attention']).withMessage('Invalid health status')
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
  body('vaccinationStatus').optional().isIn(['not_vaccinated', 'partially_vaccinated', 'fully_vaccinated']).withMessage('Invalid vaccination status'),
  body('healthStatus').optional().isIn(['excellent', 'good', 'fair', 'needs_attention']).withMessage('Invalid health status')
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
router.post('/', authenticate, adminOrStaff, createPetValidation, createPet);
router.put('/:id', authenticate, adminOrStaff, updatePetValidation, updatePet);
router.delete('/:id', authenticate, adminOrStaff, deletePet);

module.exports = router;
