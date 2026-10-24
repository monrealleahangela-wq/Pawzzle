const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const User = require('../models/User');
const { GOVERNMENT_ID_TYPES, isGovernmentIdType } = require('../config/governmentIds');
const { buildPublicRegistrationData, sanitizeUser } = require('../utils/authSecurity');
const { encryptGovernmentId, decryptGovernmentId, getEncryptionKey, matchesImageSignature } = require('../utils/governmentIdSecurity');

const source = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('government ID type list accepts supported IDs and rejects forged values', () => {
  assert.ok(GOVERNMENT_ID_TYPES.includes('philsys_id'));
  assert.ok(GOVERNMENT_ID_TYPES.includes('passport'));
  assert.ok(GOVERNMENT_ID_TYPES.includes('other_government_id'));
  assert.equal(isGovernmentIdType('drivers_license'), true);
  assert.equal(isGovernmentIdType('company_badge'), false);
  assert.equal(isGovernmentIdType(''), false);
});

test('government ID images are authenticated-encrypted before persistence', () => {
  const key = '11'.repeat(32);
  const original = Buffer.from('synthetic-government-id-image');
  const encrypted = encryptGovernmentId(original, key);
  assert.match(encrypted, /^v1:/);
  assert.equal(encrypted.includes(original.toString()), false);
  assert.deepEqual(decryptGovernmentId(encrypted, key), original);
  assert.throws(() => decryptGovernmentId(encrypted, '22'.repeat(32)));
  assert.throws(() => getEncryptionKey('not-a-managed-32-byte-key'), error => {
    assert.equal(error.code, 'GOVERNMENT_ID_ENCRYPTION_NOT_CONFIGURED');
    assert.equal(error.statusCode, 503);
    return true;
  });
});

test('government ID upload verifies image signatures instead of trusting browser metadata', () => {
  assert.equal(matchesImageSignature(Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg'), true);
  assert.equal(matchesImageSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'), true);
  assert.equal(matchesImageSignature(Buffer.from('RIFF0000WEBP'), 'image/webp'), true);
  assert.equal(matchesImageSignature(Buffer.from('<script>alert(1)</script>'), 'image/png'), false);
});

test('user schema keeps government ID protected and optional for existing accounts', () => {
  const governmentIdPath = User.schema.path('governmentId');
  assert.equal(governmentIdPath.options.select, false);
  assert.equal(governmentIdPath.options.required, undefined);
  assert.deepEqual(governmentIdPath.schema.path('documentType').options.enum, GOVERNMENT_ID_TYPES);
  assert.equal(governmentIdPath.schema.path('encryptedImage').options.required, true);

  const safe = sanitizeUser({
    email: 'customer@example.com',
    governmentId: { documentType: 'passport', encryptedImage: 'secret' }
  });
  assert.equal(safe.governmentId, undefined);
});

test('public registration preserves the selected ID type but never trusts an uploaded role', () => {
  const data = buildPublicRegistrationData({
    username: 'customer',
    email: 'customer@example.com',
    password: 'hash',
    governmentIdType: 'passport',
    role: 'super_admin'
  });
  assert.equal(data.governmentIdType, 'passport');
  assert.equal(data.role, 'customer');
});

test('registration routes require an ID type and a single in-memory ID image', () => {
  const route = source('routes/auth.js');
  const upload = source('middleware/upload.js');
  const controller = source('controllers/authController.js');

  assert.match(route, /body\('governmentIdType'\)\.isIn\(GOVERNMENT_ID_TYPES\)/);
  assert.match(route, /register\/verify-otp'[\s\S]*uploadGovernmentId, handleUploadError[\s\S]*verifyRegisterOTP/);
  assert.match(upload, /storage: multer\.memoryStorage\(\)/);
  assert.match(upload, /governmentIdUpload\.single\('governmentIdImage'\)/);
  assert.match(controller, /encryptGovernmentId\(req\.file\.buffer\)/);
  assert.match(controller, /matchesImageSignature\(req\.file\.buffer, req\.file\.mimetype\)/);
  assert.match(controller, /governmentId:[\s\S]*documentType: governmentIdType[\s\S]*encryptedImage/);
});

test('customer and seller registration UIs require one ID selection and image', () => {
  const register = source('client/src/pages/auth/Register.js');
  const sellerJoin = source('client/src/pages/public/SellerJoin.js');
  const authService = source('client/src/services/authService.js');

  for (const page of [register, sellerJoin]) {
    assert.match(page, /name="governmentIdType"/);
    assert.match(page, /governmentIdImage/);
    assert.match(page, /GOVERNMENT_ID_TYPES\.map/);
    assert.match(page, /GOVERNMENT_ID_MAX_BYTES/);
  }
  assert.match(authService, /Content-Type': 'multipart\/form-data'/);
});

test('Google can sign in existing users but cannot bypass ID-backed account creation', () => {
  const passport = source('config/passport.js');
  const route = source('routes/auth.js');
  assert.match(passport, /GOVERNMENT_ID_REQUIRED/);
  assert.doesNotMatch(passport, /user = new User\(/);
  assert.match(route, /register\?notice=government-id-required/);
});
