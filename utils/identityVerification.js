const crypto = require('crypto');
const { RekognitionClient, CompareFacesCommand } = require('@aws-sdk/client-rekognition');
const {
  MINIMUM_FACE_MATCH_THRESHOLD,
  MINIMUM_FACE_CONFIDENCE
} = require('./identityVerificationStatus');

const DEFAULT_REKOGNITION_REGION = 'ap-southeast-1';

const configurationError = (message, code, cause) => {
  const error = Object.assign(new Error(message), {
    statusCode: 503,
    code
  });
  if (cause) Object.defineProperty(error, 'cause', { value: cause });
  return error;
};

const getEncryptionKey = (configured = process.env.IDENTITY_DOCUMENT_ENCRYPTION_KEY || process.env.GOVERNMENT_ID_ENCRYPTION_KEY) => {
  const value = String(configured || '').trim();
  let key = null;
  if (/^[a-f0-9]{64}$/i.test(value)) key = Buffer.from(value, 'hex');
  else if (value) {
    try { key = Buffer.from(value, 'base64'); } catch (_error) { key = null; }
  }
  if (!key || key.length !== 32) {
    throw configurationError(
      'Identity document protection is temporarily unavailable.',
      'IDENTITY_ENCRYPTION_NOT_CONFIGURED'
    );
  }
  return key;
};

const encryptIdentityDocument = (buffer, configuredKey) => {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Identity document image is required.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(configuredKey), iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
};

