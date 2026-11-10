const crypto = require('crypto');

const MINIMUM_SECRET_LENGTH = 32;

const readBearerToken = request => {
  const header = request.get?.('authorization') || request.headers?.authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
};

const secretsMatch = (provided, expected) => {
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  const providedBuffer = Buffer.from(String(provided || ''), 'utf8');
  if (!expectedBuffer.length) return false;
  if (providedBuffer.length !== expectedBuffer.length) {
    crypto.timingSafeEqual(expectedBuffer, Buffer.alloc(expectedBuffer.length));
    return false;
  }
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
};

const requireCronSecret = (request, response, next) => {
  const configuredSecret = String(process.env.STORE_REPORT_CRON_SECRET || '').trim();
  if (configuredSecret.length < MINIMUM_SECRET_LENGTH) {
    console.error('[StoreReportsCron] STORE_REPORT_CRON_SECRET is missing or too short.');
    return response.status(503).json({
      success: false,
      message: 'Scheduled reports are not configured.'
    });
  }

  if (!secretsMatch(readBearerToken(request), configuredSecret)) {
    response.set?.('WWW-Authenticate', 'Bearer');
    return response.status(401).json({
      success: false,
      message: 'Unauthorized.'
    });
  }

  return next();
};

module.exports = {
  MINIMUM_SECRET_LENGTH,
  readBearerToken,
  secretsMatch,
  requireCronSecret
};
