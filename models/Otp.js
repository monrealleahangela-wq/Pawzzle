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
  otp: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['registration', 'password_reset', 'login'],
    required: true
  },
  userData: {
    type: Object,
    default: null
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // MongoDB TTL index – removes document at this exact time
  }
}, { 
  timestamps: true 
});

// Index to find the latest OTP for an email quickly
otpSchema.index({ email: 1, createdAt: -1 });

module.exports = mongoose.model('Otp', otpSchema);
