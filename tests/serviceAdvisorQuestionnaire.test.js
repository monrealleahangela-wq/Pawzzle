const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  classifyBudget,
  evaluateQuestionnaireServices,
  normalizeQuestionnaire,
  normalizeRequirementsInput,
  requirementFieldsForServices,
  resolveAdvisorPrice,
  serviceCategoriesForNeed,
  valueInBudgetBand
} = require('../utils/serviceAdvisorQuestionnaire');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const questionnaire = overrides => ({
  budget: 'under_500',
  petType: 'dog',
  serviceNeed: 'grooming',
  priority: 'compatibility',
  details: {},
  ...overrides
});

const service = ({
  id,
  name,
  price,
  category = 'grooming',
  criteria = {},
  pricingRules = {},
  isActive = true,
  isDeleted = false
}) => ({
  _id: id,
  name,
  description: `${name} description`,
  price,
  category,
  isActive,
  isDeleted,
  images: [],
  store: { _id: 'store-1', name: 'Verified Store' },
  pricingRules,
  recommendationCriteria: {
    enabled: true,
    applicablePetTypes: ['any'],
    applicableSizes: ['any'],
    coatLengths: ['any'],
    coatTypes: ['any'],
    ...criteria
  }
});

test('questionnaire normalizes canonical and legacy pet types and rejects unsupported payload fields', () => {
  assert.equal(normalizeQuestionnaire(questionnaire({ petType: ' Canine ' })).petType, 'dog');
  assert.equal(normalizeQuestionnaire(questionnaire({ petType: 'Feline' })).petType, 'cat');
  assert.throws(() => normalizeQuestionnaire(questionnaire({ budget: 'cheap' })), /supported service budget/);
  assert.throws(() => normalizeQuestionnaire({ ...questionnaire(), score: 100 }), /unsupported fields/);
  assert.throws(() => normalizeQuestionnaire(questionnaire({ details: { diagnosis: 'healthy' } })), /unsupported fields/);
  assert.throws(() => normalizeRequirementsInput({ petType: 'dog', serviceNeed: 'grooming', hidden: true }), /unsupported fields/);
});

test('service needs map only to actual persisted Service category values', () => {
  assert.deepEqual(serviceCategoriesForNeed('grooming'), ['grooming']);
  assert.deepEqual(serviceCategoriesForNeed('boarding_hotel'), ['boarding_hotel']);
  assert.deepEqual(serviceCategoriesForNeed('health_wellness'), ['health_wellness']);
  assert.deepEqual(serviceCategoriesForNeed('explore'), []);
  const categories = new Set(require('../models/Service').schema.path('category').enumValues);
  for (const need of ['grooming', 'health_wellness', 'boarding_hotel', 'training', 'pet_services', 'home_services', 'other']) {
    serviceCategoriesForNeed(need).forEach(category => assert.equal(categories.has(category), true));
  }
});

test('budget bands are precise and non-overlapping at every boundary', () => {
  assert.equal(valueInBudgetBand(499.99, 'under_500'), true);
  assert.equal(valueInBudgetBand(500, 'under_500'), false);
  assert.equal(valueInBudgetBand(500, '500_1000'), true);
  assert.equal(valueInBudgetBand(1000, '500_1000'), true);
  assert.equal(valueInBudgetBand(1000, '1000_2000'), false);
  assert.equal(valueInBudgetBand(1000.01, '1000_2000'), true);
  assert.equal(valueInBudgetBand(2000, '1000_2000'), true);
  assert.equal(valueInBudgetBand(2000, '2000_5000'), false);
  assert.equal(valueInBudgetBand(5000, '2000_5000'), true);
  assert.equal(valueInBudgetBand(5000, 'above_5000'), false);
  assert.equal(valueInBudgetBand(5000.01, 'above_5000'), true);
  assert.equal(valueInBudgetBand(999999, 'flexible'), true);
});

