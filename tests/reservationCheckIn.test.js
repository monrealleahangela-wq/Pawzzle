const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  QR_PREFIX, getMasterKey, digestSecret, encryptSecret, decryptSecret,
  generateCredentials, normalizeBackupCode, bookingFingerprint,
  zonedLocalTimeToUtc, getCheckInWindow, getWindowState
} = require('../utils/reservationCheckIn');
const { authRateLimits } = require('../middleware/authRateLimit');
const { __test: rateLimitTest } = require('../middleware/authRateLimit');

const paidBooking = overrides => ({
  _id: 'booking-1', customer: 'customer-1', store: 'store-1', service: 'service-1', staff: 'staff-1',
  bookingLocalDate: '2026-10-16', bookingDate: new Date('2026-10-16T00:00:00.000Z'),
  startTime: '14:00', endTime: '15:00', status: 'confirmed', paymentStatus: 'paid',
  proposal: { revision: 2 }, paymentDetails: { paymentId: 'pay-1' }, serviceProgress: { status: 'scheduled' },
  ...overrides
});

test('requires a configured 32-byte reservation encryption key', () => {
  assert.equal(getMasterKey('ab'.repeat(32)).length, 32);
  assert.throws(() => getMasterKey('not-a-key'), error => error.code === 'RESERVATION_KEY_UNAVAILABLE');
});

test('credentials are high entropy and use separate opaque QR and backup values', () => {
  const one = generateCredentials();
  const two = generateCredentials();
  assert.ok(one.qrToken.startsWith(QR_PREFIX));
  assert.equal(Buffer.from(one.qrToken.slice(QR_PREFIX.length), 'base64url').length, 32);
  assert.equal(normalizeBackupCode(one.backupCode).length, 16);
  assert.notEqual(one.qrToken, one.backupCode);
  assert.notEqual(one.qrToken, two.qrToken);
  assert.notEqual(normalizeBackupCode(one.backupCode), normalizeBackupCode(two.backupCode));
});

test('HMAC lookup digests and AES-GCM storage are deterministic only for lookup and authenticated for retrieval', () => {
  const master = getMasterKey('ab'.repeat(32));
  const token = 'opaque-random-token';
  const digest = digestSecret(token, 'qr', master);
  assert.equal(digest, digestSecret(token, 'qr', master));
  assert.notEqual(digest, digestSecret(token, 'backup', master));
  const encrypted = encryptSecret(token, master);
  assert.notEqual(encrypted.ciphertext, Buffer.from(token).toString('hex'));
  assert.equal(decryptSecret(encrypted, master), token);
  assert.throws(() => decryptSecret({ ...encrypted, tag: crypto.randomBytes(16).toString('hex') }, master));
});

test('backup-code normalization accepts common separators without changing its secret value', () => {
  assert.equal(normalizeBackupCode('abcd efgh-jklm-npqr'), 'ABCDEFGHJKLMNPQR');
  assert.equal(normalizeBackupCode('ABCD_EFGH-JKLM-NPQR'), 'ABCD_EFGHJKLMNPQR');
});

test('reservation binding changes when a material appointment assignment changes', () => {
  const booking = paidBooking();
  assert.equal(bookingFingerprint(booking), bookingFingerprint({ ...booking }));
  assert.notEqual(bookingFingerprint(booking), bookingFingerprint({ ...booking, startTime: '14:30' }));
  assert.notEqual(bookingFingerprint(booking), bookingFingerprint({ ...booking, proposal: { revision: 3 } }));
  assert.notEqual(bookingFingerprint(booking), bookingFingerprint({ ...booking, staff: 'staff-2' }));
});

test('Store-local conversion handles offsets, daylight-saving gaps, and ambiguous times safely', () => {
  assert.equal(zonedLocalTimeToUtc('2026-10-16', '14:00', 'Asia/Manila').toISOString(), '2026-10-16T06:00:00.000Z');
  assert.equal(zonedLocalTimeToUtc('2026-03-08', '02:30', 'America/New_York'), null);
  assert.equal(zonedLocalTimeToUtc('2026-11-01', '01:30', 'America/New_York'), null);
  assert.equal(zonedLocalTimeToUtc('2026-11-01', '03:30', 'America/New_York').toISOString(), '2026-11-01T08:30:00.000Z');
});

test('the default check-in window is inclusive at 30 minutes early and 15 minutes after appointment start', () => {
  const booking = paidBooking();
  const window = getCheckInWindow(booking, 'Asia/Manila');
  assert.equal(window.opensAt.toISOString(), '2026-10-16T05:30:00.000Z');
  assert.equal(window.closesAt.toISOString(), '2026-10-16T06:15:00.000Z');
  assert.equal(getWindowState(booking, window.opensAt, 'Asia/Manila').state, 'available');
  assert.equal(getWindowState(booking, window.closesAt, 'Asia/Manila').state, 'available');
  assert.equal(getWindowState(booking, new Date(window.opensAt.getTime() - 1), 'Asia/Manila').state, 'too_early');
  assert.equal(getWindowState(booking, new Date(window.closesAt.getTime() + 1), 'Asia/Manila').state, 'expired');
});

test('non-paid, unconfirmed, cancelled, and checked-in bookings are not check-in eligible', () => {
  const now = new Date('2026-10-16T06:00:00.000Z');
  assert.equal(getWindowState(paidBooking({ paymentStatus: 'pending' }), now, 'Asia/Manila').reason, 'payment_required');
  assert.equal(getWindowState(paidBooking({ status: 'awaiting_payment' }), now, 'Asia/Manila').reason, 'unconfirmed');
  assert.equal(getWindowState(paidBooking({ status: 'cancelled' }), now, 'Asia/Manila').reason, 'cancelled');
  assert.equal(getWindowState(paidBooking({ isScanned: true }), now, 'Asia/Manila').reason, 'already_checked_in');
});

test('reservation verification and confirmation attempts are rate-limited per actor and IP', () => {
  const actorId = `synthetic-${crypto.randomBytes(8).toString('hex')}`;
  const ip = '192.0.2.42';
  const bucketKey = `booking-verification:${ip}:${actorId}`;
  const next = { count: 0 };
  const res = {
    statusCode: 200,
    set() { return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
  const req = { ip, user: { _id: actorId }, socket: { remoteAddress: ip }, body: {} };
  rateLimitTest.buckets.delete(bucketKey);
  try {
    for (let attempt = 0; attempt < 20; attempt += 1) authRateLimits.bookingVerification(req, res, () => { next.count += 1; });
    authRateLimits.bookingVerification(req, res, () => { next.count += 1; });
    assert.equal(next.count, 20);
    assert.equal(res.statusCode, 429);
    assert.match(res.body.message, /Too many attempts/);
  } finally {
    rateLimitTest.buckets.delete(bucketKey);
  }
});
