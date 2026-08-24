const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET ||= 'test-only-jwt-secret';

const User = require('../models/User');
const Otp = require('../models/Otp');
const {
  pickProfileUpdates,
  applyProfileUpdates,
  sanitizeUser,
  buildPublicRegistrationData
} = require('../utils/authSecurity');
const otpService = require('../services/otpService');
const { verifyRecaptcha, getPublicRecaptchaConfig, __test: captchaTest } = require('../utils/captchaVerifier');
const { createRateLimiter, __test: rateLimitTest } = require('../middleware/authRateLimit');

test('customer profile updates allow personal fields and reject privilege fields', () => {
  const maliciousPayload = {
    firstName: 'Updated',
    lastName: 'Customer',
    phone: '09171234567',
    avatar: 'https://example.com/avatar.png',
    address: {
      street: 'Safe Street',
      city: 'Bacoor',
      coordinates: { lat: 14.4, lng: 120.9, adminOverride: true },
      owner: 'forbidden'
    },
    role: 'super_admin',
    permissions: { '*': true },
    store: 'another-store',
    isActive: false,
    staffType: 'manager',
    createdBy: 'attacker',
    isDeleted: true,
    password: 'plaintext',
    twoFactorSecret: 'secret'
  };

  const updates = pickProfileUpdates(maliciousPayload);
  assert.deepEqual(updates, {
    firstName: 'Updated',
    lastName: 'Customer',
    phone: '09171234567',
    avatar: 'https://example.com/avatar.png',
    address: {
      street: 'Safe Street',
      city: 'Bacoor',
      coordinates: { lat: 14.4, lng: 120.9 }
    }
  });

  const user = {
    role: 'customer',
    permissions: {},
    store: 'original-store',
    isActive: true,
    staffType: null,
    createdBy: null,
    address: { province: 'Cavite' }
  };
  applyProfileUpdates(user, updates);
  assert.equal(user.role, 'customer');
  assert.deepEqual(user.permissions, {});
  assert.equal(user.store, 'original-store');
  assert.equal(user.isActive, true);
  assert.equal(user.staffType, null);
  assert.equal(user.createdBy, null);
  assert.equal(user.firstName, 'Updated');
  assert.equal(user.address.province, 'Cavite');
  assert.equal(user.address.city, 'Bacoor');
});

test('profile responses remove password and two-factor secrets', () => {
  const safe = sanitizeUser({
    _id: 'user-id',
    email: 'customer@example.com',
    role: 'customer',
    password: 'hash',
    twoFactorSecret: 'secret',
    __v: 2
  });
  assert.deepEqual(safe, { _id: 'user-id', email: 'customer@example.com', role: 'customer' });
  assert.equal(User.schema.path('password').options.select, false);
  assert.equal(User.schema.path('twoFactorSecret').options.select, false);
});

test('public registration always creates a customer regardless of submitted role', () => {
  const data = buildPublicRegistrationData({
    username: 'customer',
    email: 'customer@example.com',
    password: 'hash',
    role: 'super_admin',
    permissions: { '*': true },
    store: 'forbidden'
  });
  assert.equal(data.role, 'customer');
  assert.equal(data.permissions, undefined);
  assert.equal(data.store, undefined);

  const routeSource = fs.readFileSync(path.join(__dirname, '../routes/auth.js'), 'utf8');
  assert.match(routeSource, /Public registration only creates customer accounts/);
  assert.doesNotMatch(routeSource, /isIn\(\['super_admin', 'admin', 'customer'\]\)/);
});

test('OTP generation and storage helpers use protected six-digit codes', () => {
  const codes = new Set(Array.from({ length: 100 }, () => otpService.generateOTP()));
  assert.equal(codes.size > 95, true);
  for (const code of codes) assert.match(code, /^\d{6}$/);

  const code = otpService.generateOTP();
  const otpHash = otpService.__test.hashOTP(code);
  assert.notEqual(otpHash, code);
  assert.equal(otpService.__test.matchesOTP(code, { otpHash }), true);
  assert.equal(otpService.__test.matchesOTP('000000', { otpHash }), false);
  assert.equal(Otp.schema.path('otpHash').options.select, false);
  assert.equal(Otp.schema.path('userData').options.select, false);
  assert.equal(Otp.schema.path('maxAttempts').options.default, 5);
});

