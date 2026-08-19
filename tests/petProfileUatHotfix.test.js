const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PetProfile = require('../models/PetProfile');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('pet profile retains PCCI compatibility and optional supporting documents', () => {
  assert.ok(PetProfile.schema.path('pcciRegistration.certificateUrl'));
  assert.ok(PetProfile.schema.path('supportingDocuments'));
  assert.ok(PetProfile.schema.path('supportingDocuments.url'));
  assert.ok(PetProfile.schema.path('supportingDocuments.name'));

  const routeSource = read('routes/petProfiles.js');
  assert.match(routeSource, /const pcciApplicable = String\(body\.type\)\.toLowerCase\(\) === 'dog'/);
  assert.doesNotMatch(routeSource, /pcciApplicable[^\n]+breedStatus === 'purebred'/);
  assert.match(routeSource, /'supportingDocuments'/);
});

test('customer Add and Edit Pet use the compact personal-profile workflow without listing documents', () => {
  const componentSource = read('client/src/components/pets/PetProfileFormModal.js');
  const profileSource = read('client/src/pages/customer/Profile.js');

  for (const label of [
    'Pet Photo',
    'Basic Information',
    'Health Information'
  ]) assert.match(componentSource, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  assert.match(componentSource, /petForm\.vaccinationStatus === 'Vaccinated'/);
  assert.match(componentSource, /saveDisabled=\{!isComplete\}/);
  assert.match(componentSource, /CompactFormModal/);
  assert.match(profileSource, /editingPet=\{editingPet\}/);
  assert.doesNotMatch(componentSource, /PCCI Registration|Supporting Documents|Ownership Documents/);
  assert.doesNotMatch(profileSource, /pcciCertificateUrl|PCCI registration information provided/);
});

test('customer pet photo and vaccination records retain existing upload services', () => {
  const profileSource = read('client/src/pages/customer/Profile.js');
  assert.match(profileSource, /uploadService\.uploadImage\(formData\)/);
  assert.match(profileSource, /vaccinationUrls/);
  assert.doesNotMatch(profileSource, /uploadService\.uploadDocument/);
});
