const axios = require('axios');

/**
 * Verifies a Google reCAPTCHA v2 token with Google's API
 * @param {string} token - The g-recaptcha-response token from frontend
 * @returns {Promise<boolean>} - True if valid, false otherwise
 */
const verifyRecaptcha = async (token) => {
  if (!token) return false;
  
  // For development, if keys are missing, we might want to skip or return true?
  // But the prompt asks for REAL and FUNCTIONAL.
  // I will assume keys will be provided.
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  
  if (!secretKey) {
    console.warn('⚠️ RECAPTCHA_SECRET_KEY is missing from environment variables. Captcha verification will fail.');
    // In dev mode with NO key, we might want to let it pass if strictly necessary, 
    // but the user asked for REAL and FUNCTIONAL.
    return false; 
  }

  try {
    const response = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`
    );
    
    return response.data.success;
  } catch (error) {
    console.error('reCAPTCHA Verification Error:', error.message);
    return false;
  }
};

module.exports = { verifyRecaptcha };
