const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserCredentials,
  getAdminSettings,
  updateAdminSettings,
  toggleUserStatus,
  getActivityLogs
} = require('../controllers/userController');
const { authenticate, adminOnly, superAdminOnly, platformAdminOnly } = require('../middleware/auth');
const { isPlatformAdmin } = require('../config/permissions');

// Validation rules
const updateUserValidation = [
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('phone').optional({ checkFalsy: true }).trim().isString().withMessage('Please provide a valid phone number'),
  body('role').optional().isIn(['super_admin', 'platform_admin', 'admin', 'store_owner', 'customer']).withMessage('Invalid role'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
];

// Protected routes
router.get('/activity-logs', authenticate, platformAdminOnly, getActivityLogs);
router.get('/', authenticate, platformAdminOnly, getAllUsers);
router.get('/:id', authenticate, (req, res, next) => {
  if (isPlatformAdmin(req.user) || String(req.user._id) === String(req.params.id)) return next();
  return res.status(403).json({ message: 'Access denied.' });
}, getUserById);
router.get('/:id/credentials', authenticate, superAdminOnly, getUserCredentials);
router.put('/:id', authenticate, updateUserValidation, updateUser);

// Admin settings routes - accessible by both admin and super_admin
router.get('/admin/settings', authenticate, adminOnly, getAdminSettings);
router.put('/admin/settings', authenticate, adminOnly, updateAdminSettings);

// General user routes
router.delete('/me', authenticate, (req, res) => {
  // We'll implement deleteMyAccount in userController
  const { deleteMyAccount } = require('../controllers/userController');
  deleteMyAccount(req, res);
});

// Super Admin only routes
router.delete('/:id', authenticate, superAdminOnly, deleteUser);
router.patch('/:id/toggle-status', authenticate, superAdminOnly, toggleUserStatus);

module.exports = router;