test('critical grooming example returns a real dog-compatible service under ₱500 and excludes a cat-only service', () => {
  const bath = service({ id: 'bath', name: 'Basic Dog Bath', price: 450, criteria: { applicablePetTypes: ['dog'] } });
  const catSpa = service({ id: 'cat-spa', name: 'Cat Spa', price: 300, criteria: { applicablePetTypes: ['cat'] } });
  const result = evaluateQuestionnaireServices({
    services: [catSpa, bath],
    questionnaire: questionnaire(),
    pet: { type: 'dog', size: 'unknown', coat: {} }
  });
  assert.equal(result.status, 'matches');
  assert.deepEqual(result.recommendations.map(item => item.service._id), ['bath']);
  assert.equal(result.recommendations[0].pricing.minPrice, 450);
  assert.match(result.recommendations[0].explanations.join(' '), /Grooming \/ Bath/);
  assert.match(result.recommendations[0].explanations.join(' '), /Supports dogs/);
});

test('unknown restricted attributes produce missing-information while unrestricted services remain compatible', () => {
  const sized = service({ id: 'sized', name: 'Small Pet Groom', price: 350, criteria: { applicablePetTypes: ['dog'], applicableSizes: ['small'] } });
  const missing = evaluateQuestionnaireServices({
    services: [sized],
    questionnaire: questionnaire(),
    pet: { type: 'dog', size: 'unknown', coat: {} }
  });
  assert.equal(missing.status, 'missing_information');
  assert.deepEqual(missing.missingFields.map(item => item.field), ['size']);

  const unrestricted = service({ id: 'all', name: 'All Dog Bath', price: 350, criteria: { applicablePetTypes: ['dog'] } });
  const match = evaluateQuestionnaireServices({
    services: [unrestricted],
    questionnaire: questionnaire(),
    pet: { type: 'dog', size: 'unknown', coat: {} }
  });
  assert.equal(match.status, 'matches');
});

test('conditional questions are derived only from restrictions on species-compatible candidate services', () => {
  const dogSize = service({ id: 'dog-size', name: 'Dog Size Service', price: 300, criteria: { applicablePetTypes: ['dog'], applicableSizes: ['small'] } });
  const dogCoat = service({ id: 'dog-coat', name: 'Dog Coat Service', price: 300, criteria: { applicablePetTypes: ['dog'], coatLengths: ['long'], coatTypes: ['curly'] } });
  const catSize = service({ id: 'cat-size', name: 'Cat Size Service', price: 300, criteria: { applicablePetTypes: ['cat'], applicableSizes: ['large'] } });
  assert.deepEqual(requirementFieldsForServices([dogSize, dogCoat, catSize], 'dog').map(item => item.field), ['size', 'coatLength', 'coatType']);

  const sizePriced = service({ id: 'size-price', name: 'Size Priced', price: 300, pricingRules: { petSize: { enabled: true } } });
  assert.deepEqual(requirementFieldsForServices([sizePriced], 'dog').map(item => item.field), ['size']);
});

test('fixed and dynamic persisted pricing are classified truthfully without treating missing prices as zero', () => {
  const fixed = resolveAdvisorPrice(service({ id: 'fixed', name: 'Fixed', price: 500 }), { type: 'dog' });
  assert.equal(fixed.status, 'fixed');
  assert.equal(fixed.comparablePrice, 500);
  assert.equal(classifyBudget(fixed, '500_1000'), 'within_budget');
  assert.equal(classifyBudget(fixed, 'under_500'), 'over_budget');

  const ranged = resolveAdvisorPrice(service({
    id: 'range',
    name: 'Size Pricing',
    price: 400,
    pricingRules: { petSize: { enabled: true, small: 0, medium: 100, large: 250, extraLarge: 500 } }
  }), { type: 'dog', size: 'unknown' });
  assert.deepEqual([ranged.status, ranged.minPrice, ranged.maxPrice], ['range', 400, 900]);
  assert.equal(classifyBudget(ranged, '500_1000'), 'outside_budget');

  const unknown = resolveAdvisorPrice({ price: null }, {});
  assert.equal(unknown.status, 'unknown');
  assert.equal(unknown.comparablePrice, null);
  const unknownResult = evaluateQuestionnaireServices({
    services: [{ ...service({ id: 'unknown', name: 'Unknown Price', price: 1 }), price: null }],
    questionnaire: questionnaire(),
    pet: { type: 'dog', coat: {} }
  });
  assert.equal(unknownResult.status, 'pricing_unavailable');
});

