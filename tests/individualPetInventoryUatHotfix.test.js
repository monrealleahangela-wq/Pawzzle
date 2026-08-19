const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Pet = require('../models/Pet');
const {
  finalizePetReservation,
  getPetAvailabilityIssue,
  isIndividualPetRecord,
  reservePetForOrder
} = require('../services/petAvailabilityService');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('pet availability treats exactly one live animal as an individual listing', () => {
  const availablePet = { _id: 'pet-1', name: 'Casper', quantity: 1, status: 'available', isAvailable: true };

  assert.equal(isIndividualPetRecord(availablePet), true);
  assert.equal(getPetAvailabilityIssue(availablePet, 1), null);
  assert.match(getPetAvailabilityIssue(availablePet, 2), /one individual pet/i);
  assert.match(getPetAvailabilityIssue({ ...availablePet, quantity: 5 }, 1), /manual cleanup/i);
  assert.match(getPetAvailabilityIssue({ ...availablePet, status: 'sold', isAvailable: false }, 1), /cannot be purchased/i);
  assert.match(getPetAvailabilityIssue({ ...availablePet, status: 'adopted', isAvailable: false }, 1), /cannot be purchased/i);
});

test('pet schema retains historical quantity but adds authoritative availability and reservation ownership', () => {
  assert.ok(Pet.schema.path('quantity'), 'historical quantity must remain readable until cleanup');
  assert.ok(Pet.schema.path('reservation.order'));
  assert.ok(Pet.schema.path('reservation.adoptionRequest'));
  assert.ok(Pet.schema.path('reservation.reservedAt'));
  assert.ok(Pet.schema.path('reservation.completedAt'));
  assert.ok(Pet.schema.path('status').enumValues.includes('unavailable'));

  const modelSource = read('models/Pet.js');
  assert.match(modelSource, /this\.isAvailable = this\.status === 'available'/);
});

test('server create and update paths cannot turn pet listings into quantity inventory', () => {
  const controller = read('controllers/petController.js');
  const petRoutes = read('routes/pets.js');
  const adminPetRoutes = read('routes/adminPets.js');

  assert.match(controller, /const \{ quantity, reservation, \.\.\.listingData \} = req\.body/);
  assert.match(controller, /quantity: 1/);
  assert.match(controller, /ratings, quantity, reservation, \.\.\.updateData/);
  assert.match(controller, /\['sold', 'adopted'\]\.includes\(pet\.status\)/);
  assert.match(petRoutes, /Each pet listing must represent exactly one pet/);
  assert.match(adminPetRoutes, /Each pet listing must represent exactly one pet/);
});

test('seller pet forms use availability and preserve product stock quantity', () => {
  const compactPetForm = read('client/src/components/pets/PetListingFormModal.js');
  const sellerPets = read('client/src/pages/admin/Pets.js');
  const productForm = read('client/src/components/forms/ProductFormModal.js');

  assert.match(compactPetForm, /One listing represents one individual pet/);
  assert.match(compactPetForm, />Availability</);
  assert.doesNotMatch(compactPetForm, /quantity|Stock Quantity/i);
  assert.doesNotMatch(sellerPets, /value=\{petForm\.quantity\}|Stock Quantity/);
  assert.match(sellerPets, /Duplicate shared listing details/);
  assert.match(sellerPets, /Legacy quantity record/);
  assert.match(productForm, /Stock Quantity/);
  assert.match(productForm, /stockQuantity/);
});

test('reservation claims are atomic and tied to the owning transaction', async () => {
  const originalFindOneAndUpdate = Pet.findOneAndUpdate;
  let captured;
  Pet.findOneAndUpdate = async (filter, update, options) => {
    captured = { filter, update, options };
    return { _id: 'pet-1', status: 'reserved' };
  };

  try {
    const result = await reservePetForOrder('pet-1', 'order-1');
    assert.equal(result.status, 'reserved');
    assert.equal(captured.filter._id, 'pet-1');
    assert.equal(captured.update.$set.status, 'reserved');
    assert.equal(captured.update.$set.isAvailable, false);
    assert.equal(captured.update.$set['reservation.order'], 'order-1');
    assert.equal(captured.options.runValidators, true);
  } finally {
    Pet.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test('terminal pet disposition stays tied to the completing transaction for safe retries', async () => {
  const originalFindOneAndUpdate = Pet.findOneAndUpdate;
  let captured;
  Pet.findOneAndUpdate = async (filter, update) => {
    captured = { filter, update };
    return { _id: 'pet-1', status: 'sold' };
  };

  try {
    await finalizePetReservation({ petId: 'pet-1', source: 'order', referenceId: 'order-1', status: 'sold' });
    assert.equal(captured.filter['reservation.order'], 'order-1');
    assert.deepEqual(captured.filter.$or, [{ status: 'reserved' }, { status: 'sold' }]);
    assert.equal(captured.update.$set.status, 'sold');
    assert.ok(captured.update.$set['reservation.completedAt'] instanceof Date);
    assert.equal(captured.update.$unset['reservation.adoptionRequest'], 1);
    assert.equal(captured.update.$unset.reservation, undefined);
  } finally {
    Pet.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test('payment and adoption flows reserve, release, and finalize the exact pet record', () => {
  const paymentController = read('controllers/paymentController.js');
  const reconciliation = read('services/paymentReconciliationService.js');
  const adoptionController = read('controllers/adoptionController.js');
  const orderPricing = read('services/orderPricingService.js');

  assert.match(paymentController, /reservePetForOrder/);
  assert.match(paymentController, /reservePetForAdoption/);
  assert.match(paymentController, /releaseTransactionPetReservations/);
  assert.match(reconciliation, /reservePetForOrder/);
  assert.match(reconciliation, /reservePetForAdoption/);
  assert.match(reconciliation, /refund_review_required/);
  assert.match(adoptionController, /finalizePetReservation/);
  assert.match(adoptionController, /expireUnpaidCheckoutSession/);
  assert.match(orderPricing, /getPetAvailabilityIssue\(itemDoc, quantity\)/);
  assert.match(orderPricing, /Each individual pet can appear only once in an order/);
});

test('legacy grouped pet records are not exposed as purchasable marketplace inventory', () => {
  const petController = read('controllers/petController.js');
  const storeController = read('controllers/storeController.js');
  const publicController = read('controllers/publicController.js');
  const detail = read('client/src/pages/customer/PetDetail.js');

  assert.match(petController, /legacyGroupedListing = true/);
  assert.match(petController, /quantity: \{ \$exists: false \}/);
  assert.match(storeController, /quantity: \{ \$exists: false \}/);
  assert.match(publicController, /quantity: \{ \$exists: false \}/);
  assert.match(detail, /historical grouped listing is unavailable/i);
  assert.match(detail, /pet\?\.isAvailable === true/);
});
