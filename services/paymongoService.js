const axios = require('axios');

const PAYMONGO_BASE_URL = 'https://api.paymongo.com/v1';

const buildCheckoutIdempotencyKey = (type, recordId, version) => `pawzzle-${type}-${recordId}-v${version}`;

const getSecretKey = () => {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) {
    const error = new Error('PayMongo is not configured.');
    error.statusCode = 503;
    throw error;
  }
  return key;
};

const headers = (extra = {}) => ({
  'Content-Type': 'application/json',
  Authorization: `Basic ${Buffer.from(`${getSecretKey()}:`).toString('base64')}`,
  ...extra
});

const createCheckoutSession = async (attributes, idempotencyKey) => {
  const response = await axios.post(`${PAYMONGO_BASE_URL}/checkout_sessions`, {
    data: { attributes }
  }, { headers: headers({ 'Idempotency-Key': idempotencyKey }) });
  return response.data.data;
};

const getCheckoutSession = async (sessionId) => {
  const response = await axios.get(`${PAYMONGO_BASE_URL}/checkout_sessions/${sessionId}`, {
    headers: headers()
  });
  return response.data.data;
};

const expireCheckoutSession = async (sessionId) => {
  const response = await axios.post(`${PAYMONGO_BASE_URL}/checkout_sessions/${sessionId}/expire`, {}, {
    headers: headers({ 'Idempotency-Key': `expire-${sessionId}` })
  });
  return response.data.data;
};

const getPaidPayment = (session) => session?.attributes?.payments
  ?.find(payment => payment?.attributes?.status === 'paid');

module.exports = {
  createCheckoutSession,
  getCheckoutSession,
  expireCheckoutSession,
  getPaidPayment,
  buildCheckoutIdempotencyKey
};
