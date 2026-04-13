const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const otpService = require('../services/otpService');
const { validateEmail } = require('../utils/emailValidator');
const Store = require('../models/Store');
const ActivityLog = require('../models/ActivityLog');
const { verifyRecaptcha } = require('../utils/captchaVerifier');
const Otp = require('../models/Otp');

/**
 * authController.js
 * Handles User Authentication, Registration with mandatory Email Verification,
 * Password Resets, and 2FA.
 */

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// Helper: DNS Resolver logic (simplified for stability as per earlier fixes)
const isEmailDomainValid = async () => true;

// ─── STEP 1: Send Registration OTP (Persistent State) ────────────────────────
const sendRegisterOTP = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    let { username, email, password, firstName, lastName, phone, address, role, captchaToken } = req.body;
    
    // Auto-generate username logic
    if (!username && email) {
      username = email.split('@')[0];
      const existing = await User.findOne({ username, isDeleted: false });
      if (existing) username = `${username}${Math.floor(100 + Math.random() * 900)}`;
    }

    // Security Check (Requirement 1 & 2)
    const isHuman = await verifyRecaptcha(captchaToken);
    if (!isHuman) return res.status(400).json({ message: 'Security check failed. Please verify you are not a robot.' });

    const emailValidation = await validateEmail(email);
    if (!emailValidation.valid) return res.status(400).json({ message: emailValidation.reason });

    const existingEmail = await User.findOne({ email, isDeleted: false });
    if (existingEmail) return res.status(400).json({ message: 'Email address is already in use' });

    // Role safety
    if (role === 'admin' || role === 'super_admin') {
      const superAdminExists = await User.findOne({ role: 'super_admin' });
      if (superAdminExists) {
        const currentUser = await User.findById(req.user?.id);
        if (!currentUser || currentUser.role !== 'super_admin') {
          return res.status(403).json({ message: 'Only super admins can create administrative accounts' });
        }
      }
    }

    const otp = otpService.generateOTP();
    const userData = { username, email, password, firstName, lastName, phone, address, role: role || 'customer' };

    try {
      // Req 2 & 3: Save to DB and Send REAL Email (No Bypass)
      await otpService.sendRegistrationOTP(email, otp, firstName, userData);
      
      return res.json({
        success: true,
        message: 'Verification code sent to your email',
        deliveryMethod: 'email',
        email
      });
    } catch (deliveryError) {
      console.error('📧 Delivery error:', deliveryError.message);
      if (deliveryError.message.includes('wait')) return res.status(429).json({ message: deliveryError.message });
      
      // Req 5: Error handling
      return res.status(500).json({ 
        message: 'Failed to send verification email. Please check your spelling or try again later.',
        error: deliveryError.message 
      });
    }
  } catch (error) {
    console.error('Send registration OTP error:', error);
    res.status(500).json({ message: 'Server error during registration process' });
  }
};

// ─── STEP 2: Verify Registration OTP & Complete Account Creation ──────────────
const verifyRegisterOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) return res.status(400).json({ message: 'Email and verification code are required' });

    // Req 7: Verification Process via Database
    const storedData = await Otp.findOne({ email: email.toLowerCase(), type: 'registration' }).sort({ createdAt: -1 });
    
    if (!storedData) return res.status(400).json({ message: 'Verification session expired. Please register again.' });

    // Standardization: Compare OTPs as trimmed strings to prevent type mismatch (Numeric vs String)
    const submittedOtp = otp.toString().trim();
    const serverOtp = storedData.otp.toString().trim();

    if (submittedOtp !== serverOtp) {
      return res.status(400).json({ message: 'Invalid verification code. Please check your email inbox.' });
    }

    const { userData } = storedData;
    if (!userData) return res.status(400).json({ message: 'Registration data corrupted. Please start over.' });

    // Last-second check for duplicates
    const conflict = await User.findOne({ $or: [{ email: userData.email }, { username: userData.username }], isDeleted: false });
    if (conflict) return res.status(400).json({ message: 'Email or username was taken during verification. Please start over.' });

    const user = new User(userData);
    await user.save();

    await Otp.deleteMany({ email: email.toLowerCase() });

    try {
      await ActivityLog.create({
        user: user._id,
        action: 'Account Verified',
        details: 'User successfully completed email verification and account activation',
        ipAddress: req.ip
      });
    } catch (logErr) {}

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Email verified! Welcome to Pawzzle.',
      token,
      user: {
        id: user._id, username: user.username, email: user.email,
        firstName: user.firstName, lastName: user.lastName,
        role: user.role, store: user.store
      }
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ message: 'Server error during verification' });
  }
};

