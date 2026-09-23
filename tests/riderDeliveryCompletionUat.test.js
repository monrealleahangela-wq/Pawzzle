const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

process.env.JWT_SECRET ||= 'test-only-jwt-secret';

const Delivery = require('../models/Delivery');
const { __test } = require('../controllers/deliveryController');

const source = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

const makeArrivedDelivery = () => new Delivery({
  status: 'arrived',
  assignmentType: 'internal',
  assignedRider: new mongoose.Types.ObjectId(),
  riderName: 'Test Rider'
});

test('non-COD completion omits an empty COD status and passes Delivery validation', () => {
  const delivery = makeArrivedDelivery();
  const proof = __test.buildProofOfDelivery({
    photo: 'https://example.test/proof.jpg',
    method: 'photo',
    codPaymentStatus: ''
  }, delivery, false);

  assert.equal(Object.hasOwn(proof, 'codPaymentStatus'), false);
  delivery.proofOfDelivery = proof;
  assert.equal(delivery.validateSync(), undefined);
});

test('COD completion requires and retains a valid payment status', () => {
  const delivery = makeArrivedDelivery();

  assert.throws(
    () => __test.buildProofOfDelivery({ photo: 'proof.jpg' }, delivery, true),
    error => error.statusCode === 400 && /COD payment status/.test(error.message)
  );

  const proof = __test.buildProofOfDelivery({
    photo: 'proof.jpg',
    codPaymentStatus: 'cash_received'
  }, delivery, true);
  assert.equal(proof.codPaymentStatus, 'cash_received');
});

test('completion rejects invalid proof methods and COD statuses before saving', () => {
  const delivery = makeArrivedDelivery();
  assert.throws(
    () => __test.buildProofOfDelivery({ photo: 'proof.jpg', method: 'unknown' }, delivery),
    /valid proof-of-delivery method/
  );
  assert.throws(
    () => __test.buildProofOfDelivery({ photo: 'proof.jpg', codPaymentStatus: 'paid' }, delivery),
    /valid COD payment status/
  );
});

test('rider UI strips non-COD status and contains Leaflet below its dialogs', () => {
  const workspace = source('client/src/components/delivery/RiderDeliveryWorkspace.js');
  const css = source('client/src/index.css');

  assert.match(workspace, /if \(!isCod\) delete payload\.codPaymentStatus/);
  assert.match(workspace, /deliveryService\.completeDelivery\(token, payload\)/);
  assert.match(workspace, /rider-delivery-workspace/);
  assert.match(css, /\.rider-delivery-workspace \.leaflet-container[\s\S]*z-index: 0/);
});

test('completion controller derives COD requirements from the persisted order', () => {
  const controller = source('controllers/deliveryController.js');
  assert.match(controller, /select\('pickupSession\.code paymentMethod'\)/);
  assert.match(controller, /\['cod', 'cash_on_delivery'\]\.includes\(order\?\.paymentMethod\)/);
  assert.match(controller, /delivery\.proofOfDelivery = proofOfDelivery/);
  assert.match(controller, /error\.name === 'ValidationError'/);
});
