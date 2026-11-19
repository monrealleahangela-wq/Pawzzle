const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const { GOVERNMENT_ID_TYPES, isGovernmentIdType } = require('../config/governmentIds');
const {
  encryptIdentityDocument,
  decryptIdentityDocument,
  matchesImageSignature,
  getFaceMatchThreshold,
  resolveRekognitionRegion,
  resolveRekognitionCredentials,
  compareIdentityFaces
} = require('../utils/identityVerification');
const { hasVerifiedIdentity, isIdentityRecoveryRoute, isProfessionalRecoveryRoute } = require('../middleware/auth');
const { requiresIdentityVerification } = require('../config/permissions');
const { __test: authControllerTest } = require('../controllers/authController');

test('government ID types and registration identity fields are constrained', () => {
  assert.equal(isGovernmentIdType('passport'), true);
  assert.equal(isGovernmentIdType('student_id'), false);
  assert.equal(GOVERNMENT_ID_TYPES.includes('philsys_id'), true);
  assert.ok(User.schema.path('middleName'));
  assert.equal(User.schema.path('identityVerification').options.select, false);
});

test('government ID encryption round-trips with authenticated AES-256-GCM', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const image = Buffer.from('synthetic-government-id-image');
  const encrypted = encryptIdentityDocument(image, key);
  assert.match(encrypted, /^v1:/);
  assert.equal(encrypted.includes(image.toString()), false);
  assert.deepEqual(decryptIdentityDocument(encrypted, key), image);
  assert.throws(() => decryptIdentityDocument(`${encrypted.slice(0, -2)}aa`, key));
});

