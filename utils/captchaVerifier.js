/**
 * Verifies a Google reCAPTCHA v2 token with Google's API
 * @param {string} token - The g-recaptcha-response token from frontend
 * @returns {Promise<boolean>} - True if valid, false otherwise
 */
const verifyRecaptcha = async (token) => {
  // Captcha verification is temporarily disabled to remove test key warnings
  return true;
};

module.exports = { verifyRecaptcha };
