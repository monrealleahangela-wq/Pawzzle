const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const otpService = require('../services/otpService');
const { validateEmail } = require('../utils/emailValidator');
const { verifyRecaptcha } = require('../utils/captchaVerifier');
const {
  pickProfileUpdates,
  applyProfileUpdates,
  sanitizeUser,
  buildPublicRegistrationData
} = require('../utils/authSecurity');
const { attachStoreRolePolicy, serializeEffectivePermissionMap } = require('../services/rolePermissionService');
const { requiresPlatformVerification, getProfessionalVerificationStatus } = require('../utils/staffSpecialization');
const { isGovernmentIdType } = require('../config/governmentIds');
const {
  getEncryptionKey,
  encryptIdentityDocument,
  matchesImageSignature,
  compareIdentityFaces
} = require('../utils/identityVerification');

const generateToken = id => jwt.sign(
  { id },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
);

const userSummary = user => ({
  id: user._id,
  username: user.username,
  email: user.email,
  role: user.role,
  staffType: user.staffType,
  firstName: user.firstName,
  middleName: user.middleName,
  lastName: user.lastName,
  phone: user.phone,
  identityVerificationStatus: user.identityVerification?.status || null,
  store: user.store,
  permissions: serializeEffectivePermissionMap(user),
  requiresPasswordChange: Boolean(user.requiresPasswordChange),
  professionalVerificationRequired: requiresPlatformVerification(user),
  professionalVerificationStatus: getProfessionalVerificationStatus(user)
});

const withProfessionalVerificationState = (safeUser, sourceUser) => ({
  ...safeUser,
  identityVerificationStatus: sourceUser.identityVerification?.status || null,
  professionalVerificationRequired: requiresPlatformVerification(sourceUser),
  professionalVerificationStatus: getProfessionalVerificationStatus(sourceUser)
});

const otpFailureMessage = (result, lockedMessage) => result.reason === 'locked'
  ? lockedMessage
  : 'Invalid or expired code.';

const sendRegisterOTP = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    let { username, email, password, firstName, middleName, lastName, phone, address, governmentIdType, biometricConsent } = req.body;
    email = String(email).trim().toLowerCase();

    if (!username) {
      username = email.split('@')[0];
      if (await User.exists({ username, isDeleted: false })) username = `${username}${crypto.randomInt(100, 1000)}`;
    }

    const emailValidation = await validateEmail(email);
    if (!emailValidation.valid) return res.status(400).json({ message: emailValidation.reason });
    if (await User.exists({ email, isDeleted: false })) {
      return res.status(400).json({ message: 'Email address is already in use' });
    }

    // The password is hashed before temporary registration state is persisted.
    const passwordHash = await bcrypt.hash(password, 10);
    const userData = buildPublicRegistrationData({
      username,
      email,
      password: passwordHash,
      firstName,
      middleName,
      lastName,
      phone,
      address,
      governmentIdType,
      biometricConsent
    });

    const otp = otpService.generateOTP();
    try {
      await otpService.sendRegistrationOTP(email, otp, firstName, userData);
      return res.json({
        success: true,
        message: 'Verification code sent to your email',
        deliveryMethod: 'email',
        email
      });
    } catch (deliveryError) {
      if (deliveryError.message.includes('Wait')) return res.status(429).json({ message: deliveryError.message });
      return res.status(503).json({ message: 'Verification email is temporarily unavailable. Please try again later.' });
    }
  } catch (error) {
    console.error('Registration verification request failed');
    return res.status(500).json({ message: 'Server error during registration process' });
  }
};

