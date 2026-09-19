const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const DecisionSupportService = require('../services/decisionSupportService');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const preferences = overrides => ({
  monthlyBudget: '3000_5000',
  purchaseBudget: '10000_25000',
  space: 'apartment',
  homeOwnership: 'rent',
  livingArrangement: 'family',
  housingType: 'apartment',
  petRestrictions: 'allowed',
  existingPets: 'cats',
  lifestyle: ['calm', 'affectionate'],
  preferredSpecies: ['cat'],
  preferredSizes: ['small'],
  ...overrides
});

const pet = overrides => ({
  _id: 'pet-1',
  name: 'Mochi',
  species: 'cat',
  breed: 'Mixed',
  age: 2,
  ageUnit: 'years',
  size: 'small',
  price: 8000,
  temperament: 'calm affectionate and quiet',
  status: 'available',
  isAvailable: true,
  isDeleted: false,
  approvalStatus: 'approved',
  listingType: 'sale',
  store: { _id: 'store-1', name: 'Visible Store', isCustomerVisible: true },
  ...overrides
});

const assess = (listings = [pet()], input = preferences(), household = [{ name: 'Existing Cat', type: 'Cat' }]) =>
  DecisionSupportService.petCompatibilityAssessment(listings, input, household);

test('budget uses the actual one-time listing price and never invents monthly ownership cost', () => {
  const result = assess([pet({ price: 8000 }), pet({ _id: 'pet-2', price: 30000 })], preferences({ purchaseBudget: '5000_10000' }));
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.excluded.purchaseBudget, 1);
  assert.ok(result.recommendations[0].unknowns.some(text => /monthly ownership cost is unavailable/i.test(text)));
  assert.equal(result.recommendations[0].calculation.find(row => row.criterion === 'purchaseBudget').score, 100);
});

test('space compatibility requires recorded size and temperament instead of a size-only or breed rule', () => {
  const result = assess([pet(), pet({ _id: 'pet-2', name: 'Dash', size: 'large', temperament: 'energetic and active' })]);
  const goodSpace = result.recommendations.find(row => row.pet._id === 'pet-1').calculation.find(row => row.criterion === 'space');
  const poorSpace = result.recommendations.find(row => row.pet._id === 'pet-2').calculation.find(row => row.criterion === 'space');
  assert.equal(goodSpace.score, 100);
  assert.equal(poorSpace.score, 0);
  assert.doesNotMatch(goodSpace.explanation, /breed/i);
});

test('housing permission is distinct from compatibility and not-allowed housing makes every result conditional', () => {
  const result = assess([pet()], preferences({ petRestrictions: 'not_allowed' }));
  assert.equal(result.recommendations[0].eligibility.status, 'conditional');
  assert.equal(result.recommendations[0].matchLevel, 'Conditional Match');
  assert.ok(result.recommendations[0].considerations.some(text => /not currently allowed/i.test(text)));
});

test('living arrangement remains explicit unknown evidence when listings cannot support it', () => {
  const result = assess();
  assert.ok(result.recommendations[0].unknowns.some(text => /living-arrangement compatibility.*not scored/i.test(text)));
});

test('multiple lifestyle preferences use only explicit temperament evidence', () => {
  const result = assess([pet({ temperament: 'calm, affectionate, social and friendly' })], preferences({ lifestyle: ['calm', 'affectionate', 'social'] }));
  const lifestyle = result.recommendations[0].calculation.find(row => row.criterion === 'lifestyle');
  const activity = result.recommendations[0].calculation.find(row => row.criterion === 'activity');
  assert.equal(lifestyle.score, 100);
  assert.equal(activity.score, 100);
  assert.ok(result.recommendations[0].reasons.some(text => /recorded temperament/i.test(text)));
});

test('missing pet attributes stay unknown and are excluded from the evaluated denominator', () => {
  const result = assess([pet({ size: undefined, temperament: '' })]);
  const recommendation = result.recommendations[0];
  assert.equal(recommendation.calculation.find(row => row.criterion === 'space').score, null);
  assert.equal(recommendation.calculation.find(row => row.criterion === 'lifestyle').score, null);
  assert.ok(recommendation.evidenceCoverage < 100);
  assert.ok(recommendation.unknowns.length >= 3);
});

