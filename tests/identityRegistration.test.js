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
  compareIdentityFaces
} = require('../utils/identityVerification');

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

test('all public account creation paths enforce identity verification', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../routes/auth.js'), 'utf8');
  const controller = fs.readFileSync(path.join(__dirname, '../controllers/authController.js'), 'utf8');
  const passport = fs.readFileSync(path.join(__dirname, '../config/passport.js'), 'utf8');
  assert.match(routes, /body\('firstName'\).*\.notEmpty\(\)/);
  assert.match(routes, /body\('governmentIdType'\)\.custom\(isGovernmentIdType\)/);
  assert.match(routes, /uploadRegistrationIdentity, handleUploadError, otpVerificationValidation/);
  assert.match(controller, /compareIdentityFaces\(governmentIdImage\.buffer, selfieImage\.buffer\)/);
  assert.match(controller, /delete userData\.governmentIdType/);
  assert.doesNotMatch(controller, /selfieImage\.buffer[^\n]*identityVerification/);
  assert.match(passport, /IDENTITY_VERIFICATION_REQUIRED/);
  assert.doesNotMatch(passport, /user = new User/);
});