const verifyRegisterOTP = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const email = String(req.body.email || '').trim().toLowerCase();
    const { otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: 'Email and verification code are required' });

    const governmentIdImage = req.files?.governmentIdImage?.[0];
    const selfieImage = req.files?.selfieImage?.[0];
    if (!governmentIdImage || !selfieImage) {
      return res.status(400).json({ code: 'IDENTITY_IMAGES_REQUIRED', message: 'A government ID image and new live-camera selfie are required.' });
    }
    if (!matchesImageSignature(governmentIdImage.buffer, governmentIdImage.mimetype)
      || !matchesImageSignature(selfieImage.buffer, selfieImage.mimetype)) {
      return res.status(400).json({ code: 'IDENTITY_IMAGE_INVALID', message: 'One or more identity images are not valid JPG or PNG files.' });
    }

    // Fail closed before checking or consuming the one-time code when the
    // encryption or face-match service is not configured.
    getEncryptionKey();
    const verification = await otpService.verifyOTP(email, 'registration', otp, { consume: false });
    if (!verification.valid) {
      return res.status(400).json({
        message: otpFailureMessage(verification, 'Too many invalid codes. Please request a new verification code.')
      });
    }

    const userData = verification.userData;
    if (!userData) return res.status(400).json({ message: 'Registration data is unavailable. Please start over.' });
    if (!isGovernmentIdType(userData.governmentIdType) || userData.biometricConsent !== true) {
      return res.status(400).json({ code: 'IDENTITY_CONSENT_REQUIRED', message: 'Identity verification consent and a valid government ID type are required. Please start over.' });
    }
    userData.role = 'customer';

    const conflict = await User.findOne({
      $or: [{ email: userData.email }, { username: userData.username }],
      isDeleted: false
    });
    if (conflict) return res.status(400).json({ message: 'Email or username was taken during verification. Please start over.' });

    const faceMatch = await compareIdentityFaces(governmentIdImage.buffer, selfieImage.buffer);
    if (!faceMatch.matched) {
      return res.status(400).json({
        code: 'FACE_MATCH_FAILED',
        message: 'Your live selfie did not match the face on the government ID. Retake both images in clear lighting and try again.'
      });
    }

    const encryptedGovernmentId = encryptIdentityDocument(governmentIdImage.buffer);
    const consumed = await otpService.consumeVerifiedOTP(verification.sessionId, 'registration');
    if (!consumed) return res.status(400).json({ message: 'This verification code has expired or was already used. Please request a new code.' });

    userData.identityVerification = {
      status: 'verified',
      governmentId: {
        documentType: userData.governmentIdType,
        encryptedImage: encryptedGovernmentId,
        mimeType: governmentIdImage.mimetype,
        size: governmentIdImage.size
      },
      faceMatch: {
        provider: faceMatch.provider,
        similarity: faceMatch.similarity,
        threshold: faceMatch.threshold,
        sourceFaceConfidence: faceMatch.sourceFaceConfidence
      },
      consent: { acceptedAt: new Date(), policyVersion: 'registration-identity-v1' },
      verifiedAt: new Date()
    };
    delete userData.governmentIdType;
    delete userData.biometricConsent;

    const user = new User(userData);
    await user.save();

    try {
      await ActivityLog.create({
        user: user._id,
        action: 'Account Verified',
        details: 'User completed email and government identity verification',
        ipAddress: req.ip
      });
    } catch (activityError) {
      console.warn('Account verification activity log could not be recorded');
    }

    return res.status(201).json({
      success: true,
      message: 'Email and identity verified! Welcome to Pawzzle.',
      token: generateToken(user._id),
      user: userSummary(user)
    });
  } catch (error) {
    console.error('Registration verification failed');
    if (error?.statusCode && error?.code) {
      return res.status(error.statusCode).json({ code: error.code, message: error.message });
    }
    return res.status(500).json({ message: 'Server error during verification' });
  } finally {
    for (const field of ['governmentIdImage', 'selfieImage']) {
      const buffer = req.files?.[field]?.[0]?.buffer;
      if (Buffer.isBuffer(buffer)) buffer.fill(0);
    }
  }
};

const resendRegisterOTP = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const storedData = await otpService.getActiveOtpSession(email, 'registration');
    if (!storedData?.userData) {
      return res.status(400).json({ message: 'No active registration session. Please start over.' });
    }

    const userData = { ...storedData.userData, role: 'customer' };
    if (userData.password && !/^\$2[aby]\$/.test(userData.password)) {
      userData.password = await bcrypt.hash(userData.password, 10);
    }

    await otpService.sendRegistrationOTP(email, otpService.generateOTP(), userData.firstName, userData);
    return res.json({ success: true, message: 'A new verification code has been sent.' });
  } catch (error) {
    if (error.message.includes('Wait')) return res.status(429).json({ message: error.message });
    return res.status(503).json({ message: 'Unable to resend the verification code right now.' });
  }
};

