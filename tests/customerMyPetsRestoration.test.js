const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('customer My Pets keeps the established card listing and management actions', () => {
  const profile = read('client/src/pages/customer/Profile.js');

  assert.match(profile, /label: 'My Pets'/);
  assert.match(profile, /petProfileService\.getMyPets\(\)/);
  assert.match(profile, /overflow-x-auto[^"']*snap-x[^"']*snap-mandatory/);
  assert.match(profile, /Add New Pet/);
  assert.match(profile, /View Profile/);
  assert.match(profile, /handleEditPet\(pet\)/);
  assert.match(profile, /handleDeletePet\(pet\._id\)/);
  assert.match(profile, /petProfileService\.createPet\(dataToSubmit\)/);
  assert.match(profile, /petProfileService\.updatePet\(editingPet\._id, dataToSubmit\)/);
  assert.match(profile, /petProfileService\.deletePet\(petId\)/);
});

test('canonical species values preserve the customer card icons and breed choices', () => {
  const profile = read('client/src/pages/customer/Profile.js');

  assert.match(profile, /normalizePetProfileType\(pet\.type\) === 'dog'/);
  assert.match(profile, /normalizePetProfileType\(pet\.type\) === 'cat'/);
  assert.match(profile, /const normalizedType = normalizePetProfileType\(type\)/);
  assert.match(profile, /normalizedType === 'dog'/);
  assert.match(profile, /normalizedType === 'cat'/);
});

test('customer PetProfile operations remain authenticated and owner-scoped', () => {
  const routes = read('routes/petProfiles.js');

  assert.match(routes, /router\.get\('\/', authenticate/);
  assert.match(routes, /PetProfile\.find\(\{ owner: req\.user\._id \}\)/);
  assert.match(routes, /router\.post\('\/', authenticate, petValidation/);
  assert.match(routes, /owner: req\.user\._id/);
  assert.match(routes, /router\.put\('\/:id', authenticate, petValidation/);
  assert.match(routes, /PetProfile\.findOne\(\{ _id: req\.params\.id, owner: req\.user\._id \}\)/);
  assert.match(routes, /router\.delete\('\/:id', authenticate/);
  assert.match(routes, /PetProfile\.findOneAndDelete\(\{ _id: req\.params\.id, owner: req\.user\._id \}\)/);
});

test('My Pets remains a profile workflow instead of a Service Advisor questionnaire', () => {
  const form = read('client/src/components/pets/PetProfileFormModal.js');

  assert.match(form, /title="Pet Photo"/);
  assert.match(form, /title="Basic Information"/);
  assert.match(form, /title="Health Information"/);
  assert.match(form, /PET_TYPE_OPTIONS\.map/);
  assert.match(form, /PET_SIZE_OPTIONS\.map/);
  assert.match(form, /PET_COAT_LENGTH_OPTIONS\.map/);
  assert.match(form, /PET_COAT_TYPE_OPTIONS\.map/);
  assert.doesNotMatch(form, /Service Advisor Profile|Preferred Service|Current Service Needs/);
});

test('Service Advisor remains independent with optional, non-mutating PetProfile prefill', () => {
  const advisor = read('client/src/components/ServiceAdvisorQuestionnaire.js');

  assert.match(advisor, /const INITIAL_ANSWERS = \{/);
  assert.match(advisor, /petProfileId: ''/);
  assert.match(advisor, /Use a saved pet profile \(optional\)/);
  assert.match(advisor, /Enter details manually/);
  assert.match(advisor, /updateAnswers\(\{ petProfileId: profileId, petType:/);
  assert.doesNotMatch(advisor, /petProfileService\.(createPet|updatePet|deletePet)/);
});

test('Pet Matching and marketplace Pet routes remain separate from My Pets and Service Advisor', () => {
  const dss = read('client/src/pages/customer/DSS.js');
  const app = read('client/src/App.js');

  assert.match(dss, />Pet Matching<\/button>/);
  assert.match(dss, />Service Advisor<\/button>/);
  assert.match(dss, /mode === 'service' \? <ServiceAdvisorQuestionnaire/);
  assert.match(app, /path="pets" element=\{<Pets \/>\}/);
  assert.match(app, /path="pets\/:id" element=\{<PetDetail \/>\}/);
  assert.match(app, /path="profile"/);
});
