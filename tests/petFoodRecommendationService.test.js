const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  lifeStageForProfile,
  rankPetFoodProducts
} = require('../services/petFoodRecommendationService');

const product = (id, overrides = {}) => ({
  _id: id,
  name: 'Complete pet food',
  category: 'Pet Food',
  price: 300,
  suitableFor: ['dog'],
  tags: [],
  ratings: { average: 4.5 },
  ...overrides
});

test('saved profile age is converted into a deterministic food life stage', () => {
  const now = new Date('2026-11-18T00:00:00.000Z');
  assert.equal(lifeStageForProfile({ birthday: '2026-05-18' }, now), 'young');
  assert.equal(lifeStageForProfile({ approximateAge: { value: 3, unit: 'years' } }, now), 'adult');
  assert.equal(lifeStageForProfile({ approximateAge: { value: 8, unit: 'years' } }, now), 'senior');
  assert.equal(lifeStageForProfile({ approximateAge: { value: null, unit: 'years' } }, now), 'unknown');
});

test('food recommendations require species compatibility, life-stage compatibility, stock candidates, and budget fit', () => {
  const result = rankPetFoodProducts({
    budget: 500,
    now: new Date('2026-11-18T00:00:00.000Z'),
    petProfiles: [
      { _id: 'pet-1', name: 'Milo', type: 'dog', approximateAge: { value: 6, unit: 'months' } },
      { _id: 'pet-3', name: 'Buddy', type: 'dog', approximateAge: { value: 3, unit: 'years' } },
      { _id: 'pet-2', name: 'Luna', type: 'cat', approximateAge: { value: 8, unit: 'years' } }
    ],
    products: [
      product('puppy', { name: 'Puppy Growth Formula', price: 450, tags: ['puppy'] }),
      product('senior-cat', { name: 'Senior Cat Food', price: 400, suitableFor: ['cat'], tags: ['senior'] }),
      product('general', { name: 'All Pets Food', price: 250, suitableFor: ['all'] }),
      product('wrong-species', { name: 'Rabbit Food', suitableFor: ['rabbit'] }),
      product('wrong-stage', { name: 'Senior Dog Food', tags: ['senior'] }),
      product('over-budget', { name: 'Premium Puppy Food', price: 900, tags: ['puppy'] }),
      product('not-food', { category: 'Pet Accessories' })
    ]
  });

  assert.equal(result.status, 'ready');
  assert.deepEqual(result.recommendations.map(item => item.product._id), ['senior-cat', 'puppy', 'general']);
  assert.equal(result.recommendations.every(item => item.withinBudget), true);
  assert.deepEqual(result.budgetAlternatives.map(item => item.product._id), ['over-budget']);
  assert.match(result.recommendations[0].reasons.join(' '), /Within the ₱500 budget/);
  assert.deepEqual(result.recommendations.find(item => item.product._id === 'puppy').matchedPetNames, ['Milo']);
});

test('budget mismatch is distinct from missing pet profiles and incompatible food', () => {
  const petProfiles = [{ name: 'Milo', type: 'dog', approximateAge: { value: 2, unit: 'years' } }];
  assert.equal(rankPetFoodProducts({ products: [product('premium', { price: 800 })], petProfiles, budget: 500 }).status, 'budget_mismatch');
  assert.equal(rankPetFoodProducts({ products: [product('cat', { suitableFor: ['cat'] })], petProfiles, budget: 500 }).status, 'no_compatible_food');
  assert.equal(rankPetFoodProducts({ products: [], petProfiles: [], budget: 500 }).status, 'no_pet_profiles');
});

test('authenticated customer DSS route owns the product recommendation workflow', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../routes/dss.js'), 'utf8');
  const controller = fs.readFileSync(path.join(__dirname, '../controllers/productRecommendationController.js'), 'utf8');
  assert.match(routes, /customer\/product-recommendations[\s\S]*authenticate[\s\S]*customerOnly/);
  assert.match(routes, /body\('budget'\)\.isFloat/);
  assert.match(controller, /PetProfile\.find\(\{ owner: req\.user\._id \}\)/);
  assert.match(controller, /buildCustomerProductStockFilter/);
  assert.match(controller, /withCustomerComplianceFilter/);
});
