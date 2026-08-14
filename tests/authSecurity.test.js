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
const { verifyRecaptcha, __test: captchaTest } = require('../utils/captchaVerifier');
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

test('Google test CAPTCHA credentials cannot be enabled in production', () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousSecret = process.env.RECAPTCHA_SECRET_KEY;
  process.env.NODE_ENV = 'production';
  process.env.RECAPTCHA_SECRET_KEY = captchaTest.GOOGLE_TEST_SECRET;
  assert.equal(captchaTest.getSecretKey(), null);
  if (previousEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousEnvironment;
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
  assert.match(source, /user\.password = newPassword;\s+await user\.save\(\)/);
  assert.doesNotMatch(source, /findByIdAndUpdate\([^\n]+password/);
});