test('eligibility excludes unavailable, sold, inactive, unapproved, adoption, and hidden-store listings before scoring', () => {
  const result = assess([
    pet(),
    pet({ _id: 'unavailable', isAvailable: false }),
    pet({ _id: 'sold', status: 'sold' }),
    pet({ _id: 'deleted', isDeleted: true }),
    pet({ _id: 'pending', approvalStatus: 'pending' }),
    pet({ _id: 'adoption', listingType: 'adoption' }),
    pet({ _id: 'hidden-store', store: { _id: 'hidden', isCustomerVisible: false } })
  ]);
  assert.deepEqual(result.recommendations.map(row => row.pet._id), ['pet-1']);
  assert.equal(result.excluded.unavailable, 2);
  assert.equal(result.excluded.listingStatus, 3);
  assert.equal(result.excluded.storeVisibility, 1);
});

test('scoring and ranking are deterministic, explainable, and expose exact configured weights', () => {
  const listings = [pet({ _id: 'b', name: 'B' }), pet({ _id: 'a', name: 'A' })];
  const first = assess(listings);
  const second = assess(listings);
  assert.deepEqual(first.recommendations, second.recommendations);
  assert.equal(Object.values(first.weights).reduce((sum, weight) => sum + weight, 0), 100);
  assert.ok(first.recommendations.every(row => row.calculation.every(part => part.explanation)));
  assert.match(first.disclaimer, /not a guarantee.*veterinary diagnosis/i);
});

test('no suitable match is returned when actual listings exceed a selected maximum or species filter', () => {
  const result = assess([pet({ price: 20000, species: 'cat' })], preferences({ purchaseBudget: 'under_5000', preferredSpecies: ['dog'] }));
  assert.equal(result.recommendations.length, 0);
  assert.equal(result.excluded.purchaseBudget, 1);
});

test('controller loads owned Pet Profiles and filters actual sale listings through customer-visible stores', () => {
  const controller = read('controllers/dssController.js');
  assert.match(controller, /PetProfile\.find\(\{ owner: req\.user\._id \}\)/);
  assert.match(controller, /getCustomerVisibleOwnerIds/);
  assert.match(controller, /withCustomerComplianceFilter\(buildCustomerVisibleStoreFilter\(ownerIds\)\)/);
  assert.match(controller, /approvalStatus: 'approved'/);
  assert.match(controller, /listingType: 'sale'/);
  assert.match(controller, /status: 'available'/);
  assert.match(controller, /isAvailable: true/);
  assert.doesNotMatch(controller, /professionalProfile|taxProfile|documentUrl/);
});

test('pet matching is customer-authorized while existing service recommendations and route remain intact', () => {
  const routes = read('routes/dss.js');
  const serviceController = read('controllers/serviceRecommendationController.js');
  const app = read('client/src/App.js');
  assert.match(routes, /post\('\/customer\/pet-recommendations', authenticate, customerOnly, getCustomerPetRecommendations\)/);
  assert.match(routes, /get\('\/service-recommendations', authenticate, getServiceRecommendations\)/);
  assert.match(serviceController, /PetProfile\.findOne/);
  assert.match(app, /path="insights"/);
});

test('Customer DSS keeps guided responsive UI, dark mode, service advisor, and adjust-preferences flow', () => {
  const page = read('client/src/pages/customer/DSS.js');
  for (const text of ['Your Budget', 'Your Space', 'Your Home', 'Your Lifestyle', 'Pet Preferences', 'Compatibility Score', 'Why This Matches', 'Important Considerations', 'Adjust Preferences', 'Service Advisor']) {
    assert.match(page, new RegExp(text));
  }
  assert.match(page, /sm:grid-cols-2/);
  assert.match(page, /md:grid-cols/);
  assert.match(page, /dark:bg-slate/);
  assert.match(page, /overflow-x-auto/);
  assert.match(page, /to=\{`\/pets\/\$\{item\.pet\._id\}`\}/);
  assert.doesNotMatch(page, /Perfect Pet|Guaranteed Match|AI knows your personality/);
});

test('DSS makes no medical diagnosis or breed-only temperament inference', () => {
  const service = read('services/decisionSupportService.js');
  const controller = read('controllers/dssController.js');
  assert.match(service, /explicitly stored listing attributes only/);
  assert.match(service, /not a guarantee, behavioral assessment, or veterinary diagnosis/);
  assert.doesNotMatch(service, /pet\.breed|BREED_(TRAITS|TEMPERAMENT)|breedTemperament|breedMap/i);
  assert.match(controller, /No AI, machine learning, diagnosis, or medical inference is used/);
});
