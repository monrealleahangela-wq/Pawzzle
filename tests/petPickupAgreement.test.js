const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AdoptionRequest = require('../models/AdoptionRequest');
const { createAdoptionRequest } = require('../controllers/adoptionController');
const {
  PET_PICKUP_POLICY,
  buildPickupAgreementSnapshot,
  calculateNoShowSettlement,
  getNoShowRestriction,
  hasCurrentPickupAgreement,
  pickupTimeline,
  publicPickupPolicy
} = require('../utils/petPickupPolicy');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const DAY = 24 * 60 * 60 * 1000;

const invokeCreate = async body => {
  const response = { statusCode: 200, body: null };
  const res = {
    status(value) { response.statusCode = value; return this; },
    json(value) { response.body = value; return this; }
  };
  await createAdoptionRequest({
    user: { _id: 'buyer', role: 'customer' },
    body,
    headers: {},
    get: () => ''
  }, res);
  return response;
};

test('pet checkout requires the current pickup agreement before any database access', async () => {
  const response = await invokeCreate({
    petId: 'pet-id', conversationId: 'conversation-id',
    fullName: 'Buyer Name', contactNumber: '09170000000', cityArea: 'Bacoor',
    preferredPickupDate: '2099-01-01', pickupConfirmation: true
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /read and accept.*pickup agreement/i);
});

test('agreement snapshot is versioned, attributable, and verifiable', () => {
  const acceptedAt = new Date('2026-10-24T08:00:00.000Z');
  const snapshot = buildPickupAgreementSnapshot({
    acceptedBy: 'buyer-id', acceptedAt, ipAddress: '127.0.0.1', userAgent: 'test-agent'
  });

  assert.equal(snapshot.version, PET_PICKUP_POLICY.version);
  assert.equal(snapshot.accepted, true);
  assert.equal(snapshot.acceptedBy, 'buyer-id');
  assert.equal(snapshot.acceptedAt, acceptedAt);
  assert.equal(snapshot.terms.length, publicPickupPolicy().terms.length);
  assert.equal(snapshot.acceptanceEvidence.ipHash.length, 64);
  assert.notEqual(snapshot.acceptanceEvidence.ipHash, '127.0.0.1');
  assert.equal(hasCurrentPickupAgreement(snapshot), true);
  assert.equal(hasCurrentPickupAgreement({ ...snapshot, termsHash: 'forged' }), false);
});

test('no-show settlement observes grace, fee caps, payment cap, and refund policy', () => {
  const scheduledFor = new Date('2026-10-01T00:00:00.000Z');
  const timeline = pickupTimeline(scheduledFor);
  assert.equal(timeline.graceEndsAt.toISOString(), '2026-10-02T00:00:00.000Z');
  assert.equal(timeline.cancellationEligibleAt.toISOString(), '2026-10-08T00:00:00.000Z');

  const conditional = calculateNoShowSettlement({
    totalPrice: 5000,
    paidAmount: 5000,
    scheduledFor,
    now: new Date(scheduledFor.getTime() + 8 * DAY),
    refundPolicyType: 'conditional_refund'
  });
  assert.deepEqual(
    { careFeeDays: conditional.careFeeDays, careFee: conditional.careFee, noShowFee: conditional.noShowFee },
    { careFeeDays: 7, careFee: 700, noShowFee: 500 }
  );
  assert.equal(conditional.deductionTotal, 1200);
  assert.equal(conditional.refundDue, 3800);
  assert.equal(conditional.refundStatus, 'review_required');

  const paymentCapped = calculateNoShowSettlement({
    totalPrice: 50000,
    paidAmount: 300,
    scheduledFor,
    now: new Date(scheduledFor.getTime() + 8 * DAY)
  });
  assert.equal(paymentCapped.deductionTotal, 300);
  assert.equal(paymentCapped.refundDue, 0);

  const noRefund = calculateNoShowSettlement({
    totalPrice: 5000,
    paidAmount: 5000,
    scheduledFor,
    now: new Date(scheduledFor.getTime() + 8 * DAY),
    refundPolicyType: 'no_refund'
  });
  assert.equal(noRefund.deductionTotal, 5000);
  assert.equal(noRefund.refundDue, 0);
});

test('repeated no-show restrictions are temporary and escalation is deterministic', () => {
  const now = new Date('2026-10-24T00:00:00.000Z');
  const recent = daysAgo => ({ pickupCompliance: { cancelledAt: new Date(now.getTime() - daysAgo * DAY) } });

  assert.equal(getNoShowRestriction([recent(1)], now).restricted, false);
  const secondStrike = getNoShowRestriction([recent(1), recent(40)], now);
  assert.equal(secondStrike.restricted, true);
  assert.equal(secondStrike.strikeCount, 2);
  assert.equal(secondStrike.restrictedUntil.toISOString(), '2026-11-22T00:00:00.000Z');

  const thirdStrike = getNoShowRestriction([recent(1), recent(40), recent(80)], now);
  assert.equal(thirdStrike.restricted, true);
  assert.equal(thirdStrike.restrictedUntil.toISOString(), '2027-01-21T00:00:00.000Z');
});

test('pickup workflow fields, protected routes, notifications, and payment gate are present', () => {
  assert.ok(AdoptionRequest.schema.path('pickupAgreement.version'));
  assert.ok(AdoptionRequest.schema.path('pickupAgreement.termsHash'));
  assert.ok(AdoptionRequest.schema.path('pickupCompliance.contactAttempts'));
  assert.ok(AdoptionRequest.schema.path('pickupCompliance.settlement.refundDue'));
  assert.ok(AdoptionRequest.schema.path('pickupCompliance.cancellationEligibleAt'));
  assert.ok(AdoptionRequest.schema.path('pickupAgreement.acceptanceEvidence.ipHash').options.select === false);

  const routes = read('routes/adoption.js');
  const controller = read('controllers/adoptionController.js');
  const payment = read('controllers/paymentController.js');
  const reconciliation = read('services/paymentReconciliationService.js');
  const modal = read('client/src/components/PetPurchaseModal.js');

  assert.match(routes, /pickup-policy/);
  assert.match(routes, /pickup\/:requestId\/missed/);
  assert.match(routes, /contact-attempts/);
  assert.match(routes, /no-show-cancel/);
  assert.match(controller, /Wait at least 30 minutes/);
  assert.match(controller, /Record at least.*genuine contact attempts/);
  assert.match(controller, /releasePetReservation/);
  assert.match(payment, /hasCurrentPickupAgreement/);
  assert.match(payment, /pickup_missed.*no_show_cancelled/);
  assert.match(reconciliation, /no_show_cancelled/);
  assert.match(modal, /Pet Purchase and Pickup Agreement/);
  assert.match(modal, /pickupAgreementVersion/);
});
