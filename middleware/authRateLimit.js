const buckets = new Map();

const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';

const createRateLimiter = ({ windowMs, max, prefix, keyGenerator }) => (req, res, next) => {
  const now = Date.now();
  const identity = keyGenerator
    ? keyGenerator(req)
    : `${req.ip || req.socket?.remoteAddress || 'unknown'}:${normalizeEmail(req.body?.email)}`;
  const key = `${prefix}:${identity}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  if (current.count >= max) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ message: 'Too many attempts. Please wait before trying again.' });
  }

  current.count += 1;
  return next();
};

const ipKey = req => req.ip || req.socket?.remoteAddress || 'unknown';
const accountKey = req => `${req.ip || req.socket?.remoteAddress || 'unknown'}:${normalizeEmail(req.body?.email)}`;

const authRateLimits = {
  login: createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10, prefix: 'login', keyGenerator: accountKey }),
  otpSend: createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5, prefix: 'otp-send', keyGenerator: accountKey }),
  otpVerify: createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10, prefix: 'otp-verify', keyGenerator: accountKey }),
  authIp: createRateLimiter({ windowMs: 15 * 60 * 1000, max: 30, prefix: 'auth-ip', keyGenerator: ipKey })
};

module.exports = { createRateLimiter, authRateLimits, __test: { buckets, normalizeEmail } };
