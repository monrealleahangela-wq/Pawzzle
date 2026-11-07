const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Pet = require('../models/Pet');
const AdoptionRequest = require('../models/AdoptionRequest');
const {
  describePetSaleUnit,
  getPetSaleUnitSnapshot,
  normalizePetSaleUnit
} = require('../utils/petSaleUnit');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('legacy listings default to one animal while pairs and groups normalize deterministically', () => {
  assert.deepEqual(normalizePetSaleUnit({}), { saleUnit: 'single', animalsPerUnit: 1 });
  assert.deepEqual(normalizePetSaleUnit({ saleUnit: 'single', animalsPerUnit: 20 }), { saleUnit: 'single', animalsPerUnit: 1 });
  assert.deepEqual(normalizePetSaleUnit({ saleUnit: 'pair', animalsPerUnit: 20 }), { saleUnit: 'pair', animalsPerUnit: 2 });
  assert.deepEqual(normalizePetSaleUnit({ saleUnit: 'group', animalsPerUnit: '12' }), { saleUnit: 'group', animalsPerUnit: 12 });
  assert.equal(describePetSaleUnit({ saleUnit: 'pair' }), 'Pair (2 animals)');
  assert.equal(describePetSaleUnit({ saleUnit: 'group', animalsPerUnit: 12 }), 'Group (12 animals)');
});

test('invalid or ambiguous group sizes are rejected', () => {
  for (const value of [undefined, 0, 2, 2.5, 1001, 'many']) {
    assert.throws(() => normalizePetSaleUnit({ saleUnit: 'group', animalsPerUnit: value }), /between 3 and 1000/);
  }
  assert.throws(() => normalizePetSaleUnit({ saleUnit: 'crate', animalsPerUnit: 4 }), /Selling method/);
});

test('pet and purchase schemas preserve atomic sale-unit identity', () => {
  assert.deepEqual(Pet.schema.path('saleUnit').enumValues, ['single', 'pair', 'group']);
  assert.ok(Pet.schema.path('animalsPerUnit'));
  assert.ok(Pet.schema.path('gender').enumValues.includes('mixed'));
  assert.ok(AdoptionRequest.schema.path('petSnapshot.saleUnit'));
  assert.ok(AdoptionRequest.schema.path('petSnapshot.animalsPerUnit'));
  assert.ok(AdoptionRequest.schema.path('petSnapshot.listedPrice'));

  const snapshot = getPetSaleUnitSnapshot({ saleUnit: 'group', animalsPerUnit: 8, price: 2400 });
  assert.equal(snapshot.label, 'Group (8 animals)');
  assert.equal(snapshot.price, 2400);
});

test('seller and customer flows carry selling method without reusing legacy quantity inventory', () => {
  const controller = read('controllers/petController.js');
  const sellerForm = read('client/src/components/pets/PetListingFormModal.js');
  const customerDetail = read('client/src/pages/customer/PetDetail.js');
  const purchaseModal = read('client/src/components/PetPurchaseModal.js');
  const adoptionController = read('controllers/adoptionController.js');

  assert.match(controller, /'saleUnit', 'animalsPerUnit'/);
  assert.match(controller, /quantity: 1/);
  assert.match(sellerForm, /One animal/);
  assert.match(sellerForm, /A pair/);
  assert.match(sellerForm, /A group \/ batch/);
  assert.match(customerDetail, /getPetSaleUnitLabel/);
  assert.match(purchaseModal, /purchased together|collected together/);
  assert.match(adoptionController, /petSnapshot/);
});
