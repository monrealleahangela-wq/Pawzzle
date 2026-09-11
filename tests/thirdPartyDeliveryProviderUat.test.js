const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET ||= 'test-only-jwt-secret';

const Delivery = require('../models/Delivery');
const DeliveryProviderService = require('../services/deliveryProviderService');
const { publicProviderView } = require('../controllers/deliveryProviderController');

const source = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
const adapter = () => DeliveryProviderService.getAdapter('mock_delivery_provider');

test('provider abstraction exposes the complete provider contract', () => {
  const provider = adapter();
  for (const method of ['createDeliveryRequest', 'getDeliveryQuote', 'getDeliveryStatus', 'cancelDelivery', 'getTrackingDetails', 'handleWebhook']) {
    assert.equal(typeof provider[method], 'function', method);
  }
  assert.deepEqual(DeliveryProviderService.listProviders()[0], {
    key: 'mock_delivery_provider', name: 'Mock Delivery Provider', environment: 'sandbox', configured: true
  });
});

test('sandbox quote is provider-specific and clearly separated from the order fee snapshot', async () => {
  process.env.MOCK_DELIVERY_BASE_FEE = '100';
  process.env.MOCK_DELIVERY_PER_KM_FEE = '20';
  const quote = await adapter().getDeliveryQuote({ distanceKm: 3 });
  assert.equal(quote.amount, 160);
  assert.equal(quote.currency, 'PHP');
  assert.match(quote.quoteId, /^mock-quote-/);
  assert.ok(quote.expiresAt > quote.quotedAt);
});

test('sandbox request returns an external provider identity without a Pawzzle rider account', async () => {
  const quote = await adapter().getDeliveryQuote({ distanceKm: 1 });
  const created = await adapter().createDeliveryRequest({ quote, reference: 'ORDER-1' });
  assert.match(created.jobId, /^mock-job-/);
  assert.match(created.trackingId, /^MOCK-/);
  assert.equal(created.status, 'pending');
  assert.equal(created.assignedRider, undefined);
});

test('expired quotes are rejected with a retryable provider error', async () => {
  await assert.rejects(
    adapter().createDeliveryRequest({ quote: { quoteId: 'old', expiresAt: new Date(0) } }),
    error => error.code === 'QUOTE_EXPIRED' && error.statusCode === 409 && error.retryable
  );
});

test('provider-specific statuses map to Pawzzle delivery statuses', () => {
  const provider = adapter();
  assert.equal(provider.mapStatus('rider_assigned'), 'assigned');
  assert.equal(provider.mapStatus('picked_up'), 'picked_up');
  assert.equal(provider.mapStatus('in_transit'), 'in_transit');
  assert.equal(provider.mapStatus('delivered'), 'delivered');
  assert.equal(provider.mapStatus('cancelled'), 'cancelled');
  assert.equal(provider.mapStatus('provider_mystery_state'), null);
});

test('signed provider webhook is authenticated and normalized', () => {
  process.env.MOCK_DELIVERY_WEBHOOK_SECRET = 'test-webhook-secret';
  const payload = { eventId: 'evt-1', jobId: 'mock-job-1', status: 'picked_up', occurredAt: '2026-09-11T00:00:00.000Z' };
  const canonical = [payload.eventId, payload.jobId, payload.status, payload.occurredAt].join('|');
  const signature = crypto.createHmac('sha256', process.env.MOCK_DELIVERY_WEBHOOK_SECRET).update(canonical).digest('hex');
  const event = adapter().handleWebhook({ headers: { 'x-delivery-signature': `sha256=${signature}` }, payload });
  assert.equal(event.pawzzleStatus, 'picked_up');
  assert.equal(event.jobId, payload.jobId);
});

test('invalid webhook signatures and unknown statuses are rejected', () => {
  process.env.MOCK_DELIVERY_WEBHOOK_SECRET = 'test-webhook-secret';
  const payload = { eventId: 'evt-bad', jobId: 'mock-job-1', status: 'picked_up', occurredAt: '2026-09-11T00:00:00.000Z' };
  assert.throws(() => adapter().handleWebhook({ headers: { 'x-delivery-signature': 'bad' }, payload }), error => error.statusCode === 401);
  const unknown = { ...payload, eventId: 'evt-unknown', status: 'unknown' };
  const canonical = [unknown.eventId, unknown.jobId, unknown.status, unknown.occurredAt].join('|');
  const signature = crypto.createHmac('sha256', process.env.MOCK_DELIVERY_WEBHOOK_SECRET).update(canonical).digest('hex');
  assert.throws(() => adapter().handleWebhook({ headers: { 'x-delivery-signature': signature }, payload: unknown }), error => error.statusCode === 400);
});

