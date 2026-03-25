const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const otpService = require('../services/otpService'); // Changed from destructured import
const { validateEmail } = require('../utils/emailValidator');
const dns = require('dns').promises;
const Store = require('../models/Store');
const path = require('path');
const fs = require('fs');
const ActivityLog = require('../models/ActivityLog');

// Enhanced DNS Resolver with Public Fallbacks (Google/Cloudflare)
const dnsResolver = new (require('dns').promises.Resolver)();
dnsResolver.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);

// Helper to verify if email domain exists with high stability
const isEmailDomainValid = async (email) => {
  try {
    const domain = email.split('@')[1];
    if (!domain) return false;

    // Use specific resolver to bypass potentially broken local DNS settings
    const mxRecords = await dnsResolver.resolveMx(domain).catch(async (err) => {
      // Fallback: If MX fails specifically because of "not found", it might truly be invalid.
      // But if it's a connectivity issue (Refused, Timeout), we should try A record or let it pass.
      if (['ECONNREFUSED', 'ETIMEOUT'].includes(err.code)) {
        console.warn(`⚠️ DNS Interrogation for ${domain} failed (${err.code}). Using failover logic...`);
        const aRecords = await dnsResolver.resolve4(domain).catch(() => []);
        return aRecords.length > 0 ? [{ exchange: domain, priority: 0 }] : [];
      }
      return []; // True negative
    });

    // If we're hitting a network block or resolver error, don't punish the user.
    // Only block if we can confirmedly say NO records exist.
    return mxRecords && mxRecords.length > 0;
  } catch (error) {
    // If we can't reliably check, assume it's okay but log it.
    console.error(`⚠️ Could not confirm domain validity for ${email}:`, error.message);
    return true;
  }
};

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// ─── OTP Store (in-memory, use Redis in production) ───────────────────────────
const otpStore = new Map();

// ─── STEP 1: Send Registration OTP ───────────────────────────────────────────
const sendRegisterOTP = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, firstName, lastName, phone, address, role } = req.body;

    // ─── Email Validity Check (Exists + Not Disposable) ─────────────────────
    const emailValidation = await validateEmail(email);
    if (!emailValidation.valid) {
      return res.status(400).json({ message: emailValidation.reason });
    }

    // Verify if email domain actually exists
    const isValidDomain = await isEmailDomainValid(email);
    if (!isValidDomain) {
      return res.status(400).json({
        message: 'The email domain provided does not exist. Please use a valid, active email address.'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email or username already exists' });
    }

    // Only super admin can create admin accounts
    if (role === 'admin' || role === 'super_admin') {
      const existingSuperAdmin = await User.findOne({ role: 'super_admin' });
      if (!existingSuperAdmin && role === 'super_admin') {
        console.log('Creating first super admin account');
      } else if (!existingSuperAdmin) {
        return res.status(403).json({ message: 'Please create super admin account first' });
      } else {
        const currentUser = await User.findById(req.user?.id);
        if (!currentUser || currentUser.role !== 'super_admin') {
          return res.status(403).json({ message: 'Only super admin can create admin accounts' });
        }
      }
    }

    // Generate OTP
    const otp = otpService.generateOTP();

    // Store pending registration data with OTP (10 min expiry)
    otpStore.set(`reg_${email}`, {
      otp,
      expires: Date.now() + 10 * 60 * 1000,
      userData: { username, email, password, firstName, lastName, phone, address, role: role || 'customer' }
    });

    // Try sending OTP via Email first
    let emailSent = false;
    try {
      emailSent = await otpService.sendRegistrationOTP(email, otp, firstName);
    } catch (e) {
      console.error('📧 Email sending failed, will attempt SMS fallback:', e.message);
    }

    if (emailSent) {
      return res.json({
        success: true,
        message: 'Verification code sent to your email',
        deliveryMethod: 'email',
        email
      });
    }

    // Email failed
    res.status(500).json({
      message: 'Failed to send verification code. Please check your email address and try again.'
    });
  } catch (error) {
    console.error('Send registration OTP error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// ─── STEP 2: Verify Registration OTP & Complete Registration ─────────────────
const verifyRegisterOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const storedData = otpStore.get(`reg_${email}`);
    if (!storedData) {
      return res.status(400).json({ message: 'No pending registration found. Please register again.' });
    }

    // Check expiry
    if (Date.now() > storedData.expires) {
      otpStore.delete(`reg_${email}`);
      return res.status(400).json({ message: 'Verification code has expired. Please register again.' });
    }

    // Check OTP match
    if (otp !== storedData.otp) {
      return res.status(400).json({ message: 'Invalid verification code. Please try again.' });
    }

    // OTP verified — create the user
    const { userData } = storedData;

    // Double-check user doesn't exist (race condition guard)
    const existingUser = await User.findOne({ $or: [{ email: userData.email }, { username: userData.username }] });
    if (existingUser) {
      otpStore.delete(`reg_${email}`);
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = new User(userData);
    await user.save();

    // Clean up OTP store
    otpStore.delete(`reg_${email}`);

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Email verified and registration complete',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        address: user.address,
        role: user.role,
        avatar: user.avatar,
        store: user.store
      }
    });
  } catch (error) {
    console.error('Verify registration OTP error:', error);
    res.status(500).json({ message: 'Server error during verification' });
  }
};

