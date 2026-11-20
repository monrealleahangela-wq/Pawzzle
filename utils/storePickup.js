const crypto = require('crypto');

const PICKUP_CODE_LENGTH = 6;

const pickupSecret = () => {
  const secret = String(
    process.env.PICKUP_VERIFICATION_SECRET
      || process.env.JWT_SECRET
      || process.env.SESSION_SECRET
      || ''
  ).trim();
  if (secret.length < 16) {
    const error = new Error('Store pickup verification is temporarily unavailable.');
    error.statusCode = 503;
    error.code = 'PICKUP_VERIFICATION_UNAVAILABLE';
    throw error;
  }
  return secret;
};

const pickupCodeForOrder = (orderId, secret = pickupSecret()) => {
  const digest = crypto
    .createHmac('sha256', secret)
    .update(`pawzzle-store-pickup:${String(orderId)}`)
    .digest();
  const value = digest.readUInt32BE(0) % (10 ** PICKUP_CODE_LENGTH);
  return String(value).padStart(PICKUP_CODE_LENGTH, '0');
};

const isValidPickupCode = value => /^\d{6}$/.test(String(value || '').trim());

const pickupCodeMatches = (orderId, submittedCode, secret) => {
  const submitted = String(submittedCode || '').trim();
  if (!isValidPickupCode(submitted)) return false;
  const expected = pickupCodeForOrder(orderId, secret);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(submitted));
};

const requestFingerprint = ({ ip, userAgent } = {}) => {
  const normalized = `${String(ip || '').trim()}|${String(userAgent || '').trim()}`;
  if (normalized === '|') return undefined;
  return crypto.createHash('sha256').update(normalized).digest('hex');
};

const customerPickupView = order => {
  const value = order?.toObject ? order.toObject() : { ...order };
  if (value?.deliveryMethod !== 'pickup') return value;
  if (value.status !== 'ready_for_pickup' && !value.pickupSession) return value;
  const pickupSession = value.pickupSession || {};
  const publicPickupSession = {
    customerConfirmedAt: pickupSession.customerConfirmedAt,
    sellerConfirmedAt: pickupSession.sellerConfirmedAt,
    verifiedAt: pickupSession.verifiedAt,
    scheduledDate: pickupSession.scheduledDate,
    instructions: pickupSession.instructions,
    location: pickupSession.location
  };
  return {
    ...value,
    pickupSession: {
      ...publicPickupSession,
      ...(value.status === 'ready_for_pickup' ? { customerCode: pickupCodeForOrder(value._id) } : {})
    }
  };
};

module.exports = {
  PICKUP_CODE_LENGTH,
  pickupCodeForOrder,
  pickupCodeMatches,
  isValidPickupCode,
  requestFingerprint,
  customerPickupView
};