test('identity image signatures and face-match threshold fail closed', () => {
  assert.equal(matchesImageSignature(Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg'), true);
  assert.equal(matchesImageSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'), true);
  assert.equal(matchesImageSignature(Buffer.from('not an image'), 'image/jpeg'), false);
  assert.equal(getFaceMatchThreshold(95), 95);
  assert.throws(() => getFaceMatchThreshold(79), error => error.code === 'IDENTITY_FACE_MATCH_INVALID_THRESHOLD');
});

test('Rekognition region resolution supports deployment overrides and a Philippines-near default', () => {
  assert.equal(resolveRekognitionRegion({ AWS_REKOGNITION_REGION: 'us-west-2', AWS_REGION: 'eu-west-1' }), 'us-west-2');
  assert.equal(resolveRekognitionRegion({ AWS_REGION: 'eu-west-1' }), 'eu-west-1');
  assert.equal(resolveRekognitionRegion({ AWS_DEFAULT_REGION: 'us-east-1' }), 'us-east-1');
  assert.equal(resolveRekognitionRegion({ AWS_REKOGNITION_REGION: '  ', AWS_REGION: 'ap-northeast-1' }), 'ap-northeast-1');
  assert.equal(resolveRekognitionRegion({}), 'ap-southeast-1');
});

test('Rekognition credentials are trimmed and incomplete Render configuration fails clearly', () => {
  assert.equal(resolveRekognitionCredentials({}), null);
  assert.deepEqual(resolveRekognitionCredentials({
    AWS_ACCESS_KEY_ID: '  AKIAEXAMPLE  ',
    AWS_SECRET_ACCESS_KEY: '  secret-value  ',
    AWS_SESSION_TOKEN: '  session-value  '
  }), {
    accessKeyId: 'AKIAEXAMPLE',
    secretAccessKey: 'secret-value',
    sessionToken: 'session-value'
  });
  assert.throws(
    () => resolveRekognitionCredentials({ AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE' }),
    error => error.code === 'IDENTITY_FACE_MATCH_CREDENTIALS_INCOMPLETE'
  );
});

test('Render declares every required face-match deployment setting without committing secrets', () => {
  const render = fs.readFileSync(path.join(__dirname, '../render.yaml'), 'utf8');
  assert.match(render, /key: AWS_REKOGNITION_REGION\s+value: ap-southeast-1/);
  for (const key of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'IDENTITY_DOCUMENT_ENCRYPTION_KEY']) {
    assert.match(render, new RegExp(`key: ${key}\\s+sync: false`));
  }
  assert.doesNotMatch(render, /key: AWS_SECRET_ACCESS_KEY\s+value:/);
  assert.doesNotMatch(render, /key: IDENTITY_DOCUMENT_ENCRYPTION_KEY\s+value:/);
});

test('face comparison sends only in-memory bytes and enforces the threshold', async () => {
  let input;
  const client = { send: async command => {
    input = command.input;
    return { FaceMatches: [{ Similarity: 97.2 }], SourceImageFace: { Confidence: 99.1 } };
  } };
  const id = Buffer.from('id-bytes');
  const selfie = Buffer.from('selfie-bytes');
  const result = await compareIdentityFaces(id, selfie, { client, threshold: 95 });
  assert.equal(result.matched, true);
  assert.equal(result.similarity, 97.2);
  assert.deepEqual(input.SourceImage.Bytes, id);
  assert.deepEqual(input.TargetImage.Bytes, selfie);
  assert.equal(input.QualityFilter, 'HIGH');
  assert.equal(input.SimilarityThreshold, 95);
});

test('face comparison reports actionable AWS credential and permission failures', async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    for (const [providerError, expectedCode] of [
      ['CredentialsProviderError', 'IDENTITY_FACE_MATCH_CREDENTIALS_MISSING'],
      ['UnrecognizedClientException', 'IDENTITY_FACE_MATCH_CREDENTIALS_INVALID'],
      ['AccessDeniedException', 'IDENTITY_FACE_MATCH_ACCESS_DENIED']
    ]) {
      const client = { send: async () => { throw Object.assign(new Error('provider failure'), { name: providerError }); } };
      await assert.rejects(
        compareIdentityFaces(Buffer.from('id'), Buffer.from('selfie'), { client }),
        error => error.code === expectedCode && error.statusCode === 503
      );
    }
  } finally {
    console.error = originalConsoleError;
  }
});

test('all public account creation paths enforce identity verification', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../routes/auth.js'), 'utf8');
  const controller = fs.readFileSync(path.join(__dirname, '../controllers/authController.js'), 'utf8');
  const passport = fs.readFileSync(path.join(__dirname, '../config/passport.js'), 'utf8');
  assert.match(routes, /body\('firstName'\).*\.notEmpty\(\)/);
  assert.match(routes, /body\('governmentIdType'\)\.custom\(isGovernmentIdType\)/);
  assert.match(routes, /uploadRegistrationIdentity, handleUploadError, otpVerificationValidation/);
  assert.match(controller, /compareIdentityFaces\(governmentIdImage\.buffer, selfieImage\.buffer\)/);
  assert.doesNotMatch(controller, /extractGovernmentId|readGovernmentId/);
  assert.doesNotMatch(routes, /identity\/read-document/);
  assert.match(controller, /typeVerificationMethod: 'applicant_declaration'/);
  assert.match(controller, /delete userData\.governmentIdType/);
  assert.doesNotMatch(controller, /selfieImage\.buffer[^\n]*identityVerification/);
  assert.match(passport, /IDENTITY_VERIFICATION_REQUIRED/);
  assert.doesNotMatch(passport, /user = new User/);
});

test('verified identity is mandatory while only recovery endpoints remain reachable', () => {
  assert.equal(hasVerifiedIdentity({ identityVerification: { status: 'verified' } }), true);
  assert.equal(hasVerifiedIdentity({ identityVerification: { status: 'review_required' } }), false);
  assert.equal(hasVerifiedIdentity({}), false);
  for (const route of ['/me', '/identity/verify', '/change-password', '/logout']) {
    assert.equal(isIdentityRecoveryRoute({ baseUrl: '/api/auth', path: route }), true);
  }
  assert.equal(isIdentityRecoveryRoute({ baseUrl: '/api/auth', path: '/profile' }), false);
  assert.equal(isIdentityRecoveryRoute({ baseUrl: '/api/orders', path: '/' }), false);
});

test('pending professionals may finish identity verification and submit credentials before admin approval', () => {
  for (const route of ['/me', '/identity/verify', '/change-password', '/logout']) {
    assert.equal(isProfessionalRecoveryRoute({ baseUrl: '/api/auth', path: route }), true);
  }
  for (const route of ['/me/professional-profile', '/me/credentials']) {
    assert.equal(isProfessionalRecoveryRoute({ baseUrl: '/api/staff', path: route }), true);
  }
  assert.equal(isProfessionalRecoveryRoute({ baseUrl: '/api/staff', path: '/me/attendance' }), false);
  assert.equal(isProfessionalRecoveryRoute({ baseUrl: '/api/orders', path: '/' }), false);
});

test('platform administrators are exempt from the one-time identity gate', () => {
  assert.equal(requiresIdentityVerification({ role: 'super_admin' }), false);
  assert.equal(requiresIdentityVerification({ role: 'platform_admin' }), false);
  assert.equal(requiresIdentityVerification({ role: 'customer' }), true);
  assert.equal(requiresIdentityVerification({ role: 'admin' }), true);
  assert.equal(requiresIdentityVerification({
    role: 'customer',
    identityVerification: { status: 'verified' }
  }), false);
});

test('login summaries expose identity state without exposing the encrypted ID', () => {
  const summary = authControllerTest.userSummary({
    _id: 'user-1', email: 'user@example.com', role: 'customer',
    identityVerification: { status: 'verified', governmentId: { encryptedImage: 'secret' } }
  });
  assert.equal(summary.identityVerificationStatus, 'verified');
  assert.equal(summary.identityVerification, undefined);
  assert.equal(JSON.stringify(summary).includes('secret'), false);
});

test('HTTP and socket feature access fail closed until face matching succeeds', () => {
  const middleware = fs.readFileSync(path.join(__dirname, '../middleware/auth.js'), 'utf8');
  const routes = fs.readFileSync(path.join(__dirname, '../routes/auth.js'), 'utf8');
  const controller = fs.readFileSync(path.join(__dirname, '../controllers/authController.js'), 'utf8');
  const sockets = fs.readFileSync(path.join(__dirname, '../services/socketAuthorization.js'), 'utf8');
  assert.match(middleware, /select\('\+identityVerification'\)/);
  assert.match(middleware, /IDENTITY_VERIFICATION_REQUIRED/);
  assert.match(middleware, /requiresIdentityVerification\(user\)/);
  assert.match(routes, /router\.post\('\/identity\/verify',[\s\S]*authenticate[\s\S]*authRateLimits\.identityVerification[\s\S]*uploadRegistrationIdentity[\s\S]*verifyCurrentUserIdentity/);
  assert.match(controller, /policyVersion: 'identity-access-v1'/);
  assert.match(controller, /file\.buffer\.fill\(0\)/);
  assert.match(sockets, /Identity verification required/);
  assert.match(sockets, /requiresIdentityVerification\(user\)/);
});

test('identity verification is idempotent for accounts already verified in the database', () => {
  const controller = fs.readFileSync(path.join(__dirname, '../controllers/authController.js'), 'utf8');
  assert.match(
    controller,
    /identityVerification\?\.status === 'verified'[\s\S]*alreadyVerified: true[\s\S]*Pawzzle features are unlocked[\s\S]*user: safe/
  );
  assert.doesNotMatch(controller, /IDENTITY_ALREADY_VERIFIED', message: 'This account is already identity verified/);
});

test('every authentication path selects the hidden identity record before applying the one-time gate', () => {
  const files = [
    '../middleware/auth.js',
    '../controllers/authController.js',
    '../routes/auth.js',
    '../services/socketAuthorization.js'
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
    assert.doesNotMatch(source, /\+identityVerification\.status/);
  }
  const controller = fs.readFileSync(path.join(__dirname, '../controllers/authController.js'), 'utf8');
  assert.match(controller, /select\('\+password \+identityVerification'\)/);
  assert.match(controller, /select\('\+identityVerification'\)/);
});