const decryptIdentityDocument = (value, configuredKey) => {
  const [version, iv, tag, encrypted] = String(value || '').split(':');
  if (version !== 'v1' || !iv || !tag || !encrypted) throw new Error('Protected identity document is invalid.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(configuredKey), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]);
};

const matchesImageSignature = (buffer, mimeType) => {
  if (!Buffer.isBuffer(buffer)) return false;
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  return false;
};

const getFaceMatchThreshold = configured => {
  const value = Number(configured ?? process.env.IDENTITY_FACE_MATCH_THRESHOLD ?? 95);
  if (!Number.isFinite(value) || value < 80 || value > 100) {
    throw configurationError('Identity face-match configuration is invalid.', 'IDENTITY_FACE_MATCH_INVALID_THRESHOLD');
  }
  return Math.max(value, MINIMUM_FACE_MATCH_THRESHOLD);
};

const resolveRekognitionRegion = (environment = process.env) => [
  environment.AWS_REKOGNITION_REGION,
  environment.AWS_REGION,
  environment.AWS_DEFAULT_REGION
].map(value => String(value || '').trim()).find(Boolean) || DEFAULT_REKOGNITION_REGION;

const resolveRekognitionCredentials = (environment = process.env) => {
  const accessKeyId = String(environment.AWS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(environment.AWS_SECRET_ACCESS_KEY || '').trim();
  const sessionToken = String(environment.AWS_SESSION_TOKEN || '').trim();

  if (!accessKeyId && !secretAccessKey && !sessionToken) return null;
  if (!accessKeyId || !secretAccessKey) {
    throw configurationError(
      'AWS Rekognition credentials are incomplete in Render.',
      'IDENTITY_FACE_MATCH_CREDENTIALS_INCOMPLETE'
    );
  }

  return {
    accessKeyId,
    secretAccessKey,
    ...(sessionToken ? { sessionToken } : {})
  };
};

const createRekognitionClient = (environment = process.env) => {
  const credentials = resolveRekognitionCredentials(environment);
  return new RekognitionClient({
    region: resolveRekognitionRegion(environment),
    ...(credentials ? { credentials } : {})
  });
};

const mapFaceMatchError = error => {
  if (['InvalidParameterException', 'InvalidImageFormatException', 'ImageTooLargeException'].includes(error?.name)) {
    return Object.assign(new Error('Use clear ID and selfie images with one unobstructed face in each.'), {
      statusCode: 400,
      code: 'IDENTITY_IMAGE_UNUSABLE'
    });
  }
  if (['CredentialsProviderError', 'CredentialsProviderTimeoutError'].includes(error?.name)) {
    return configurationError(
      'AWS Rekognition credentials are not configured in Render.',
      'IDENTITY_FACE_MATCH_CREDENTIALS_MISSING',
      error
    );
  }
  if (['UnrecognizedClientException', 'InvalidSignatureException', 'ExpiredTokenException'].includes(error?.name)) {
    return configurationError(
      'AWS Rekognition rejected the configured credentials. Replace the Render access key pair.',
      'IDENTITY_FACE_MATCH_CREDENTIALS_INVALID',
      error
    );
  }
  if (['AccessDeniedException', 'UnauthorizedException'].includes(error?.name)) {
    return configurationError(
      'AWS Rekognition permission is missing. Attach rekognition:CompareFaces to the Render IAM user.',
      'IDENTITY_FACE_MATCH_ACCESS_DENIED',
      error
    );
  }
  if (['UnknownEndpoint', 'EndpointError', 'InvalidEndpointException'].includes(error?.name)) {
    return configurationError(
      'AWS Rekognition cannot be reached in the configured region. Check AWS_REKOGNITION_REGION.',
      'IDENTITY_FACE_MATCH_REGION_INVALID',
      error
    );
  }
  return configurationError(
    'Identity face matching is temporarily unavailable.',
    'IDENTITY_FACE_MATCH_UNAVAILABLE',
    error
  );
};

const compareIdentityFaces = async (governmentIdImage, selfieImage, options = {}) => {
  if (!Buffer.isBuffer(governmentIdImage) || !governmentIdImage.length || !Buffer.isBuffer(selfieImage) || !selfieImage.length) {
    throw Object.assign(new Error('Government ID and live selfie images are required.'), {
      statusCode: 400,
      code: 'IDENTITY_IMAGES_REQUIRED'
    });
  }
  const threshold = getFaceMatchThreshold(options.threshold);
  const client = options.client || createRekognitionClient();
  try {
    const response = await client.send(new CompareFacesCommand({
      SourceImage: { Bytes: governmentIdImage },
      TargetImage: { Bytes: selfieImage },
      SimilarityThreshold: threshold,
      QualityFilter: 'HIGH'
    }));
    const faceMatches = response.FaceMatches || [];
    const unmatchedFaces = response.UnmatchedFaces || [];
    const bestMatch = faceMatches.reduce((best, match) => (
      Number(match?.Similarity || 0) > Number(best?.Similarity || 0) ? match : best
    ), null);
    const similarity = Number(bestMatch?.Similarity || 0);
    const sourceFaceConfidence = Number(response.SourceImageFace?.Confidence || 0);
    const targetFaceConfidence = Number(bestMatch?.Face?.Confidence || 0);
    const targetFaceCount = faceMatches.length + unmatchedFaces.length;
    return {
      matched: similarity >= threshold
        && sourceFaceConfidence >= MINIMUM_FACE_CONFIDENCE
        && targetFaceConfidence >= MINIMUM_FACE_CONFIDENCE
        && targetFaceCount === 1,
      similarity,
      threshold,
      provider: 'aws_rekognition',
      sourceFaceConfidence,
      targetFaceConfidence,
      targetFaceCount
    };
  } catch (error) {
    if (error?.statusCode && error?.code) throw error;
    const mappedError = mapFaceMatchError(error);
    if (mappedError.statusCode >= 500) {
      console.error('Identity face-match provider request failed', {
        code: mappedError.code,
        providerError: String(error?.name || 'UnknownError'),
        httpStatusCode: Number(error?.$metadata?.httpStatusCode || 0) || undefined,
        requestId: String(error?.$metadata?.requestId || '') || undefined,
        region: resolveRekognitionRegion()
      });
    }
    throw mappedError;
  }
};

const verifyIdentityFaceMatch = async (governmentIdImage, selfieImage, options = {}) => {
  const result = await compareIdentityFaces(governmentIdImage, selfieImage, options);
  if (result.targetFaceCount !== 1) {
    throw Object.assign(new Error('Keep exactly one unobstructed face in the live selfie and remove other people or face images from view.'), {
      statusCode: 400,
      code: 'IDENTITY_SINGLE_FACE_REQUIRED'
    });
  }
  if (!result.matched) {
    throw Object.assign(new Error('Your live selfie did not match the face on the government ID. Retake both images in clear lighting and try again.'), {
      statusCode: 400,
      code: 'FACE_MATCH_FAILED'
    });
  }
  return result;
};

module.exports = {
  getEncryptionKey,
  encryptIdentityDocument,
  decryptIdentityDocument,
  matchesImageSignature,
  getFaceMatchThreshold,
  resolveRekognitionRegion,
  resolveRekognitionCredentials,
  compareIdentityFaces,
  verifyIdentityFaceMatch
};
