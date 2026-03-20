// Re-export from the main OTP service for backward compatibility
const { generateOTP, sendRegistrationOTP, sendPasswordResetOTP, sendOTPEmail } = require('../services/otpService');

module.exports = {
  generateOTP,
  sendRegistrationOTP,
  sendPasswordResetOTP,
  sendOTPEmail
};
