const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const jwt = require('jsonwebtoken');
const passport = require('../config/passport');
const User = require('../models/User');
const { attachStoreRolePolicy, serializeEffectivePermissionMap } = require('../services/rolePermissionService');

const {
  register,
  sendRegisterOTP,
  verifyRegisterOTP,
  resendRegisterOTP,
  login,
  getCurrentUser,
  updateProfile,
  changePassword,
  requestPasswordResetOTP,
  verifyOTPAndResetPassword,
  resendPasswordResetOTP,
  toggle2FA,
  verify2FA,
  verifyCurrentUserIdentity,
  logout
} = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authRateLimits } = require('../middleware/authRateLimit');
const { uploadRegistrationIdentity, handleUploadError } = require('../middleware/upload');
const { isGovernmentIdType } = require('../config/governmentIds');

// Validation rules
const registerValidation = [
  body('username').optional().trim().isLength({ min: 3, max: 50 }).withMessage('Username must be between 3 and 50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long (14+ recommended)')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+={}[\]|:;"'<>,.?/~`]).*$/)
    .withMessage('Password must contain lowercase, uppercase, numbers, and symbols')
    .custom((value, { req }) => {
      if (value.toLowerCase() === req.body.username?.toLowerCase()) {
        throw new Error('Password cannot be the same as username');
      }
      if (value.toLowerCase() === req.body.email?.toLowerCase()) {
        throw new Error('Password cannot be the same as email');
      }
      return true;
    }),
  body('firstName').trim().notEmpty().isLength({ max: 100 }).withMessage('First name is required'),
  body('middleName').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Middle name is too long'),
  body('lastName').trim().notEmpty().isLength({ max: 100 }).withMessage('Surname is required'),
  body('phone').trim().notEmpty().isMobilePhone().withMessage('Please provide a valid contact number'),
  body('address.street').trim().notEmpty().isLength({ max: 200 }).withMessage('Street address is required'),
  body('address.barangay').trim().notEmpty().isLength({ max: 100 }).withMessage('Barangay is required'),
  body('address.city').trim().notEmpty().isLength({ max: 100 }).withMessage('City or municipality is required'),
  body('address.province').trim().notEmpty().isLength({ max: 100 }).withMessage('Province is required'),
  body('address.zipCode').trim().notEmpty().isPostalCode('any').withMessage('A valid ZIP code is required'),
  body('address.country').trim().equals('PH').withMessage('Country must be Philippines'),
  body('governmentIdType').custom(isGovernmentIdType).withMessage('Select a valid government ID type'),
  body('biometricConsent').custom(value => value === true || value === 'true').withMessage('Consent to face matching is required'),
  body('role').optional().equals('customer').withMessage('Public registration only creates customer accounts')
];

const loginValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email or username is required')
    .isLength({ max: 254 }).withMessage('Email or username is too long'),
  body('password').notEmpty().withMessage('Password is required')
];

const updateProfileValidation = [
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('phone').optional({ checkFalsy: true }).trim().isString().withMessage('Please provide a valid phone number'),
  body('address.street').optional().trim(),
  body('address.city').optional().trim(),
  body('address.province').optional().trim(),
  body('address.barangay').optional({ checkFalsy: true }).trim(),
  body('address.zipCode').optional().trim(),
  body('address.country').optional().trim()
];

const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long (14+ recommended)')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+={}[\]|:;"'<>,.?/~`]).*$/)
    .withMessage('New password must contain lowercase, uppercase, numbers, and symbols')
    .custom((value, { req }) => {
      if (value.toLowerCase() === req.user?.username?.toLowerCase()) {
        throw new Error('Password cannot be the same as username');
      }
      if (value.toLowerCase() === req.user?.email?.toLowerCase()) {
        throw new Error('Password cannot be the same as email');
      }
      return true;
    })
];

const otpResetValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long (14+ recommended)')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+={}[\]|:;"'<>,.?/~`]).*$/)
    .withMessage('New password must contain lowercase, uppercase, numbers, and symbols')
    .custom((value, { req }) => {
      if (value.toLowerCase() === req.body.email?.toLowerCase()) {
        throw new Error('Password cannot be the same as email');
      }
      return true;
    })
];

const emailValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email')
];

const otpVerificationValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('otp').matches(/^\d{6}$/).withMessage('OTP must be 6 digits')
];

const identityVerificationValidation = [
  body('governmentIdType').custom(isGovernmentIdType).withMessage('Select a valid government ID type'),
  body('biometricConsent').equals('true').withMessage('Consent to face matching is required')
];

