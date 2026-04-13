const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  submitApplication,
  getAllApplications,
  getApplicationById,
  reviewApplication,
  getUserApplication,
  requestMoreInfo,
  archiveApplication,
  restoreApplication,
  getAuditCount,
  upload
} = require('../controllers/storeApplicationController');
const { authenticate, superAdminOnly } = require('../middleware/auth');

// Public audit link (Temporal)
router.get('/audit-count', getAuditCount);

// Validation rules
const applicationValidation = [
  body('businessName').trim().notEmpty().withMessage('Business name is required'),
  body('businessType').isIn(['pet_store', 'breeder', 'shelter', 'veterinary', 'grooming', 'training', 'other']).withMessage('Invalid business type'),
  body('businessLicense.number').trim().notEmpty().withMessage('License number is required'),
  body('businessLicense.issuingAuthority').trim().notEmpty().withMessage('Issuing authority is required'),
  body('businessLicense.issueDate').isISO8601().withMessage('Invalid issue date'),
  body('businessLicense.expiryDate').isISO8601().withMessage('Invalid expiry date'),
  body('taxId').trim().notEmpty().withMessage('Tax ID is required'),
  body('contactInfo.phone').trim().notEmpty().withMessage('Phone number is required'),
  body('contactInfo.email').isEmail().withMessage('Valid email is required'),
  body('contactInfo.address.street').trim().notEmpty().withMessage('Street address is required'),
  body('contactInfo.address.city').trim().notEmpty().withMessage('City is required'),
  body('contactInfo.address.state').trim().notEmpty().withMessage('State is required'),
  body('contactInfo.address.zipCode').trim().notEmpty().withMessage('ZIP code is required'),
  body('contactInfo.address.country').trim().notEmpty().withMessage('Country is required'),
  body('businessDescription').trim().notEmpty().withMessage('Business description is required'),
  body('references').isArray({ min: 2 }).withMessage('At least 2 references are required'),
  body('references.*.name').trim().notEmpty().withMessage('Reference name is required'),
  body('references.*.business').trim().notEmpty().withMessage('Reference business is required'),
  body('references.*.phone').trim().notEmpty().withMessage('Reference phone is required'),
  body('references.*.email').isEmail().withMessage('Valid reference email is required'),
  body('insurance.provider').trim().notEmpty().withMessage('Insurance provider is required'),
  body('insurance.policyNumber').trim().notEmpty().withMessage('Policy number is required'),
  body('insurance.coverageAmount').isNumeric().withMessage('Coverage amount must be numeric'),
  body('insurance.expiryDate').isISO8601().withMessage('Invalid insurance expiry date'),
  body('certifications').isArray().withMessage('Certifications must be an array'),
  body('certifications.*.name').trim().notEmpty().withMessage('Certification name is required'),
  body('certifications.*.issuingOrganization').trim().notEmpty().withMessage('Issuing organization is required'),
  body('certifications.*.issueDate').isISO8601().withMessage('Invalid certification issue date')
];

const reviewValidation = [
  body('status').isIn(['approved', 'rejected', 'requires_more_info']).withMessage('Invalid status'),
  body('reviewNotes').optional().trim(),
  body('rejectionReason').optional().trim()
];

// Protected routes
router.post('/', authenticate, upload.fields([
  { name: 'licenseDocument', maxCount: 1 },
  { name: 'insuranceDocument', maxCount: 1 },
  { name: 'certificationDocuments', maxCount: 10 },
  { name: 'governmentId', maxCount: 1 },
  { name: 'businessRegistration', maxCount: 1 },
  { name: 'birRegistration', maxCount: 1 },
  { name: 'barangayClearance', maxCount: 1 },
  { name: 'storeLogo', maxCount: 1 },
  { name: 'mayorsPermit', maxCount: 1 }
]), submitApplication);

// Test endpoint to verify form structure
router.post('/test', authenticate, (req, res) => {
  console.log('=== TEST ENDPOINT ===');
  console.log('Request body:', req.body);
  console.log('Request files:', req.files);
  console.log('Headers:', req.headers);
  console.log('Content-Type:', req.get('Content-Type'));
  res.json({ message: 'Test endpoint working', received: true });
});

router.get('/my-application', authenticate, getUserApplication);

// Super Admin only routes
router.get('/', authenticate, superAdminOnly, getAllApplications);
router.get('/:id', authenticate, superAdminOnly, getApplicationById);
router.put('/:id/review', authenticate, superAdminOnly, reviewValidation, reviewApplication);
router.put('/:id/request-info', authenticate, superAdminOnly, requestMoreInfo);
router.delete('/:id', authenticate, superAdminOnly, archiveApplication);
router.patch('/:id/restore', authenticate, superAdminOnly, restoreApplication);

module.exports = router;