// ─── Resend Registration OTP ─────────────────────────────────────────────────
const resendRegisterOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const storedData = otpStore.get(`reg_${email}`);
    if (!storedData) {
      return res.status(400).json({ message: 'No pending registration found. Please register again.' });
    }

    // Verify if email domain actually exists
    const isValidDomain = await isEmailDomainValid(email);
    if (!isValidDomain) {
      return res.status(400).json({
        message: 'The email domain provided does not exist. Please use a valid, active email address.'
      });
    }

    // Generate new OTP
    const otp = otpService.generateOTP();
    storedData.otp = otp;
    storedData.expires = Date.now() + 10 * 60 * 1000;
    otpStore.set(`reg_${email}`, storedData);

    // Try Resending via Email first
    let emailSent = false;
    try {
      emailSent = await otpService.sendRegistrationOTP(email, otp, storedData.userData.firstName);
    } catch (e) {
      console.error('📧 Resend email failed, will attempt SMS fallback:', e.message);
    }

    if (emailSent) {
      return res.json({
        success: true,
        message: 'New verification code sent to your email',
        deliveryMethod: 'email'
      });
    }

    res.status(500).json({ message: 'Failed to resend verification code. Please try again later.' });
  } catch (error) {
    console.error('Resend registration OTP error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── Legacy register (kept for admin/super_admin creation without OTP) ───────
const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, firstName, lastName, phone, address, role } = req.body;

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email or username already exists' });
    }

    if (role === 'admin' || role === 'super_admin') {
      const existingSuperAdmin = await User.findOne({ role: 'super_admin' });
      if (!existingSuperAdmin && role === 'super_admin') {
        console.log('Creating first super admin account');
      } else if (!existingSuperAdmin) {
        return res.status(403).json({ message: 'Please create super admin account first' });
      } else {
        const currentUser = await User.findById(req.user?.id);
        if (!currentUser || currentUser.role !== 'super_admin') {
          return res.status(403).json({ message: 'Only super admin can create admin accounts' });
        }
      }
    }

    const user = new User({
      username, email, password, firstName, lastName, phone, address,
      role: role || 'customer'
    });

    await user.save();
    const token = generateToken(user._id);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id, username: user.username, email: user.email,
        firstName: user.firstName, lastName: user.lastName,
        phone: user.phone, address: user.address,
        role: user.role, avatar: user.avatar, store: user.store
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// ─── Login user ──────────────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body; // Actually this could be email or username 

    const user = await User.findOne({
      $or: [{ email: email }, { username: email }]
    }).populate('store');

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or username' });
    }

    if (!user.isActive || user.isDeleted) {
      return res.status(403).json({ 
        message: 'Account Disabled',
        deactivationReason: user.deactivationReason || 'Your account has been disabled. Please contact support if you believe this is an error.',
        contactSupport: 'support@petshop.com',
        isDisabled: true
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Incorrect password' });
    }

    // 🛡️ Check if 2FA is enabled
    if (user.twoFactorEnabled) {
      const otp = otpService.generateOTP();
      
      // Store 2FA session (5 min expiry)
      otpStore.set(`2fa_${user.email}`, { 
        otp, 
        userId: user._id, 
        expires: Date.now() + 5 * 60 * 1000 
      });

      // Send OTP
      await otpService.sendLoginOTP(user.email, otp, user.firstName);

      return res.json({
        success: true,
        twoFactorRequired: true,
        message: 'Two-factor authentication required. Verification code sent to your email.',
        email: user.email
      });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id, username: user.username, email: user.email,
        firstName: user.firstName, lastName: user.lastName,
        phone: user.phone, address: user.address,
        role: user.role, avatar: user.avatar, store: user.store
      }
    });
    
    // Log the successful login Activity
    await ActivityLog.create({
      user: user._id,
      action: 'Account Login',
      details: 'Successfully authenticated session via standard sign-in',
      ipAddress: req.ip
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// ─── Get current user ────────────────────────────────────────────────────────
const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password').populate('store');
    res.json({ user });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── Update user profile ────────────────────────────────────────────────────
const updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { firstName, lastName, phone, address, avatar } = req.body;

    const user = await User.findById(req.user._id).populate('store');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.phone = phone || user.phone;
    user.avatar = avatar || user.avatar;

    if (address && typeof address === 'object') {
      user.address = {
        street: address.street || user.address?.street || 'N/A',
        city: address.city || user.address?.city || 'N/A',
        province: address.province || user.address?.province || 'Cavite',
        barangay: address.barangay || user.address?.barangay || 'N/A',
        zipCode: address.zipCode || user.address?.zipCode || '',
        country: address.country || user.address?.country || 'PH'
      };
    } else if (!user.address || !user.address.street) {
      user.address = {
        street: 'N/A', city: 'N/A', province: 'Cavite',
        barangay: 'N/A', zipCode: '', country: 'PH'
      };
    }

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id, username: user.username, email: user.email,
        firstName: user.firstName, lastName: user.lastName,
        phone: user.phone, address: user.address,
        role: user.role, avatar: user.avatar, store: user.store
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── Change password ─────────────────────────────────────────────────────────
const changePassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect' });

    user.password = newPassword;
    await user.save();

    await ActivityLog.create({
      user: user._id,
      action: 'Password Changed',
      details: 'User voluntarily changed account password',
      ipAddress: req.ip
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── Request password reset OTP ──────────────────────────────────────────────
const requestPasswordResetOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // ─── Email Validity Check (Exists + Not Disposable) ─────────────────────
    const emailValidation = await validateEmail(email);
    if (!emailValidation.valid) {
      return res.status(400).json({ message: emailValidation.reason });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'No account found with this email address.' });
    }

    const otp = otpService.generateOTP();
    otpStore.set(`reset_${email}`, { otp, expires: Date.now() + 10 * 60 * 1000 });

    // Try sending via Email first
    let emailSent = false;
    try {
      emailSent = await otpService.sendPasswordResetOTP(email, otp);
    } catch (e) {
      console.error('📧 Reset email failed, will attempt SMS fallback:', e.message);
    }

    if (emailSent) {
      return res.json({
        success: true,
        message: 'Password reset code sent to your email',
        deliveryMethod: 'email',
        email
      });
    }

    res.status(500).json({ message: 'Failed to send reset code. Please check your email address and try again.' });
  } catch (error) {
    console.error('Request password reset OTP error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── Verify OTP and reset password ──────────────────────────────────────────
const verifyOTPAndResetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: 'Email, OTP, and new password are required' });
    }

    const storedData = otpStore.get(`reset_${email}`);
    if (!storedData) {
      return res.status(400).json({ message: 'Invalid or expired reset code' });
    }

    if (Date.now() > storedData.expires) {
      otpStore.delete(`reset_${email}`);
      return res.status(400).json({ message: 'Reset code has expired. Please request a new one.' });
    }

    if (otp !== storedData.otp) {
      return res.status(400).json({ message: 'Invalid reset code. Please try again.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    await User.findByIdAndUpdate(user._id, { password: hashedPassword });

    otpStore.delete(`reset_${email}`);
    
    await ActivityLog.create({
      user: user._id,
      action: 'Password Reset',
      details: 'Password was successfully reset using OTP verification',
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Password reset successful', email });
  } catch (error) {
    console.error('Verify OTP and reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── Resend password reset OTP ──────────────────────────────────────────────
const resendPasswordResetOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'No account found with this email address.' });
    }

    const otp = otpService.generateOTP();
    otpStore.set(`reset_${email}`, { otp, expires: Date.now() + 10 * 60 * 1000 });

    // Try Resending via Email first
    let emailSent = false;
    try {
      emailSent = await otpService.sendPasswordResetOTP(email, otp);
    } catch (e) {
      console.error('📧 Resend reset email failed, will attempt SMS fallback:', e.message);
    }

    if (emailSent) {
      return res.json({
        success: true,
        message: 'New reset code sent to your email',
        deliveryMethod: 'email'
      });
    }

    res.status(500).json({ message: 'Failed to resend reset code. Please try again later.' });
  } catch (error) {
    console.error('Resend password reset OTP error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── Toggle 2FA ─────────────────────────────────────────────────────────────
const toggle2FA = async (req, res) => {
  try {
    const { enabled } = req.body;
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.twoFactorEnabled = enabled;
    await user.save();

    res.json({ 
      success: true, 
      message: `Two-factor authentication ${enabled ? 'enabled' : 'disabled'} successfully`,
      twoFactorEnabled: user.twoFactorEnabled
    });
  } catch (error) {
    console.error('Toggle 2FA error:', error);
    res.status(500).json({ message: 'Server error while toggling 2FA' });
  }
};

// ─── Verify 2FA OTP and login ───────────────────────────────────────────────
const verify2FA = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and verification code are required' });
    }

    const storedData = otpStore.get(`2fa_${email}`);
    if (!storedData) {
      return res.status(400).json({ message: 'Invalid or expired verification session' });
    }

    if (Date.now() > storedData.expires) {
      otpStore.delete(`2fa_${email}`);
      return res.status(400).json({ message: 'Verification code has expired. Please log in again.' });
    }

    if (otp !== storedData.otp) {
      return res.status(400).json({ message: 'Invalid verification code. Please try again.' });
    }

    const user = await User.findById(storedData.userId).populate('store');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Success - clean up OTP and issue token
    otpStore.delete(`2fa_${email}`);
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Email verified and login successful',
      token,
      user: {
        id: user._id, username: user.username, email: user.email,
        firstName: user.firstName, lastName: user.lastName,
        phone: user.phone, address: user.address,
        role: user.role, avatar: user.avatar, store: user.store
      }
    });

    await ActivityLog.create({
      user: user._id,
      action: 'Account Login',
      details: 'Successfully authenticated session via 2FA',
      ipAddress: req.ip
    });
  } catch (error) {
    console.error('Verify 2FA error:', error);
    res.status(500).json({ message: 'Server error during 2FA verification' });
  }
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
