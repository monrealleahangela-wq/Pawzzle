const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PetProfile = require('../models/PetProfile');
const Service = require('../models/Service');
const { ageInYears } = require('../utils/bookingPetSnapshot');
const {
  PET_TYPES,
  normalizePetType,
  evaluateHardEligibility,
  profileCompleteness,
  normalizeRecommendationCriteria
} = require('../utils/serviceAdvisorPetContract');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const restrictedCriteria = {
  applicablePetTypes: ['dog'],
  applicableSizes: ['small'],
  coatLengths: ['short'],
  coatTypes: ['straight'],
  relevantNeeds: ['bathing'],
  preferenceTags: ['grooming']
};

test('shared contract normalizes supported legacy species aliases to canonical values', () => {
  assert.deepEqual(PET_TYPES, ['dog', 'cat', 'bird', 'rabbit', 'hamster', 'other']);
  assert.equal(normalizePetType(' Dog '), 'dog');
  assert.equal(normalizePetType('Dogs'), 'dog');
  assert.equal(normalizePetType('Canine'), 'dog');
  assert.equal(normalizePetType('Feline'), 'cat');
  assert.equal(normalizePetType('unsupported-species'), null);

  const pet = new PetProfile({ owner: '507f1f77bcf86cd799439011', name: 'Milo', type: 'Canine', breed: 'Mixed', gender: 'Male' });
  assert.equal(pet.type, 'dog');
});

test('Pet and Service schemas consume the same canonical eligibility options', () => {
  assert.deepEqual(Service.schema.path('recommendationCriteria.applicablePetTypes').caster.enumValues, ['any', ...PET_TYPES]);
  assert.deepEqual(Service.schema.path('recommendationCriteria.applicableSizes').caster.enumValues, ['any', 'small', 'medium', 'large', 'extra_large']);
  assert.deepEqual(Service.schema.path('recommendationCriteria.coatLengths').caster.enumValues, ['any', 'short', 'medium', 'long']);
});

test('hard eligibility accepts exact matches and rejects species or size mismatches', () => {
  const dog = { type: 'Dog', size: 'Small', coat: { length: 'short', type: 'straight' } };
  assert.equal(evaluateHardEligibility(dog, restrictedCriteria).eligible, true);
  assert.equal(evaluateHardEligibility({ ...dog, type: 'Cat' }, restrictedCriteria).eligible, false);
  assert.equal(evaluateHardEligibility({ ...dog, size: 'Large' }, restrictedCriteria).eligible, false);
});

test('unknown hard-eligibility data blocks restricted services and returns profile guidance', () => {
  const pet = { type: 'dog', size: 'Unknown', coat: { length: 'unknown', type: 'unknown' }, serviceNeeds: [] };
  const service = { recommendationCriteria: restrictedCriteria };
  const eligibility = evaluateHardEligibility(pet, restrictedCriteria);
  assert.equal(eligibility.eligible, false);
  assert.deepEqual(eligibility.missingFields.map(item => item.field), ['size', 'coat.length', 'coat.type']);

  const completeness = profileCompleteness(pet, [service]);
  assert.equal(completeness.complete, false);
  assert.equal(completeness.blockedServiceCount, 1);
  assert.ok(completeness.missingFields.some(item => item.field === 'serviceNeeds'));
});

test('unrestricted criteria do not turn unknown optional fields into hard exclusions', () => {
  const criteria = { applicablePetTypes: ['any'], applicableSizes: ['any'], coatLengths: ['any'], coatTypes: ['any'] };
  const result = evaluateHardEligibility({ type: 'dog', size: 'Unknown', coat: {} }, criteria);
  assert.equal(result.eligible, true);
});

test('service criteria are canonicalized and unsupported client values are rejected', () => {
  const normalized = normalizeRecommendationCriteria({
    enabled: true,
    applicablePetTypes: ['Dog', 'dogs'],
    applicableSizes: ['Small'],
    coatLengths: ['SHORT'],
    coatTypes: ['double coat'],
    relevantNeeds: ['bathing'],
    preferenceTags: [' Grooming ', 'grooming'],
    useCompletedHistory: true
  });
  assert.deepEqual(normalized.applicablePetTypes, ['dog']);
  assert.deepEqual(normalized.applicableSizes, ['small']);
  assert.deepEqual(normalized.coatTypes, ['double_coat']);
  assert.deepEqual(normalized.preferenceTags, ['grooming']);
  assert.throws(() => normalizeRecommendationCriteria({ applicablePetTypes: ['reptile'] }), /Invalid pet type/);
});

test('mixed age units remain mathematically correct and weight is not a Service Advisor constraint', () => {
  assert.equal(ageInYears({ approximateAge: { value: 6, unit: 'months' } }), 0.5);
  assert.equal(ageInYears({ approximateAge: { value: 6, unit: 'years' } }), 6);
  const controller = read('controllers/serviceRecommendationController.js');
  assert.match(controller, /ageInYears\(pet, now\)/);
  assert.doesNotMatch(controller, /criteria\.(minWeight|maxWeight|weightRange|minAge|maxAge|ageRange)/);
});

test('owned profile, public Store scope, mutation validation, and incomplete-profile UI remain connected', () => {
  const controller = read('controllers/serviceRecommendationController.js');
  const serviceController = read('controllers/serviceController.js');
  const routes = read('routes/petProfiles.js');
  const profileForm = read('client/src/components/pets/PetProfileFormModal.js');
  const serviceEditor = read('client/src/pages/admin/ServiceManagement.js');
  const advisor = read('client/src/pages/customer/DSS.js');

  assert.match(controller, /PetProfile\.findOne\(\{ _id: req\.query\.petId, owner: req\.user\._id \}\)/);
  assert.match(controller, /withCustomerComplianceFilter\(buildCustomerVisibleStoreFilter/);
  assert.doesNotMatch(controller, /approvalStatus/);
  assert.match(serviceController, /SERVICE_MUTABLE_FIELDS/);
  assert.doesNotMatch(serviceController, /const updates = req\.body/);
  assert.match(routes, /const profileFields = \[/);
  assert.match(routes, /body\('serviceNeeds\.\*'\).*isIn\(SERVICE_NEEDS\)/);
  assert.match(routes, /body\('approximateAge\.unit'\).*isIn\(\['months', 'years'\]\)/);
  assert.match(profileForm, /Service Advisor Profile/);
  assert.match(serviceEditor, /PET_TYPE_OPTIONS\.map/);
  assert.match(advisor, /profileCompleteness\.missingFields/);
  assert.match(advisor, /currentRequest = false/);
});
