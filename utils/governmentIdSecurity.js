const crypto = require('crypto');

const configurationError = () => Object.assign(
  new Error('Identity document protection is temporarily unavailable.'),
  { statusCode: 503, code: 'GOVERNMENT_ID_ENCRYPTION_NOT_CONFIGURED' }
);

const getEncryptionKey = (configured = process.env.GOVERNMENT_ID_ENCRYPTION_KEY) => {
  const value = String(configured || '').trim();
  let key = null;
  if (/^[a-f0-9]{64}$/i.test(value)) key = Buffer.from(value, 'hex');
  else if (value) {
    try { key = Buffer.from(value, 'base64'); } catch (_error) { key = null; }
  }
  if (!key || key.length !== 32) throw configurationError();
  return key;
};

const encryptGovernmentId = (buffer, configuredKey) => {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Government ID image is required.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(configuredKey), iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
};

const matchesImageSignature = (buffer, mimeType) => {
  if (!Buffer.isBuffer(buffer)) return false;
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === 'image/webp') {
    return buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
};

const decryptGovernmentId = (value, configuredKey) => {
  const [version, iv, tag, encrypted] = String(value || '').split(':');
  if (version !== 'v1' || !iv || !tag || !encrypted) throw new Error('Protected government ID is invalid.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(configuredKey), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]);
};

module.exports = { getEncryptionKey, encryptGovernmentId, decryptGovernmentId, matchesImageSignature };
