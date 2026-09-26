const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getDeliveryStatusLabel, getDeliveryLinkStatus } = require('../utils/logistics');
const Delivery = require('../models/Delivery');

const root = path.join(__dirname, '..');
const source = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('preserves existing delivery lifecycle values while presenting clear labels', () => {
  assert.equal(getDeliveryStatusLabel('pending'), 'Pending Assignment');
  assert.equal(getDeliveryStatusLabel('picked_up'), 'Out for Delivery');
  assert.equal(getDeliveryStatusLabel('failed_attempt'), 'Delivery Attempted');
  assert.equal(getDeliveryStatusLabel('returned_to_store'), 'Failed');
});

test('derives link status from the existing secure link state', () => {
  assert.equal(getDeliveryLinkStatus({ status: 'pending', isLive: true, assignmentType: 'unassigned' }), 'not_generated');
  assert.equal(getDeliveryLinkStatus({ status: 'assigned', isLive: true, assignmentType: 'internal' }), 'active');
  assert.equal(getDeliveryLinkStatus({ status: 'assigned', isLive: true, assignmentType: 'internal', riderLinkOpenedAt: new Date() }), 'opened');
  assert.equal(getDeliveryLinkStatus({ status: 'delivered', isLive: false, assignmentType: 'internal' }), 'completed');
  assert.equal(getDeliveryLinkStatus({ status: 'cancelled', isLive: false, assignmentType: 'internal' }), 'inactive');
});

test('courier-provider integration is retired while internal rider assignment remains', () => {
  for (const relativePath of [
    'controllers/deliveryProviderController.js',
    'services/deliveryProviderService.js',
    'services/deliveryProviders/mockDeliveryProvider.js'
  ]) assert.equal(fs.existsSync(path.join(root, relativePath)), false, relativePath);

  const routes = source('routes/delivery.js');
  const controller = source('controllers/deliveryController.js');
  const api = source('client/src/services/apiService.js');
  const assignmentFields = source('client/src/components/delivery/DeliveryAssignmentFields.js');

  assert.doesNotMatch(routes, /provider-webhooks|\/providers|\/provider\/quote/);
  assert.doesNotMatch(controller, /DeliveryProviderService/);
  assert.match(controller, /requestedType !== 'internal'/);
  assert.match(controller, /role: 'delivery_rider'/);
  assert.doesNotMatch(api, /getProviders|quoteProvider|requestProvider|refreshProvider|cancelProvider/);
  assert.match(assignmentFields, /Pawzzle Delivery Rider/);
  assert.doesNotMatch(assignmentFields, /Courier Provider/);
});

test('legacy provider snapshots remain schema-readable but cannot activate assignment', () => {
  const model = source('models/Delivery.js');
  assert.match(model, /Legacy read-only snapshot/);
  assert.match(model, /thirdPartyRider/);
  assert.match(model, /providerDelivery/);
  assert.doesNotMatch(model, /this\.thirdPartyRider\?\.name/);
  assert.doesNotMatch(model, /provider_job_identity/);

  const fresh = new Delivery({ order: '507f1f77bcf86cd799439011' }).toObject();
  const historical = new Delivery({
    order: '507f1f77bcf86cd799439011',
    assignmentType: 'third_party',
    providerDelivery: { providerKey: 'legacy-provider', jobId: 'legacy-job' }
  }).toObject();
  assert.equal(fresh.providerDelivery, undefined);
  assert.equal(historical.providerDelivery.providerKey, 'legacy-provider');
});
