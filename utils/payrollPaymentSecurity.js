const crypto = require('crypto');

const fail = (message, statusCode = 400, code) => Object.assign(new Error(message), { statusCode, code });

const encryptionKey = () => {
  const configured = String(process.env.PAYROLL_DATA_ENCRYPTION_KEY || '').trim();
  let key;
  if (/^[a-f0-9]{64}$/i.test(configured)) key = Buffer.from(configured, 'hex');
  else if (configured) {
    try { key = Buffer.from(configured, 'base64'); } catch (_error) { key = null; }
  }
  if (!key || key.length !== 32) {
    throw fail('Payroll payment encryption is not configured. Set PAYROLL_DATA_ENCRYPTION_KEY to a managed 32-byte key before recording payment evidence.', 503, 'PAYROLL_ENCRYPTION_NOT_CONFIGURED');
  }
  return key;
};

const encryptSensitive = value => {
  const key = encryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
};

const decryptSensitive = value => {
  const [version, iv, tag, encrypted] = String(value || '').split(':');
  if (version !== 'v1' || !iv || !tag || !encrypted) throw fail('Protected payroll data is invalid.', 500, 'PAYROLL_ENCRYPTED_DATA_INVALID');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8'));
  } catch (_error) {
    throw fail('Protected payroll data could not be decrypted.', 500, 'PAYROLL_DECRYPTION_FAILED');
  }
};

const sensitiveFingerprint = value => crypto
  .createHmac('sha256', encryptionKey())
  .update(String(value || '').trim())
  .digest('hex');

const maskValue = value => {
  const clean = String(value || '').replace(/\s+/g, '');
  if (!clean) return '';
  const visible = clean.slice(-4);
  return `${'•'.repeat(Math.max(4, Math.min(8, clean.length - visible.length)))}${visible}`;
};

const maskReference = value => maskValue(value);
const maskAccountNumber = value => maskValue(value);

module.exports = {
  decryptSensitive,
  encryptSensitive,
  encryptionKey,
  maskAccountNumber,
  maskReference,
  sensitiveFingerprint
};
