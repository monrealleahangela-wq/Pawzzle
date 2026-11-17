const crypto = require('crypto');
const { RekognitionClient, CompareFacesCommand } = require('@aws-sdk/client-rekognition');

const configurationError = (message, code) => Object.assign(new Error(message), {
  statusCode: 503,
  code
});

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
  return value;
};

const createRekognitionClient = () => {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (!region) {
    throw configurationError('Identity face matching is temporarily unavailable.', 'IDENTITY_FACE_MATCH_NOT_CONFIGURED');
  }
  return new RekognitionClient({ region });
};

const mapFaceMatchError = error => {
  if (['InvalidParameterException', 'InvalidImageFormatException', 'ImageTooLargeException'].includes(error?.name)) {
    return Object.assign(new Error('Use clear ID and selfie images with one unobstructed face in each.'), {
      statusCode: 400,
      code: 'IDENTITY_IMAGE_UNUSABLE'
    });
  }
  return configurationError('Identity face matching is temporarily unavailable.', 'IDENTITY_FACE_MATCH_UNAVAILABLE');
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
    const similarity = Math.max(0, ...((response.FaceMatches || []).map(match => Number(match.Similarity || 0))));
    return {
      matched: similarity >= threshold,
      similarity,
      threshold,
      provider: 'aws_rekognition',
      sourceFaceConfidence: Number(response.SourceImageFace?.Confidence || 0)
    };
  } catch (error) {
    if (error?.statusCode && error?.code) throw error;
    throw mapFaceMatchError(error);
  }
};

module.exports = {
  getEncryptionKey,
  encryptIdentityDocument,
  decryptIdentityDocument,
  matchesImageSignature,
  getFaceMatchThreshold,
  compareIdentityFaces
};