// ─── Resend Registration OTP ─────────────────────────────────────────────────
const resendRegisterOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const storedData = await Otp.findOne({ email: email.toLowerCase(), type: 'registration' }).sort({ createdAt: -1 });
    if (!storedData || !storedData.userData) return res.status(400).json({ message: 'No active registration session. Please start over.' });

    const newOtp = otpService.generateOTP();

    try {
      await otpService.sendRegistrationOTP(email, newOtp, storedData.userData.firstName, storedData.userData);
      return res.json({ success: true, message: 'A new verification code has been sent.' });
    } catch (err) {
      if (err.message.includes('wait')) return res.status(429).json({ message: err.message });
      return res.status(500).json({ message: 'Failed to resend code.' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Login logic with Database-backed 2FA
 */
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password, captchaToken } = req.body;

    const isHuman = await verifyRecaptcha(captchaToken);
    if (!isHuman) return res.status(400).json({ message: 'Security check failed.' });

    const user = await User.findOne({ 
      $or: [{ email: email.toLowerCase() }, { username: email }], 
      isDeleted: false 
    }).populate('store');

    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    if (!user.isActive) return res.status(403).json({ message: 'Account disabled. Contact support.' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    if (user.twoFactorEnabled) {
      const otp = otpService.generateOTP();
      await otpService.sendLoginOTP(user.email, otp, user.firstName);

      return res.json({
        success: true,
        twoFactorRequired: true,
        message: 'Security code sent to your email.',
        email: user.email
      });
    }

    const token = generateToken(user._id);
    return res.json({
      success: true,
      token,
      user: { 
        id: user._id, 
        username: user.username, 
        email: user.email, 
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        store: user.store
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed due to server error' });
  }
};

const verify2FA = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: 'Email and code are required' });

    const stored = await Otp.findOne({ email: email.toLowerCase(), type: 'login' }).sort({ createdAt: -1 });
    
    if (!stored || otp.toString().trim() !== stored.otp.toString().trim()) {
      return res.status(400).json({ message: 'Invalid or expired code.' });
    }

    const user = await User.findOne({ email: email.toLowerCase(), isDeleted: false }).populate('store');
    if (!user) return res.status(404).json({ message: 'User not found' });

    await Otp.deleteMany({ email: email.toLowerCase(), type: 'login' });

    const token = generateToken(user._id);
    res.json({ 
      success: true, 
      token, 
      user: { 
        id: user._id, username: user.username, email: user.email, role: user.role,
        firstName: user.firstName, lastName: user.lastName, store: user.store
      } 
    });
  } catch (error) {
    console.error('2FA verification error:', error);
    res.status(500).json({ message: 'Security verification failed' });
  }
};

const requestPasswordResetOTP = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email, isDeleted: false });
    if (!user) return res.status(404).json({ message: 'Email not found.' });

    const otp = otpService.generateOTP();
    await otpService.sendPasswordResetOTP(email, otp);

    res.json({ success: true, message: 'Reset code sent.' });
  } catch (err) {
    res.status(500).json({ message: 'Error sending reset code.' });
  }
};

const verifyOTPAndResetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, otp, newPassword } = req.body;
    if (!email || !otp) return res.status(400).json({ message: 'Email and code are required' });

    const stored = await Otp.findOne({ email: email.toLowerCase(), type: 'password_reset' }).sort({ createdAt: -1 });

    if (!stored || otp.toString().trim() !== stored.otp.toString().trim()) {
      return res.status(400).json({ message: 'Invalid or expired code.' });
    }

    const user = await User.findOne({ email: email.toLowerCase(), isDeleted: false });
    if (!user) return res.status(404).json({ message: 'Associated user account not found.' });

    // Hashing is handled by the model's pre-save hook, so we assign directly
    user.password = newPassword;
    await user.save();

    await Otp.deleteMany({ email: email.toLowerCase(), type: 'password_reset' });
    res.json({ success: true, message: 'Password reset successful. You can now login with your new password.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Reset failed' });
  }
};

// Generic Profile & Utility Methods (Simplified for brevity as they were stable)
const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password').populate('store');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch user data' });
  }
};

const updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const user = await User.findByIdAndUpdate(req.user._id, req.body, { new: true }).populate('store');
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ message: 'Profile update failed' });
  }
};

const changePassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);
    if (!user || !(await user.comparePassword(currentPassword))) return res.status(400).json({ message: 'Current password incorrect' });
    
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to change password' });
  }
};

const toggle2FA = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    user.twoFactorEnabled = req.body.enabled;
    await user.save();
    res.json({ success: true, enabled: user.twoFactorEnabled });
  } catch (error) {
    res.status(500).json({ message: 'Failed to toggle 2FA' });
  }
};

const resendPasswordResetOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const otp = otpService.generateOTP();
    await otpService.sendPasswordResetOTP(email, otp);
    res.json({ success: true, message: 'OTP resent successfully' });
  } catch (err) {
    console.error('Resend password OTP error:', err);
    res.status(500).json({ message: err.message || 'Failed to resend OTP' });
  }
};

// Legacy Placeholder
const register = async (req, res) => {
    return sendRegisterOTP(req, res);
};

module.exports = {
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
};
