const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Pet = require('../models/Pet');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('store-owner pet listings retain optional PCCI and customer-facing listing fields', () => {
  const form = read('client/src/components/pets/PetListingFormModal.js');
  const page = read('client/src/pages/admin/Pets.js');

  for (const label of ['Pet Photo', 'Basic Information', 'Birth Date', 'Selling Price', 'Health & Personality', 'PCCI Registration Document', 'Availability Notes', 'Add Supporting Documents']) {
    assert.ok(form.includes(label), `missing listing field: ${label}`);
  }
  assert.doesNotMatch(form, /Adoption Fee|<option value="adoption">Adoption<\/option>/);
  assert.match(form, /petForm\.species === 'dog'/);
  assert.match(form, /saveDisabled=\{!isComplete\}/);
  assert.match(page, /uploadService\.uploadDocument/);
  assert.match(page, /showAdvancedForm/);

  assert.ok(Pet.schema.path('pcciRegistration.certificateUrl'));
  assert.ok(Pet.schema.path('supportingDocuments.url'));
  assert.ok(Pet.schema.path('healthNotes'));
  assert.ok(Pet.schema.path('availabilityNotes'));
});

test('public pet responses redact private marketplace documents', () => {
  const controller = read('controllers/petController.js');
  const storeController = read('controllers/storeController.js');

  for (const field of ['vetRecords', 'proofOfOwnership', 'permits', 'supportingDocuments', 'pickupInstructions']) {
    assert.match(controller, new RegExp(`delete publicPet\\.${field}`));
  }
  assert.match(controller, /certificateAvailable: Boolean\(pcci\.certificateUrl\)/);
  assert.doesNotMatch(controller, /certificateUrl: pcci\.certificateUrl/);
  assert.match(storeController, /-pcciRegistration\.certificateUrl -supportingDocuments -vetRecords -proofOfOwnership -permits/);
});

test('customer marketplace pet details provide safe listing, store, and action sections', () => {
  const detail = read('client/src/pages/customer/PetDetail.js');
  for (const label of ['Quick Facts', 'Health Information', 'Temperament & Personality', 'PCCI Registration Information Provided', 'Chat Store', 'View Store', 'More from this store']) {
    assert.ok(detail.includes(label), `missing pet details section: ${label}`);
  }
  assert.match(detail, /certificateAvailable/);
  assert.match(detail, /favoritePets/);
  assert.match(detail, /Book a Service/);
  assert.doesNotMatch(detail, /certificateUrl/);
  assert.doesNotMatch(detail, /supportingDocuments|proofOfOwnership|pickupInstructions|vetRecords/);
});
