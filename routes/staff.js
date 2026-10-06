const express = require('express');
const router = express.Router();
const { authenticate, adminOrStaff, superAdminOnly, requirePermission } = require('../middleware/auth');
const {
    getMyStaff,
    getStaffConfiguration,
    getStaffProfile,
    getMyProfessionalProfile,
    updateMyProfessionalProfile,
    authorizeOwnCredentialManagement,
    uploadCredentialDocument,
    authorizeCredentialManagement,
    updateCredentialVerification,
    getProfessionalVerificationQueue,
    updateProfessionalVerificationStatus,
    updateStaffAvailability,
    createStaff,
    updateStaff,
    toggleStaffStatus,
    deleteStaff,
    restoreStaff,
    permanentlyDeleteStaff,
    resetStaffPassword,
    getEligibleRiders,
    getRiderDetails,
    getMyRiderDetails,
    createRiderPayout,
    updateRiderPayout
} = require('../controllers/staffController');
const { uploadDoc, handleUploadError } = require('../middleware/upload');
const { getRolePermissions, updateRolePermissions } = require('../controllers/rolePermissionController');

router.get('/me/rider-summary', authenticate, getMyRiderDetails);
router.get('/me/professional-profile', authenticate, getMyProfessionalProfile);
router.patch('/me/professional-profile', authenticate, updateMyProfessionalProfile);
router.post('/me/credentials', authenticate, authorizeOwnCredentialManagement, uploadDoc.single('document'), handleUploadError, uploadCredentialDocument);
router.get('/riders/eligible', authenticate, requirePermission('logistics.manage'), getEligibleRiders);
router.get('/riders/:id', authenticate, requirePermission('logistics.manage'), getRiderDetails);
router.get('/platform/verifications', authenticate, superAdminOnly, getProfessionalVerificationQueue);
router.patch('/platform/verifications/:id', authenticate, superAdminOnly, updateProfessionalVerificationStatus);
router.patch('/:id/credentials/:documentId/verification', authenticate, superAdminOnly, updateCredentialVerification);

// Store-scoped staff directory reads support Manager's authoritative
// staff.view permission. Every mutation remains staff.manage only.
router.get('/configuration', authenticate, adminOrStaff, requirePermission('staff.view', 'staff.manage'), getStaffConfiguration);
router.get('/roles', authenticate, adminOrStaff, requirePermission('staff.manage'), getRolePermissions);
router.put('/roles/:role', authenticate, adminOrStaff, requirePermission('staff.manage'), updateRolePermissions);
router.get('/:id/profile', authenticate, adminOrStaff, requirePermission('staff.view', 'staff.manage'), getStaffProfile);
router.post('/:id/credentials', authenticate, adminOrStaff, requirePermission('staff.manage'), authorizeCredentialManagement, uploadDoc.single('document'), handleUploadError, uploadCredentialDocument);
router.put('/:id/availability', authenticate, adminOrStaff, requirePermission('staff.manage'), updateStaffAvailability);
router.get('/', authenticate, adminOrStaff, requirePermission('staff.view', 'staff.manage'), getMyStaff);
router.post('/riders/:id/payouts', authenticate, adminOrStaff, requirePermission('staff.manage'), createRiderPayout);
router.patch('/rider-payouts/:payoutId', authenticate, adminOrStaff, requirePermission('staff.manage'), updateRiderPayout);
router.post('/', authenticate, adminOrStaff, requirePermission('staff.manage'), createStaff);
router.put('/:id', authenticate, adminOrStaff, requirePermission('staff.manage'), updateStaff);
router.patch('/:id/toggle-status', authenticate, adminOrStaff, requirePermission('staff.manage'), toggleStaffStatus);
router.patch('/:id/reset-password', authenticate, adminOrStaff, requirePermission('staff.manage'), resetStaffPassword);
router.patch('/:id/archive', authenticate, adminOrStaff, requirePermission('staff.manage'), deleteStaff);
router.patch('/:id/restore', authenticate, adminOrStaff, requirePermission('staff.manage'), restoreStaff);
router.delete('/:id/permanent', authenticate, adminOrStaff, requirePermission('staff.manage'), permanentlyDeleteStaff);
router.delete('/:id', authenticate, adminOrStaff, requirePermission('staff.manage'), deleteStaff);

module.exports = router;