// ─── Registration with OTP ────────────────────────────────────────────────────
router.post('/register/send-otp', authRateLimits.authIp, authRateLimits.otpSend, registerValidation, sendRegisterOTP);
router.post('/register/verify-otp', authRateLimits.authIp, authRateLimits.otpVerify, uploadRegistrationIdentity, handleUploadError, otpVerificationValidation, verifyRegisterOTP);
router.post('/register/resend-otp', authRateLimits.authIp, authRateLimits.otpSend, emailValidation, resendRegisterOTP);

// ─── Legacy register (for admin/super_admin creation) ─────────────────────────
router.post('/register', authRateLimits.authIp, authRateLimits.otpSend, registerValidation, register);

// ─── Login ────────────────────────────────────────────────────────────────────
router.post('/login', authRateLimits.authIp, authRateLimits.login, loginValidation, login);

// ─── Password Reset with OTP ──────────────────────────────────────────────────
router.post('/request-password-reset', authRateLimits.authIp, authRateLimits.otpSend, emailValidation, requestPasswordResetOTP);
router.post('/verify-otp-reset-password', authRateLimits.authIp, authRateLimits.otpVerify, otpResetValidation, verifyOTPAndResetPassword);
router.post('/resend-password-reset', authRateLimits.authIp, authRateLimits.otpSend, emailValidation, resendPasswordResetOTP);

// ─── Authenticated routes ─────────────────────────────────────────────────────
router.get('/me', authenticate, getCurrentUser);
router.post('/identity/verify', authenticate, authRateLimits.identityVerification, uploadRegistrationIdentity, handleUploadError, identityVerificationValidation, verifyCurrentUserIdentity);
router.put('/profile', authenticate, updateProfileValidation, updateProfile);
router.put('/change-password', authenticate, changePasswordValidation, changePassword);
router.post('/logout', authenticate, logout);

// ─── Two-Factor Authentication ───────────────────────────────────────────────
router.post('/verify-2fa', authRateLimits.authIp, authRateLimits.otpVerify, otpVerificationValidation, verify2FA);
router.post('/toggle-2fa', authenticate, toggle2FA);

const getFrontendUrl = () => process.env.FRONTEND_URL
  || (process.env.NODE_ENV === 'production' ? 'https://pawzzle.io' : 'http://localhost:3000');

// ─── Helper: issue JWT after OAuth and redirect to frontend ───────────────────
const issueTokenAndRedirect = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+identityVerification').populate('store');
    if (!user) return res.redirect(`${getFrontendUrl()}/login?error=oauth_failed`);
    await attachStoreRolePolicy(user);
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const userData = JSON.stringify({
      _id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      staffType: user.staffType,
      store: user.store,
      permissions: serializeEffectivePermissionMap(user),
      avatar: user.avatar || '',
      authProvider: user.authProvider,
      identityVerificationStatus: user.identityVerification?.status || null
    });

    res.redirect(`${getFrontendUrl()}/oauth-callback?token=${token}&user=${encodeURIComponent(userData)}`);
  } catch (err) {
    console.error('OAuth redirect error:', err);
    res.redirect(`${getFrontendUrl()}/login?error=oauth_failed`);
  }
};

// ─── Google OAuth Routes ──────────────────────────────────────────────────────
// Google OAuth is optional. Do not mount Passport handlers for a strategy that
// was intentionally not registered when credentials are absent.
const googleOAuthConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const googleOAuthUnavailable = (_req, res) => res.status(503).json({
  message: 'Google sign-in is not configured in this environment.'
});

if (googleOAuthConfigured) {
  router.get('/google',
    passport.authenticate('google', { scope: ['profile', 'email'], session: false })
  );

  router.get('/google/callback',
    (req, res, next) => passport.authenticate('google', { session: false }, (error, user, info) => {
      if (error) return res.redirect(`${getFrontendUrl()}/login?error=google_failed`);
      if (!user && info?.code === 'IDENTITY_VERIFICATION_REQUIRED') {
        return res.redirect(`${getFrontendUrl()}/register?notice=identity-verification-required`);
      }
      if (!user) return res.redirect(`${getFrontendUrl()}/login?error=google_failed`);
      req.user = user;
      return issueTokenAndRedirect(req, res);
    })(req, res, next)
  );
} else {
  router.get('/google', googleOAuthUnavailable);
  router.get('/google/callback', googleOAuthUnavailable);
}


module.exports = router;
