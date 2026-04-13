const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const jwt = require('jsonwebtoken');
const passport = require('../config/passport');

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
  verify2FA
} = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

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
  body('firstName').optional().trim().notEmpty().withMessage('First name is required'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name is required'),
  body('phone').optional().trim().isMobilePhone().withMessage('Please provide a valid phone number'),
  body('address.barangay').optional().trim().notEmpty().withMessage('Barangay is required'),
  body('role').optional().isIn(['super_admin', 'admin', 'customer']).withMessage('Invalid role')
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
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

// ─── Registration with OTP ────────────────────────────────────────────────────
router.post('/register/send-otp', registerValidation, sendRegisterOTP);
router.post('/register/verify-otp', verifyRegisterOTP);
router.post('/register/resend-otp', resendRegisterOTP);

// ─── Legacy register (for admin/super_admin creation) ─────────────────────────
router.post('/register', registerValidation, register);

// ─── Login ────────────────────────────────────────────────────────────────────
router.post('/login', loginValidation, login);

// ─── Password Reset with OTP ──────────────────────────────────────────────────
router.post('/request-password-reset', requestPasswordResetOTP);
router.post('/verify-otp-reset-password', otpResetValidation, verifyOTPAndResetPassword);
router.post('/resend-password-reset', resendPasswordResetOTP);

// ─── Authenticated routes ─────────────────────────────────────────────────────
router.get('/me', authenticate, getCurrentUser);
router.put('/profile', authenticate, updateProfileValidation, updateProfile);
router.put('/change-password', authenticate, changePasswordValidation, changePassword);

// ─── Two-Factor Authentication ───────────────────────────────────────────────
router.post('/verify-2fa', verify2FA);
router.post('/toggle-2fa', authenticate, toggle2FA);

// ─── Helper: issue JWT after OAuth and redirect to frontend ───────────────────
const issueTokenAndRedirect = (req, res) => {
  try {
    const user = req.user;
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const userData = JSON.stringify({
      _id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      avatar: user.avatar || '',
      authProvider: user.authProvider
    });

    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
    
    // Dynamic determination of frontend URL
    let defaultFrontend = `${protocol}://${host.replace(':5000', ':3000')}`;
    
    // If we're on a production domain like pawzzle.io, ensure we don't accidentally use :3000
    if (host.includes('pawzzle.io') || !host.includes('localhost')) {
      defaultFrontend = `${protocol}://${host}`;
    }

    // Prioritize the dynamic host if FRONTEND_URL is set to localhost but we're on a live site
    let frontendUrl = process.env.FRONTEND_URL;
    if (!frontendUrl || (frontendUrl.includes('localhost') && !host.includes('localhost'))) {
      frontendUrl = defaultFrontend;
    }
    
    res.redirect(`${frontendUrl}/oauth-callback?token=${token}&user=${encodeURIComponent(userData)}`);
  } catch (err) {
    console.error('OAuth redirect error:', err);
    // Use dynamic host for error redirect too
    const fallbackHost = req.headers.host ? `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}` : 'https://pawzzle.io';
    res.redirect(`${process.env.FRONTEND_URL || fallbackHost}/login?error=oauth_failed`);
  }
};

// ─── Google OAuth Routes ──────────────────────────────────────────────────────
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login?error=google_failed' }),
  issueTokenAndRedirect
);


module.exports = router;
