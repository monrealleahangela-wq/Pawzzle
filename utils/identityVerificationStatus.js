const STRICT_FACE_MATCH_VERSION = 'strict-face-match-v2';
const MINIMUM_FACE_MATCH_THRESHOLD = 99;
const MINIMUM_FACE_CONFIDENCE = 90;

// Normal authentication only needs the immutable verification result metadata.
// Never hydrate the encrypted government-ID image for every authenticated API
// call; it can be several megabytes and is only needed by the verification
// workflow itself.
// identityVerification is hidden at its parent schema path. Selecting only
// nested `+identityVerification.*` paths does not override that parent and
// silently returns no verification state, which sends verified users back to
// the verification page. Include the parent, then exclude only the large
// encrypted image so session checks receive the strict metadata without
// loading several megabytes on every request.
const IDENTITY_VERIFICATION_AUTH_PROJECTION =
  '+identityVerification -identityVerification.governmentId.encryptedImage';

const finiteNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const hasVerifiedIdentityEvidence = user => {
  const verification = user?.identityVerification;
  const faceMatch = verification?.faceMatch;
  const similarity = finiteNumber(faceMatch?.similarity);
  const threshold = finiteNumber(faceMatch?.threshold);
  const sourceConfidence = finiteNumber(faceMatch?.sourceFaceConfidence);
  const targetConfidence = finiteNumber(faceMatch?.targetFaceConfidence);
  const targetFaceCount = finiteNumber(faceMatch?.targetFaceCount);

  return verification?.status === 'verified'
    && verification.verificationVersion === STRICT_FACE_MATCH_VERSION
    && Boolean(verification.governmentId?.documentType)
    && ['image/jpeg', 'image/png'].includes(verification.governmentId?.mimeType)
    && finiteNumber(verification.governmentId?.size) > 0
    && faceMatch?.provider === 'aws_rekognition'
    && threshold !== null
    && threshold >= MINIMUM_FACE_MATCH_THRESHOLD
    && threshold <= 100
    && similarity !== null
    && similarity >= threshold
    && sourceConfidence !== null
    && sourceConfidence >= MINIMUM_FACE_CONFIDENCE
    && targetConfidence !== null
    && targetConfidence >= MINIMUM_FACE_CONFIDENCE
    && targetFaceCount === 1
    && Boolean(verification.consent?.acceptedAt)
    && Boolean(verification.verifiedAt);
};

const getIdentityVerificationStatus = user => {
  if (hasVerifiedIdentityEvidence(user)) return 'verified';
  const status = user?.identityVerification?.status;
  return ['review_required', 'rejected'].includes(status) ? status : 'not_verified';
};

module.exports = {
  STRICT_FACE_MATCH_VERSION,
  MINIMUM_FACE_MATCH_THRESHOLD,
  MINIMUM_FACE_CONFIDENCE,
  IDENTITY_VERIFICATION_AUTH_PROJECTION,
  hasVerifiedIdentityEvidence,
  getIdentityVerificationStatus
};
