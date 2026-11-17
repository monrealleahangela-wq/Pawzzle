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

const liveEvidence = (photo = 'https://example.test/live-proof.jpg', capturedAt = new Date('2026-11-17T08:00:00.000Z')) => ({
  photo,
  capturedAt
});

test('non-COD completion omits an empty COD status and passes Delivery validation', () => {
  const delivery = makeArrivedDelivery();
  const proof = __test.buildProofOfDelivery({
    method: 'live_camera',
    codPaymentStatus: ''
  }, delivery, false, liveEvidence());

  assert.equal(Object.hasOwn(proof, 'codPaymentStatus'), false);
  delivery.proofOfDelivery = proof;
  assert.equal(delivery.validateSync(), undefined);
});

test('COD completion requires and retains a valid payment status', () => {
  const delivery = makeArrivedDelivery();

  assert.throws(
    () => __test.buildProofOfDelivery({}, delivery, true, liveEvidence()),
    error => error.statusCode === 400 && /COD payment status/.test(error.message)
  );

  const proof = __test.buildProofOfDelivery({
    codPaymentStatus: 'cash_received'
  }, delivery, true, liveEvidence());
  assert.equal(proof.codPaymentStatus, 'cash_received');
});

test('completion rejects invalid proof methods and COD statuses before saving', () => {
  const delivery = makeArrivedDelivery();
  assert.throws(
    () => __test.buildProofOfDelivery({ method: 'unknown' }, delivery, false, liveEvidence()),
    /valid proof-of-delivery method/
  );
  assert.throws(
    () => __test.buildProofOfDelivery({ codPaymentStatus: 'paid' }, delivery, false, liveEvidence()),
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
  assert.match(controller, /transactional\.proofOfDelivery = proofOfDelivery/);
  assert.match(controller, /error\.name === 'ValidationError'/);
});

test('recipient-name acknowledgment remains supplemental to the live-camera evidence', () => {
  const delivery = makeArrivedDelivery();
  const proof = __test.buildProofOfDelivery({ recipientName: 'Alex Customer' }, delivery, false, liveEvidence());
  assert.equal(proof.recipientName, 'Alex Customer');
  assert.equal(proof.method, 'live_camera');
  assert.equal(proof.captureSource, 'live_camera');
  assert.equal(proof.signature, undefined);

  const workspace = source('client/src/components/delivery/RiderDeliveryWorkspace.js');
  assert.match(workspace, /Recipient name acknowledgment/);
  assert.match(workspace, /not a captured handwritten signature/);
  assert.doesNotMatch(workspace, /proof\.signature|Recipient signature\/name/);
  assert.doesNotMatch(workspace, /window\.confirm/);
});

test('completion requires fresh live-camera evidence bound to the delivery and rider', () => {
  const delivery = makeArrivedDelivery();
  const photo = 'https://example.test/pawzzle/live-camera-proof.jpg';
  const capturedAt = new Date('2026-11-17T08:00:00.000Z');
  const token = __test.createLiveProofEvidence({
    deliveryId: delivery._id,
    riderId: delivery.assignedRider,
    photo,
    capturedAt
  });

  const verified = __test.verifyLiveProofEvidence(token, {
    deliveryId: delivery._id,
    riderId: delivery.assignedRider,
    photo
  }, new Date('2026-11-17T08:05:00.000Z'));
  assert.equal(verified.photo, photo);
  assert.equal(verified.capturedAt.toISOString(), capturedAt.toISOString());

  assert.throws(
    () => __test.verifyLiveProofEvidence(token, {
      deliveryId: new mongoose.Types.ObjectId(),
      riderId: delivery.assignedRider,
      photo
    }, new Date('2026-11-17T08:05:00.000Z')),
    /invalid or expired/
  );
  assert.throws(
    () => __test.verifyLiveProofEvidence(token, {
      deliveryId: delivery._id,
      riderId: delivery.assignedRider,
      photo
    }, new Date('2026-11-17T08:11:00.000Z')),
    /invalid or expired/
  );
});

test('delivery completion cannot fall back to OTP, notes, or recipient name without a live photo', () => {
  const delivery = makeArrivedDelivery();
  assert.throws(
    () => __test.buildProofOfDelivery({ otp: '123456', recipientName: 'Alex', notes: 'Received' }, delivery, false),
    error => error.statusCode === 400 && /live delivery photo/.test(error.message)
  );

  const camera = source('client/src/components/delivery/LiveCameraProofCapture.js');
  const workspace = source('client/src/components/delivery/RiderDeliveryWorkspace.js');
  assert.match(camera, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(camera, /Capture delivery photo/);
  assert.match(camera, /Gallery uploads are not accepted/);
  assert.match(workspace, /method: 'live_camera'/);
  assert.doesNotMatch(workspace, /Add photo proof/);
});