test('budget mismatch and flexible-budget results stay distinct', () => {
  const premium = service({ id: 'premium', name: 'Premium Groom', price: 1200, criteria: { applicablePetTypes: ['dog'] } });
  const overBudget = evaluateQuestionnaireServices({ services: [premium], questionnaire: questionnaire(), pet: { type: 'dog', coat: {} } });
  assert.equal(overBudget.status, 'budget_mismatch');
  assert.equal(overBudget.recommendations.length, 0);
  assert.deepEqual(overBudget.budgetAlternatives.map(item => item.service._id), ['premium']);

  const flexible = evaluateQuestionnaireServices({ services: [premium], questionnaire: questionnaire({ budget: 'flexible' }), pet: { type: 'dog', coat: {} } });
  assert.equal(flexible.status, 'matches');
  assert.deepEqual(flexible.recommendations.map(item => item.service._id), ['premium']);
});

test('priority changes ranking deterministically without bypassing hard eligibility', () => {
  const broadCheap = service({ id: 'cheap', name: 'Affordable Groom', price: 250, criteria: { applicablePetTypes: ['any'] } });
  const exactPremium = service({ id: 'exact', name: 'Dog Specialist', price: 450, criteria: { applicablePetTypes: ['dog'], applicableSizes: ['small'] } });
  const pet = { type: 'dog', size: 'small', coat: {} };
  const compatible = evaluateQuestionnaireServices({ services: [broadCheap, exactPremium], questionnaire: questionnaire(), pet });
  assert.deepEqual(compatible.recommendations.map(item => item.service._id), ['exact', 'cheap']);
  const lowest = evaluateQuestionnaireServices({ services: [exactPremium, broadCheap], questionnaire: questionnaire({ priority: 'lowest_price' }), pet });
  assert.deepEqual(lowest.recommendations.map(item => item.service._id), ['cheap', 'exact']);
  const neutral = evaluateQuestionnaireServices({ services: [exactPremium, broadCheap], questionnaire: questionnaire({ priority: 'no_preference' }), pet });
  assert.deepEqual(neutral.recommendations.map(item => item.service.name), ['Affordable Groom', 'Dog Specialist']);
});

test('inactive, deleted, and seller-opt-out services cannot become questionnaire recommendations', () => {
  const inactive = service({ id: 'inactive', name: 'Inactive', price: 200, isActive: false });
  const deleted = service({ id: 'deleted', name: 'Deleted', price: 200, isDeleted: true });
  const optedOut = service({ id: 'opted-out', name: 'Opted Out', price: 200, criteria: { enabled: false } });
  const result = evaluateQuestionnaireServices({ services: [inactive, deleted, optedOut], questionnaire: questionnaire(), pet: { type: 'dog', coat: {} } });
  assert.equal(result.status, 'no_compatible_services');
  assert.equal(result.recommendations.length, 0);
});

test('controller preserves public Store scope, explicit opt-in, owner-scoped profiles, customer authorization, and read-only requests', () => {
  const controller = read('controllers/serviceRecommendationController.js');
  const routes = read('routes/dss.js');
  const questionnaireHandler = controller.slice(
    controller.indexOf('const createServiceAdvisorRecommendations'),
    controller.indexOf('const resolveAdminStore')
  );
  assert.match(controller, /withCustomerComplianceFilter\(buildCustomerVisibleStoreFilter\(ownerIds\)\)/);
  assert.match(controller, /isActive: true/);
  assert.match(controller, /isDeleted: \{ \$ne: true \}/);
  assert.match(controller, /'recommendationCriteria\.enabled': true/);
  assert.match(controller, /PetProfile\.findOne\(\{ _id: questionnaire\.petProfileId, owner: req\.user\._id \}\)/);
  assert.doesNotMatch(questionnaireHandler, /\.(save|create|updateOne|findOneAndUpdate)\(/);
  assert.match(routes, /router\.post\('\/service-recommendations', authenticate, customerOnly, createServiceAdvisorRecommendations\)/);
  assert.match(routes, /router\.post\('\/service-advisor\/requirements', authenticate, customerOnly, getServiceAdvisorRequirements\)/);
});

test('Pet Matching DSS remains separate from questionnaire matching', () => {
  const customerDss = read('client/src/pages/customer/DSS.js');
  assert.match(customerDss, /dssService\.getPetRecommendations\(preferences\)/);
  assert.match(customerDss, /<ServiceAdvisorQuestionnaire insights=\{insights\}/);
  assert.doesNotMatch(read('utils/serviceAdvisorQuestionnaire.js'), /approvalStatus/);
});