const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    const identifier = email.trim();

    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { username: identifier },
        { username: identifier.toLowerCase() }
      ],
      isDeleted: false
    }).select('+password +identityVerification').populate('store');

    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    if (!user.isActive) {
      return res.status(403).json({
        message: 'Account disabled. Contact support.',
        isDisabled: true,
        deactivationReason: user.deactivationReason || 'This account has been disabled.',
        contactSupport: true
      });
    }
    if (!user.password) {
      return res.status(401).json({
        message: user.authProvider === 'google'
          ? 'This account uses Google sign-in. Please continue with Google.'
          : 'Invalid credentials'
      });
    }
    if (!(await user.comparePassword(password))) return res.status(401).json({ message: 'Invalid credentials' });

    if (user.twoFactorEnabled) {
      await otpService.sendLoginOTP(user.email, otpService.generateOTP(), user.firstName);
      return res.json({
        success: true,
        twoFactorRequired: true,
        message: 'Security code sent to your email.',
        email: user.email
      });
    }

    await attachStoreRolePolicy(user);
    return res.json({ success: true, token: generateToken(user._id), user: userSummary(user) });
  } catch (error) {
    const databaseUnavailable = [
      'MongooseServerSelectionError',
      'MongoNetworkError',
      'MongoServerSelectionError'
    ].includes(error.name) || ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEOUT'].includes(error.code);

    if (databaseUnavailable) {
      return res.status(503).json({
        message: 'The account database is temporarily unavailable. Please try again later.',
        code: 'DATABASE_UNAVAILABLE'
      });
    }
    console.error('Login failed due to an internal error');
    return res.status(500).json({ message: 'Login failed due to server error' });
  }
};

const verify2FA = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const email = String(req.body.email || '').trim().toLowerCase();
    const { otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: 'Email and code are required' });

    const verification = await otpService.verifyOTP(email, 'login', otp);
    if (!verification.valid) {
      return res.status(400).json({
        message: otpFailureMessage(verification, 'Too many invalid codes. Please sign in again.')
      });
    }

    const user = await User.findOne({ email, isDeleted: false }).select('+identityVerification').populate('store');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.isActive) return res.status(403).json({ message: 'Account disabled. Contact support.' });

    await attachStoreRolePolicy(user);
    return res.json({ success: true, token: generateToken(user._id), user: userSummary(user) });
  } catch (error) {
    console.error('2FA verification failed');
    return res.status(500).json({ message: 'Security verification failed' });
  }
};

const requestPasswordResetOTP = async (req, res) => {
  const genericMessage = 'If that account exists, a reset code has been sent.';
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const email = String(req.body.email || '').trim().toLowerCase();
    const { captchaToken } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });
    if (!(await verifyRecaptcha(captchaToken, req.ip))) {
      return res.status(400).json({ message: 'Security check failed. Please verify you are not a robot.' });
    }

    const user = await User.findOne({ email, isDeleted: false });
    if (user) await otpService.sendPasswordResetOTP(email, otpService.generateOTP());
    return res.json({ success: true, message: genericMessage });
  } catch (error) {
    console.warn('A password reset email could not be delivered');
    return res.json({ success: true, message: genericMessage });
  }
};

const verifyOTPAndResetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const email = String(req.body.email || '').trim().toLowerCase();
    const { otp, newPassword } = req.body;
    const verification = await otpService.verifyOTP(email, 'password_reset', otp);
    if (!verification.valid) {
      return res.status(400).json({
        message: otpFailureMessage(verification, 'Too many invalid codes. Please request a new reset code.')
      });
    }

    const user = await User.findOne({ email, isDeleted: false }).select('+password');
    if (!user) return res.status(400).json({ message: 'Invalid or expired code.' });

    // Assignment plus save intentionally invokes the User password hashing hook.
    user.password = newPassword;
    user.requiresPasswordChange = false;
    await user.save();
    return res.json({ success: true, message: 'Password reset successful. You can now login with your new password.' });
  } catch (error) {
    console.error('Password reset failed');
    return res.status(500).json({ message: 'Reset failed' });
  }
};

const resendPasswordResetOTP = async (req, res) => {
  const genericMessage = 'If that account exists, a reset code has been sent.';
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'Email is required' });
    const user = await User.findOne({ email, isDeleted: false });
    if (user) await otpService.sendPasswordResetOTP(email, otpService.generateOTP());
    return res.json({ success: true, message: genericMessage });
  } catch (error) {
    console.warn('A password reset resend email could not be delivered');
    return res.json({ success: true, message: genericMessage });
  }
};

const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+identityVerification').populate('store');
    if (!user) return res.status(404).json({ message: 'User not found' });
    await attachStoreRolePolicy(user);
    const safe = withProfessionalVerificationState(sanitizeUser(user), user);
    safe.permissions = serializeEffectivePermissionMap(user);
    if (user.$locals?.rolePolicyPermissions !== undefined) safe.permissionSource = 'store_role';
    return res.json({ user: safe });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch user data' });
  }
};