test('the previous frontend-controlled CAPTCHA bypass is rejected', async () => {
  assert.equal(await verifyRecaptcha('manual_verification_success'), false);
  assert.equal(await verifyRecaptcha(''), false);
});

test('temporary UAT bypass removes CAPTCHA from login and registration but keeps password recovery protected', () => {
  const controllerSource = fs.readFileSync(path.join(__dirname, '../controllers/authController.js'), 'utf8');
  const registerStart = controllerSource.indexOf('const sendRegisterOTP = async');
  const registerEnd = controllerSource.indexOf('const verifyRegisterOTP = async', registerStart);
  const loginStart = controllerSource.indexOf('const login = async');
  const loginEnd = controllerSource.indexOf('const verify2FA = async', loginStart);
  const passwordResetStart = controllerSource.indexOf('const requestPasswordResetOTP = async');
  const passwordResetEnd = controllerSource.indexOf('const verifyOTPAndResetPassword = async', passwordResetStart);
  const registerSource = controllerSource.slice(registerStart, registerEnd);
  const loginSource = controllerSource.slice(loginStart, loginEnd);
  const passwordResetSource = controllerSource.slice(passwordResetStart, passwordResetEnd);
  const routeSource = fs.readFileSync(path.join(__dirname, '../routes/auth.js'), 'utf8');
  const loginPageSource = fs.readFileSync(path.join(__dirname, '../client/src/pages/auth/Login.js'), 'utf8');
  const registerPageSource = fs.readFileSync(path.join(__dirname, '../client/src/pages/auth/Register.js'), 'utf8');
  const sellerJoinSource = fs.readFileSync(path.join(__dirname, '../client/src/pages/public/SellerJoin.js'), 'utf8');
  const forgotPasswordSource = fs.readFileSync(path.join(__dirname, '../client/src/pages/auth/ForgotPassword.js'), 'utf8');

  assert.equal(loginSource.includes('verifyRecaptcha'), false);
  assert.equal(loginSource.includes('captchaToken'), false);
  assert.equal(registerSource.includes('verifyRecaptcha'), false);
  assert.equal(registerSource.includes('captchaToken'), false);
  assert.match(passwordResetSource, /verifyRecaptcha\(captchaToken, req\.ip\)/);
  assert.match(routeSource, /router\.post\('\/login', authRateLimits\.authIp, authRateLimits\.login, loginValidation, login\)/);
  assert.match(routeSource, /router\.post\('\/register\/send-otp', authRateLimits\.authIp, authRateLimits\.otpSend, registerValidation, sendRegisterOTP\)/);
  assert.match(routeSource, /router\.post\('\/request-password-reset', authRateLimits\.authIp, authRateLimits\.otpSend, emailValidation, requestPasswordResetOTP\)/);
  assert.equal(loginPageSource.includes('PremiumCaptcha'), false);
  assert.equal(loginPageSource.includes('captchaToken'), false);
  assert.equal(registerPageSource.includes('PremiumCaptcha'), false);
  assert.equal(registerPageSource.includes('captchaToken'), false);
  assert.equal(sellerJoinSource.includes('PremiumCaptcha'), false);
  assert.equal(sellerJoinSource.includes('captchaToken'), false);
  assert.match(forgotPasswordSource, /PremiumCaptcha/);
  assert.match(forgotPasswordSource, /requestPasswordResetOTP\(\{ email, captchaToken \}\)/);
});

