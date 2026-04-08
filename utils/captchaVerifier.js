const axios = require('axios');

/**
 * Verifies a Google reCAPTCHA v2 token with Google's API
 * @param {string} token - The g-recaptcha-response token from frontend
 * @returns {Promise<boolean>} - True if valid, false otherwise
 */
const verifyRecaptcha = async (token) => {
  if (!token) return false;
  
  const secretKey = process.env.RECAPTCHA_SECRET_KEY || '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe';

  try {
    const response = await axios.get(
      `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`
    );
    
    return response.data.success;
  } catch (error) {
    console.error('reCAPTCHA Verification Error:', error.message);
    return false;
  }
};

module.exports = { verifyRecaptcha };
