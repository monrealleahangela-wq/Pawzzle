const axios = require('axios');

const GOOGLE_TEST_SITE_KEY = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';
const GOOGLE_TEST_SECRET = '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe';

const getSiteKey = () => {
  const configured = process.env.RECAPTCHA_SITE_KEY || process.env.REACT_APP_RECAPTCHA_SITE_KEY;
  if (process.env.NODE_ENV === 'production') {
    if (!configured || configured === GOOGLE_TEST_SITE_KEY) return null;
    return configured;
  }
  return configured || GOOGLE_TEST_SITE_KEY;
};

const getSecretKey = () => {
  const configured = process.env.RECAPTCHA_SECRET_KEY;
  if (process.env.NODE_ENV === 'production') {
    if (!configured || configured === GOOGLE_TEST_SECRET) return null;
    return configured;
  }
  return configured || GOOGLE_TEST_SECRET;
};

const verifyRecaptcha = async (token, remoteIp) => {
  if (!token || token === 'manual_verification_success') return false;

  const secretKey = getSecretKey();
  if (!secretKey) {
    console.error('reCAPTCHA is not securely configured');
    return false;
  }

  try {
    const form = new URLSearchParams({ secret: secretKey, response: token });
    if (remoteIp) form.set('remoteip', remoteIp);
    const response = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      form.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 5000 }
    );

    if (!response.data?.success) return false;
    const allowedHosts = String(process.env.RECAPTCHA_ALLOWED_HOSTNAMES || '')
      .split(',')
      .map(host => host.trim().toLowerCase())
      .filter(Boolean);
    return !allowedHosts.length || allowedHosts.includes(String(response.data.hostname || '').toLowerCase());
  } catch (error) {
    console.error('reCAPTCHA verification request failed');
    return false;
  }
};

const getPublicRecaptchaConfig = () => {
  const siteKey = getSiteKey();
  return {
    provider: 'google-recaptcha-v2',
    configured: Boolean(siteKey),
    siteKey
  };
};

module.exports = {
  verifyRecaptcha,
  getPublicRecaptchaConfig,
  __test: { getSecretKey, getSiteKey, GOOGLE_TEST_SITE_KEY, GOOGLE_TEST_SECRET }
};