test('delivery schema stores provider job, quote, sync, rider, and event history safely', () => {
  for (const field of ['providerKey', 'providerName', 'environment', 'jobId', 'trackingId', 'externalStatus', 'requestState', 'quote.amount', 'rider.displayName', 'proof.reference', 'estimatedDeliveryAt', 'lastSyncedAt', 'lastError.message', 'processedWebhookEventIds', 'statusHistory']) {
    assert.ok(Delivery.schema.path(`providerDelivery.${field}`), field);
  }
  assert.equal(Delivery.schema.path('assignedRider').instance, 'ObjectId');
});

test('public provider view does not expose job IDs, webhook IDs, or error internals', () => {
  const view = publicProviderView({ providerKey: 'mock_delivery_provider', providerName: 'Mock', environment: 'sandbox', jobId: 'secret-job', trackingId: 'SAFE', processedWebhookEventIds: ['evt'], lastError: { code: 'X' } });
  assert.equal(view.trackingId, 'SAFE');
  assert.equal(view.jobId, undefined);
  assert.equal(view.processedWebhookEventIds, undefined);
  assert.equal(view.lastError, undefined);
});

test('provider controller atomically claims webhook event IDs and scopes jobs by provider identity', () => {
  const controller = source('controllers/deliveryProviderController.js');
  assert.match(controller, /providerDelivery\.processedWebhookEventIds'.*\$ne/s);
  assert.match(controller, /providerDelivery\.providerKey'.*providerKey/s);
  assert.match(controller, /providerDelivery\.jobId'.*event\.jobId/s);
  assert.match(controller, /canOperateStore\(req\.user, storeId, \['logistics\.manage'\]\)/);
});

test('third-party rider controls cannot use Pawzzle rider tokens or socket mutation capability', () => {
  const controller = source('controllers/deliveryController.js');
  const sockets = source('services/socketAuthorization.js');
  assert.match(controller, /riderToken: token, assignmentType: 'internal'/);
  assert.match(sockets, /riderToken: deliveryToken, assignmentType: 'internal'/);
  assert.match(sockets, /assignmentType: 'internal',[\s\S]*isLive: true/);
  assert.doesNotMatch(controller, /identity does not match this third-party assignment/);
});

test('internal rider notifications and earnings remain on the internal assignedRider flow', () => {
  const controller = source('controllers/deliveryController.js');
  assert.match(controller, /if \(assignmentChanged && rider\?\._id\)/);
  assert.match(controller, /if \(delivery\.assignedRider\)/);
  assert.match(controller, /RiderEarning\.findOneAndUpdate/);
});

test('provider failures persist a retryable safe state instead of leaving Assigning indefinitely', () => {
  const controller = source('controllers/deliveryProviderController.js');
  assert.match(controller, /requestState = 'failed'/);
  assert.match(controller, /PROVIDER_REQUEST_FAILED/);
  assert.match(controller, /Unable to request third-party delivery right now/);
  assert.doesNotMatch(controller, /process\.env\.[A-Z_]*(SECRET|TOKEN|API_KEY).*res\.json/);
});

test('store UI provides quote, request, refresh, cancel, and tracking actions', () => {
  const detail = source('client/src/pages/admin/LogisticsDetail.js');
  const api = source('client/src/services/apiService.js');
  for (const label of ['Get Quote', 'Request Delivery', 'Refresh Status', 'Cancel Courier', 'Open Provider Tracking']) assert.match(detail, new RegExp(label));
  for (const method of ['quoteProvider', 'requestProvider', 'refreshProvider', 'cancelProvider']) assert.match(api, new RegExp(method));
  assert.match(source('client/src/components/delivery/DeliveryAssignmentFields.js'), /provider—not Pawzzle—assigns and notifies its rider/);
});

test('customer tracking identifies third-party courier without provider internals', () => {
  const tracking = source('client/src/pages/DeliveryTracking.js');
  assert.match(tracking, /Delivery by third-party courier/);
  assert.match(tracking, /providerDelivery\?\.trackingId/);
  assert.match(tracking, /providerDelivery\?\.estimatedDeliveryAt/);
  assert.doesNotMatch(tracking, /processedWebhookEventIds|lastError\.code|providerDelivery\?\.jobId/);
});

test('sandbox cancellation works while terminal jobs remain protected', async () => {
  const cancelled = await adapter().cancelDelivery({ jobId: 'mock-job-1', currentStatus: 'in_transit' });
  assert.equal(cancelled.status, 'cancelled');
  await assert.rejects(adapter().cancelDelivery({ jobId: 'mock-job-1', currentStatus: 'delivered' }), error => error.statusCode === 409);
});