test('production rejects Google test credentials and does not invent a site key', () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousSecret = process.env.RECAPTCHA_SECRET_KEY;
  const previousSiteKey = process.env.RECAPTCHA_SITE_KEY;
  const previousReactSiteKey = process.env.REACT_APP_RECAPTCHA_SITE_KEY;
  process.env.NODE_ENV = 'production';
  process.env.RECAPTCHA_SECRET_KEY = captchaTest.GOOGLE_TEST_SECRET;
  process.env.RECAPTCHA_SITE_KEY = captchaTest.GOOGLE_TEST_SITE_KEY;
  delete process.env.REACT_APP_RECAPTCHA_SITE_KEY;
  assert.equal(captchaTest.getSecretKey(), null);
  assert.equal(captchaTest.getSiteKey(), null);
  assert.deepEqual(getPublicRecaptchaConfig(), {
    provider: 'google-recaptcha-v2',
    configured: false,
    siteKey: null
  });
  if (previousEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousEnvironment;
  if (previousSecret === undefined) delete process.env.RECAPTCHA_SECRET_KEY;
  else process.env.RECAPTCHA_SECRET_KEY = previousSecret;
  if (previousSiteKey === undefined) delete process.env.RECAPTCHA_SITE_KEY;
  else process.env.RECAPTCHA_SITE_KEY = previousSiteKey;
  if (previousReactSiteKey === undefined) delete process.env.REACT_APP_RECAPTCHA_SITE_KEY;
  else process.env.REACT_APP_RECAPTCHA_SITE_KEY = previousReactSiteKey;
});

test('CAPTCHA component loads production configuration without a hardcoded fallback key', () => {
  const captchaSource = fs.readFileSync(
    path.join(__dirname, '../client/src/components/PremiumCaptcha.js'),
    'utf8'
  );

  assert.doesNotMatch(captchaSource, /PAWZZLE_PRODUCTION_SITE_KEY|6LckpYUt/);
  assert.match(captchaSource, /api\.get\('\/public\/captcha-config'\)/);
});

test('public CAPTCHA configuration exposes only the site key', () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousSiteKey = process.env.RECAPTCHA_SITE_KEY;
  const previousSecret = process.env.RECAPTCHA_SECRET_KEY;
  process.env.NODE_ENV = 'production';
  process.env.RECAPTCHA_SITE_KEY = 'production-public-site-key';
  process.env.RECAPTCHA_SECRET_KEY = 'production-private-secret';

  const config = getPublicRecaptchaConfig();
  assert.deepEqual(config, {
    provider: 'google-recaptcha-v2',
    configured: true,
    siteKey: 'production-public-site-key'
  });
  assert.equal(JSON.stringify(config).includes('production-private-secret'), false);

  if (previousEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousEnvironment;
  if (previousSiteKey === undefined) delete process.env.RECAPTCHA_SITE_KEY;
  else process.env.RECAPTCHA_SITE_KEY = previousSiteKey;
  if (previousSecret === undefined) delete process.env.RECAPTCHA_SECRET_KEY;
  else process.env.RECAPTCHA_SECRET_KEY = previousSecret;
});

test('authentication rate limiter blocks requests beyond its configured limit', () => {
  rateLimitTest.buckets.clear();
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, prefix: 'test', keyGenerator: () => 'identity' });
  const req = { ip: '127.0.0.1', body: { email: 'user@example.com' } };
  const responses = [];
  const response = () => ({
    set() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { responses.push({ code: this.statusCode, body }); return this; }
  });
  let nextCount = 0;
  limiter(req, response(), () => { nextCount += 1; });
  limiter(req, response(), () => { nextCount += 1; });
  limiter(req, response(), () => { nextCount += 1; });
  assert.equal(nextCount, 2);
  assert.equal(responses[0].code, 429);
});

test('password mutation paths use document save hooks instead of query updates', () => {
  const source = fs.readFileSync(path.join(__dirname, '../controllers/authController.js'), 'utf8');
  assert.match(source, /user\.password = newPassword;\s+(?:user\.requiresPasswordChange = false;\s+)?await user\.save\(\)/);
  assert.doesNotMatch(source, /findByIdAndUpdate\([^\n]+password/);
});
