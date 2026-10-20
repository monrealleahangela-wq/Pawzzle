const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AdoptionRequest = require('../models/AdoptionRequest');
const { createAdoptionRequest } = require('../controllers/adoptionController');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const invoke = async (req) => {
  const response = { statusCode: 200, body: null };
  const res = {
    status(value) { response.statusCode = value; return this; },
    json(value) { response.body = value; return this; }
  };
  await createAdoptionRequest(req, res);
  return response;
};

test('pet purchase endpoint rejects non-buyers and incomplete checkout data before database access', async () => {
  const sellerAttempt = await invoke({ user: { _id: 'seller', role: 'store_owner' }, body: {} });
  assert.equal(sellerAttempt.statusCode, 403);
  assert.match(sellerAttempt.body.message, /customer accounts/i);

  const incompleteBuyerAttempt = await invoke({ user: { _id: 'buyer', role: 'customer' }, body: {} });
  assert.equal(incompleteBuyerAttempt.statusCode, 400);
  assert.match(incompleteBuyerAttempt.body.message, /pet and seller conversation/i);
});

test('purchase records have request and active-purchase uniqueness without changing legacy fields', () => {
  assert.ok(AdoptionRequest.schema.path('purchaseRequestId'));
  assert.ok(AdoptionRequest.schema.path('purchaseFingerprint'));
  assert.ok(AdoptionRequest.schema.path('isActivePurchase'));
  assert.ok(AdoptionRequest.schema.path('refundPolicySnapshot.type'));
  assert.ok(AdoptionRequest.schema.path('refundPolicyAcknowledgment.acknowledged'));
  assert.ok(AdoptionRequest.schema.path('inquiryData.interestReason'), 'legacy screening data remains readable');

  const indexes = AdoptionRequest.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.customer === 1 && keys.purchaseRequestId === 1 && options.unique));
  assert.ok(indexes.some(([keys, options]) => keys.pet === 1 && keys.customer === 1 && keys.isActivePurchase === 1 && options.unique));
});

test('pet details keeps chat separate from the server-authoritative PayMongo checkout', () => {
  const detail = read('client/src/pages/customer/PetDetail.js');
  const modal = read('client/src/components/PetPurchaseModal.js');
  const chat = read('client/src/components/EnhancedChatMessenger.js');

  assert.match(detail, /Chat Store/);
  assert.match(detail, /Buy Now/);
  assert.match(detail, /getConversationByPet\(id\)/);
  assert.match(detail, /createAdoptionCheckoutSession\(adoptionRequest\._id\)/);
  assert.doesNotMatch(detail, /Book a Service|PetInquiryBoard|Buy \/ Inquire|Adopt \/ Inquire/);
  assert.doesNotMatch(modal, /Purchase Inquiry|Send inquiry|Why are you interested|Previous Experience/i);
  assert.match(modal, /Proceed to Payment/);
  assert.match(modal, /refundPolicyLabel|requiresRefundAcknowledgment/);
  assert.doesNotMatch(chat, /handlePurchaseRequest|Buy this Pet|Serious Inquiry/);
});

test('backend rejects forged ownership and uses saved price, policy, availability, and idempotency controls', () => {
  const adoption = read('controllers/adoptionController.js');
  const payment = read('controllers/paymentController.js');
  const reconciliation = read('services/paymentReconciliationService.js');

  assert.match(adoption, /pet\.addedBy/);
  assert.match(adoption, /pet\.store/);
  assert.match(adoption, /totalPrice: pet\.price/);
  assert.match(adoption, /getPetAvailabilityIssue\(pet, 1\)/);
  assert.match(adoption, /You cannot purchase a pet from your own listing/);
  assert.match(adoption, /purchaseRequestId/);
  assert.match(adoption, /buildPurchaseFingerprint/);
  assert.match(payment, /Only the authenticated buyer can start this payment/);
  assert.match(payment, /seller or Store no longer matches/);
  assert.match(payment, /ensureCheckoutSession/);
  assert.match(payment, /reservePetForAdoption/);
  assert.match(payment, /requiresAcknowledgment/);
  assert.match(reconciliation, /finalizeAdoption/);
  assert.match(reconciliation, /reservePetForAdoption/);
});

test('service marketplace routes and pages remain present and untouched by the pet detail action cleanup', () => {
  const app = read('client/src/App.js');
  const routes = read('routes/services.js');
  assert.match(app, /path="services/);
  assert.match(routes, /router\./);
});
