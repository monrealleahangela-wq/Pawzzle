const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  pickupCodeForOrder,
  pickupCodeMatches,
  requestFingerprint,
  customerPickupView
} = require('../utils/storePickup');
const { authRateLimits, __test: rateLimitTest } = require('../middleware/authRateLimit');

const fixtureSecret = 'store-pickup-test-secret-20261120';

test('creates an order-bound six-digit pickup code and compares it safely', () => {
  const first = pickupCodeForOrder('order-a', fixtureSecret);
  const second = pickupCodeForOrder('order-b', fixtureSecret);
  assert.match(first, /^\d{6}$/);
  assert.notEqual(first, second);
  assert.equal(pickupCodeMatches('order-a', first, fixtureSecret), true);
  assert.equal(pickupCodeMatches('order-a', '12345', fixtureSecret), false);
  assert.equal(pickupCodeMatches('order-b', first, fixtureSecret), false);
});

test('exposes the pickup code only in a ready customer pickup view', () => {
  const previous = process.env.PICKUP_VERIFICATION_SECRET;
  process.env.PICKUP_VERIFICATION_SECRET = fixtureSecret;
  try {
    const pickup = customerPickupView({
      _id: 'order-a',
      status: 'ready_for_pickup',
      deliveryMethod: 'pickup',
      pickupSession: {
        customerConfirmedAt: null,
        customerEvidenceHash: 'private-customer-evidence',
        sellerEvidenceHash: 'private-seller-evidence',
        code: 'legacy-private-code'
      }
    });
    assert.match(pickup.pickupSession.customerCode, /^\d{6}$/);
    assert.equal(pickup.pickupSession.customerEvidenceHash, undefined);
    assert.equal(pickup.pickupSession.sellerEvidenceHash, undefined);
    assert.equal(pickup.pickupSession.code, undefined);
    assert.equal(customerPickupView({ _id: 'order-a', status: 'preparing', deliveryMethod: 'pickup' }).pickupSession, undefined);
    assert.equal(customerPickupView({ _id: 'order-a', status: 'ready_for_pickup', deliveryMethod: 'delivery' }).pickupSession, undefined);
  } finally {
    if (previous === undefined) delete process.env.PICKUP_VERIFICATION_SECRET;
    else process.env.PICKUP_VERIFICATION_SECRET = previous;
  }
});

test('stores a one-way request fingerprint rather than raw network evidence', () => {
  const fingerprint = requestFingerprint({ ip: '127.0.0.1', userAgent: 'Pawzzle test browser' });
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(fingerprint, /127\.0\.0\.1|Pawzzle/);
});

test('limits repeated seller pickup-code attempts per order', () => {
  rateLimitTest.buckets.clear();
  const request = {
    ip: '127.0.0.1',
    user: { _id: 'seller-a' },
    params: { id: 'order-a' }
  };
  const response = {
    statusCode: 200,
    headers: {},
    set(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
  let allowed = 0;

  for (let attempt = 0; attempt < 9; attempt += 1) {
    authRateLimits.storePickupVerification(request, response, () => { allowed += 1; });
  }

  assert.equal(allowed, 8);
  assert.equal(response.statusCode, 429);
  assert.match(response.payload.message, /Too many attempts/);
  assert.ok(Number(response.headers['Retry-After']) > 0);
  rateLimitTest.buckets.clear();
});

test('requires separate customer and seller confirmations before payout release', () => {
  const root = path.join(__dirname, '..');
  const service = fs.readFileSync(path.join(root, 'services', 'deliveryAssignmentService.js'), 'utf8');
  const controller = fs.readFileSync(path.join(root, 'controllers', 'orderController.js'), 'utf8');
  const routes = fs.readFileSync(path.join(root, 'routes', 'adminOrders.js'), 'utf8');
  const customerOrders = fs.readFileSync(path.join(root, 'client', 'src', 'pages', 'customer', 'Orders.js'), 'utf8');
  const sellerOrders = fs.readFileSync(path.join(root, 'client', 'src', 'pages', 'admin', 'Orders.js'), 'utf8');

  assert.match(service, /'pickupSession\.customerConfirmedAt': \{ \$ne: null \}/);
  assert.match(service, /'pickupSession\.sellerConfirmedAt': \{ \$ne: null \}/);
  assert.match(service, /payoutStatus: 'released'/);
  assert.match(service, /pickupCodeMatches\(order\._id, pickupCode\)/);
  assert.match(controller, /confirmCustomerPickup/);
  assert.match(controller, /confirmSellerPickup/);
  assert.match(routes, /confirm-store-pickup/);
  assert.match(routes, /authRateLimits\.storePickupVerification/);
  assert.match(customerOrders, /Confirm I received it/);
  assert.match(sellerOrders, /Verify code and confirm handoff/);
  assert.doesNotMatch(customerOrders, /deliveryMethod === 'pickup'[\s\S]{0,160}Awaiting Rider/);
});