const verifyCurrentUserIdentity = async (req, res) => {
  const governmentIdImage = req.files?.governmentIdImage?.[0];
  const selfieImage = req.files?.selfieImage?.[0];
  try {
    const user = await User.findById(req.user._id).select('+identityVerification');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.identityVerification?.status === 'verified') {
      await user.populate('store');
      await attachStoreRolePolicy(user);
      const safe = withProfessionalVerificationState(sanitizeUser(user), user);
      safe.permissions = serializeEffectivePermissionMap(user);
      return res.json({
        success: true,
        alreadyVerified: true,
        message: 'Identity is already verified. Pawzzle features are unlocked.',
        user: safe
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    if (!governmentIdImage || !selfieImage) {
      return res.status(400).json({
        code: 'IDENTITY_IMAGES_REQUIRED',
        message: 'A government ID image and a new live-camera selfie are required.'
      });
    }
    if (!matchesImageSignature(governmentIdImage.buffer, governmentIdImage.mimetype)
      || !matchesImageSignature(selfieImage.buffer, selfieImage.mimetype)) {
      return res.status(400).json({
        code: 'IDENTITY_IMAGE_INVALID',
        message: 'One or more identity images are not valid JPG or PNG files.'
      });
    }
    if (!isGovernmentIdType(req.body.governmentIdType) || req.body.biometricConsent !== 'true') {
      return res.status(400).json({
        code: 'IDENTITY_CONSENT_REQUIRED',
        message: 'Select a valid government ID and consent to the face comparison.'
      });
    }

    getEncryptionKey();
    const faceMatch = await compareIdentityFaces(governmentIdImage.buffer, selfieImage.buffer);
    if (!faceMatch.matched) {
      return res.status(400).json({
        code: 'FACE_MATCH_FAILED',
        message: 'Your live selfie did not match the face on the government ID. Retake both images in clear lighting and try again.'
      });
    }

    user.identityVerification = {
      status: 'verified',
      governmentId: {
        documentType: req.body.governmentIdType,
        encryptedImage: encryptIdentityDocument(governmentIdImage.buffer),
        mimeType: governmentIdImage.mimetype,
        size: governmentIdImage.size
      },
      faceMatch: {
        provider: faceMatch.provider,
        similarity: faceMatch.similarity,
        threshold: faceMatch.threshold,
        sourceFaceConfidence: faceMatch.sourceFaceConfidence
      },
      consent: { acceptedAt: new Date(), policyVersion: 'identity-access-v1' },
      verifiedAt: new Date()
    };
    await user.save();
    await user.populate('store');
    await attachStoreRolePolicy(user);
    await ActivityLog.create({
      user: user._id,
      action: 'identity_verified',
      details: 'Existing account completed government ID and live face-match verification',
      ipAddress: req.ip
    }).catch(() => {});

    const safe = withProfessionalVerificationState(sanitizeUser(user), user);
    safe.permissions = serializeEffectivePermissionMap(user);
    return res.json({ success: true, message: 'Identity verification completed.', user: safe });
  } catch (error) {
    if (error?.statusCode && error?.code) {
      return res.status(error.statusCode).json({ code: error.code, message: error.message });
    }
    console.error('Existing account identity verification failed');
    return res.status(500).json({ message: 'Identity verification failed.' });
  } finally {
    for (const file of [governmentIdImage, selfieImage]) {
      if (Buffer.isBuffer(file?.buffer)) file.buffer.fill(0);
    }
  }
};

const updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const user = await User.findById(req.user._id).select('+identityVerification');
    if (!user) return res.status(404).json({ message: 'User not found' });
    applyProfileUpdates(user, pickProfileUpdates(req.body));
    await user.save();
    await user.populate('store');
    return res.json({ success: true, user: withProfessionalVerificationState(sanitizeUser(user), user) });
  } catch (error) {
    return res.status(500).json({ message: 'Profile update failed' });
  }
};

const changePassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');
    if (!user || !(await user.comparePassword(currentPassword))) {
      return res.status(400).json({ message: 'Current password incorrect' });
    }

    user.password = newPassword;
    user.requiresPasswordChange = false;
    await user.save();
    return res.json({
      success: true,
      message: 'Password changed successfully',
      requiresPasswordChange: false
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to change password' });
  }
};

const toggle2FA = async (req, res) => {
  try {
    if (typeof req.body.enabled !== 'boolean') {
      return res.status(400).json({ message: 'enabled must be a boolean' });
    }
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.twoFactorEnabled = req.body.enabled;
    await user.save();
    return res.json({ success: true, enabled: user.twoFactorEnabled });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to toggle 2FA' });
  }
};

const logout = async (_req, res) => res.status(204).send();

// Compatibility endpoint: public registration follows the same secure OTP flow.
const register = sendRegisterOTP;

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
  verify2FA,
  verifyCurrentUserIdentity,
  logout,
  __test: { generateToken, userSummary }
};
