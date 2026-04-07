const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  getAllStores,
  getStoreById,
  getStoreDetails,
  getMyStore,
  createStore,
  updateStore,
  getStoreDashboard,
  toggleStoreStatus,
  featureStore,
  getStoreByOwner,
  getStoreLocations,
  submitVerification,
  approveVerification,
  rejectVerification
} = require('../controllers/storeController');
const { authenticate, superAdminOnly, authorize, adminOnly, adminOrStaff } = require('../middleware/auth');

// Validation rules
const createStoreValidation = [
  body('name').trim().notEmpty().withMessage('Store name is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('businessType').isIn(['pet_store', 'breeder', 'shelter', 'veterinary', 'grooming', 'training', 'other']).withMessage('Invalid business type'),
  body('contactInfo.phone').trim().notEmpty().withMessage('Phone number is required'),
  body('contactInfo.email').isEmail().withMessage('Valid email is required'),
  body('contactInfo.address.street').trim().notEmpty().withMessage('Street address is required'),
  body('contactInfo.address.barangay').trim().notEmpty().withMessage('Barangay is required'),
  body('contactInfo.address.city').trim().notEmpty().withMessage('City is required'),
  body('contactInfo.address.state').trim().notEmpty().withMessage('State is required'),
  body('contactInfo.address.zipCode').trim().notEmpty().withMessage('ZIP code is required'),
  body('contactInfo.address.country').trim().notEmpty().withMessage('Country is required')
];

const updateStoreValidation = [
  body('name').optional().trim().notEmpty().withMessage('Store name cannot be empty'),
  body('description').optional().trim().notEmpty().withMessage('Description cannot be empty'),
  body('businessType').optional().isIn(['pet_store', 'breeder', 'shelter', 'veterinary', 'grooming', 'training', 'other']).withMessage('Invalid business type'),
  body('contactInfo.phone').optional().trim().notEmpty().withMessage('Phone number cannot be empty'),
  body('contactInfo.email').optional().isEmail().withMessage('Valid email is required'),
  body('contactInfo.address.street').optional().trim().notEmpty().withMessage('Street address cannot be empty'),
  body('contactInfo.address.barangay').optional().trim().notEmpty().withMessage('Barangay cannot be empty'),
  body('contactInfo.address.city').optional().trim().notEmpty().withMessage('City cannot be empty'),
  body('contactInfo.address.state').optional().trim().notEmpty().withMessage('State cannot be empty'),
  body('contactInfo.address.zipCode').optional().trim().notEmpty().withMessage('ZIP code cannot be empty'),
  body('contactInfo.address.country').optional().trim().notEmpty().withMessage('Country cannot be empty')
];

// Protected routes (literal paths MUST come before /:id wildcard)
router.get('/my-store', authenticate, adminOrStaff, getMyStore);
router.put('/my-store', authenticate, adminOnly, updateStoreValidation, updateStore);
router.get('/settings', authenticate, adminOrStaff, getMyStore);
router.put('/settings', authenticate, adminOnly, updateStoreValidation, updateStore);
router.get('/dashboard/stats', authenticate, adminOrStaff, getStoreDashboard);
router.post('/', authenticate, adminOnly, createStoreValidation, createStore);

// Public routes with parameter (must come AFTER literal paths)
router.get('/', getAllStores);
router.get('/locations', getStoreLocations);
router.get('/owner/:ownerId', getStoreByOwner);
router.get('/:id', getStoreById);
router.get('/:id/details', getStoreDetails);

// Seller Verification & Payout Management
router.post('/my-store/verify', authenticate, adminOnly, submitVerification);
router.post('/:id/approve-verification', authenticate, superAdminOnly, approveVerification);
router.post('/:id/reject-verification', authenticate, superAdminOnly, rejectVerification);

// Super Admin only routes
router.patch('/:id/toggle-status', authenticate, superAdminOnly, toggleStoreStatus);
router.patch('/:id/feature', authenticate, superAdminOnly, featureStore);

module.exports = router;
