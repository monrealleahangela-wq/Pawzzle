const mongoose = require('mongoose');

/**
 * OTP Model
 * Stores temporary verification codes with associated user data.
 * Includes a TTL index to automatically remove expired codes.
 */
const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  // Retained temporarily for verification of OTPs created immediately before
  // deployment. New records only store otpHash.
  otp: {
    type: String,
    select: false
  },
  otpHash: {
    type: String,
    select: false
  },
  type: {
    type: String,
    enum: ['registration', 'password_reset', 'login'],
    required: true
  },
  userData: {
    type: Object,
    default: null,
    select: false
  },
  attempts: {
    type: Number,
    default: 0,
    min: 0
  },
  maxAttempts: {
    type: Number,
    default: 5,
    min: 1,
    max: 10
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // MongoDB TTL index – removes document at this exact time
  }
}, { 
  timestamps: true 
});

otpSchema.pre('validate', function requireProtectedCode(next) {
  if (!this.otpHash && !this.otp) return next(new Error('A protected OTP value is required'));
  next();
});

// Index to find the latest OTP for an email quickly
otpSchema.index({ email: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model('Otp', otpSchema);
