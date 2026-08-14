const express = require('express');
const router = express.Router();
const { authenticate, adminOnly, requirePermission } = require('../middleware/auth');
const {
    getMyStaff,
    getStaffConfiguration,
    getStaffProfile,
    getMyProfessionalProfile,
    updateMyProfessionalProfile,
    uploadCredentialDocument,
    authorizeCredentialManagement,
    updateCredentialVerification,
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
router.get('/riders/eligible', authenticate, requirePermission('logistics.manage'), getEligibleRiders);
router.get('/riders/:id', authenticate, requirePermission('logistics.manage'), getRiderDetails);

// Remaining routes require authentication and admin/super_admin role
router.use(authenticate, adminOnly);

router.get('/configuration', getStaffConfiguration);
router.get('/roles', getRolePermissions);
router.put('/roles/:role', updateRolePermissions);
router.get('/:id/profile', getStaffProfile);
router.post('/:id/credentials', authorizeCredentialManagement, uploadDoc.single('document'), handleUploadError, uploadCredentialDocument);
router.patch('/:id/credentials/:documentId/verification', updateCredentialVerification);
router.put('/:id/availability', updateStaffAvailability);
router.get('/', getMyStaff);
router.post('/riders/:id/payouts', createRiderPayout);
router.patch('/rider-payouts/:payoutId', updateRiderPayout);
router.post('/', createStaff);
router.put('/:id', updateStaff);
router.patch('/:id/toggle-status', toggleStaffStatus);
router.patch('/:id/reset-password', resetStaffPassword);
router.patch('/:id/archive', deleteStaff);
router.patch('/:id/restore', restoreStaff);
router.delete('/:id/permanent', permanentlyDeleteStaff);
router.delete('/:id', deleteStaff);

module.exports = router;
