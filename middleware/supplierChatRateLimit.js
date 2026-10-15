// A bounded per-process abuse guard. Authentication and idempotent database
// constraints remain authoritative across instances.
const supplierChatRateLimit = (max, windowMs = 60000) => {
  const requests = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [userId, entry] of requests) if (now - entry.startedAt >= windowMs) requests.delete(userId);
  }, windowMs);
  sweep.unref();
  return (req, res, next) => {
    const userId = String(req.user._id);
    const now = Date.now();
    let entry = requests.get(userId);
    if (!entry || now - entry.startedAt >= windowMs) {
      entry = { startedAt: now, count: 0 };
      requests.set(userId, entry);
    }
    if (++entry.count > max) {
      return res.status(429).json({ message: 'Too many Supplier chat requests. Please wait a moment.' });
    }
    next();
  };
};

module.exports = { supplierChatRateLimit };
