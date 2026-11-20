const test = require('node:test');
const assert = require('node:assert/strict');
const { rankProductsForPet } = require('../services/productRecommendationService');
const { calculateDssReadiness } = require('../utils/productDss');

const readyProfile = (overrides = {}) => ({
  suitableSpecies: ['cat'],
  suitableBreeds: [],
  allBreeds: true,
  lifeStages: ['adult'],
  petSizes: ['small'],
  ingredients: 'salmon, rice',
  allergens: ['none'],
  ...overrides
});

const product = (id, overrides = {}) => ({
  _id: id,
  name: id,
  category: 'Pet Food',
  price: 400,
  recommendationProfile: readyProfile(),
  ...overrides
});

const pet = (overrides = {}) => ({
  _id: 'pet-1',
  name: 'Clark',
  type: 'cat',
  breed: 'Persian',
  size: 'Small',
  approximateAge: { value: 3, unit: 'years' },
  weight: 4,
  weightUnit: 'kg',
  activityLevel: 'low',
  allergies: 'None',
  ...overrides
});

test('recommendations differ for two pets of the same species when breed, coat, and activity differ', () => {
  const products = [
    product('persian-grooming', {
      category: 'Pet Accessories',
      recommendationProfile: readyProfile({
        subcategory: 'grooming', suitableBreeds: ['persian'], allBreeds: false,
        coatTypes: ['long'], activityLevels: ['low'], ingredients: '', allergens: []
      })
    }),
    product('siamese-toy', {
      category: 'Pet Accessories',
      recommendationProfile: readyProfile({
        subcategory: 'toys', suitableBreeds: ['siamese'], allBreeds: false,
        petSizes: ['small'], activityLevels: ['high'], ingredients: '', allergens: []
      })
    })
  ];
  const persian = rankProductsForPet({
    products,
    petProfiles: [pet({ coat: { type: 'long' }, activityLevel: 'low' })],
    budget: 1000
  });
  const siamese = rankProductsForPet({
    products,
    petProfiles: [pet({ _id: 'pet-2', name: 'Luna', breed: 'Siamese', coat: { type: 'short' }, activityLevel: 'high' })],
    budget: 1000
  });

  assert.deepEqual(persian.recommendations.map(item => item.product._id), ['persian-grooming']);
  assert.deepEqual(siamese.recommendations.map(item => item.product._id), ['siamese-toy']);
});

test('hard rules exclude allergens, expired products, incomplete declarations, and budget overflow', () => {
  const result = rankProductsForPet({
    products: [
      product('safe'),
      product('allergen', { recommendationProfile: readyProfile({ allergens: ['chicken'] }) }),
      product('expired', { expiryDate: '2026-01-01' }),
      product('incomplete', { recommendationProfile: {} }),
      product('premium', { price: 1200 })
    ],
    petProfiles: [pet({ allergies: 'Chicken' })],
    budget: 500,
    now: new Date('2026-11-21T00:00:00.000Z')
  });

  assert.deepEqual(result.recommendations.map(item => item.product._id), ['safe']);
  assert.deepEqual(result.suitableAlternatives.map(item => item.product._id), ['premium']);
  assert.equal(result.exclusionSummary['Product is expired.'], 1);
  assert.equal(result.exclusionSummary['Product information is incomplete for reliable matching.'], 1);
  assert.ok(Object.keys(result.exclusionSummary).some(reason => reason.includes('allergen')));
});

test('health and wellness matches carry a veterinary-guidance warning', () => {
  const result = rankProductsForPet({
    products: [product('joint-supplement', {
      category: 'Pet Health Care',
      recommendationProfile: readyProfile({
        ingredients: '', allergens: [], intendedPurposes: ['joint support'],
        benefits: ['joint'], requiresVeterinaryGuidance: true
      })
    })],
    petProfiles: [pet({ healthConcerns: ['joint'] })],
    budget: 500
  });

  assert.equal(result.recommendations[0].product._id, 'joint-supplement');
  assert.match(result.recommendations[0].warnings.join(' '), /not treatments/i);
});

test('missing pet facts never satisfy declared age, weight, breed, size, or measurement limits', () => {
  const restricted = product('fitted-harness', {
    category: 'Pet Accessories',
    recommendationProfile: readyProfile({
      subcategory: 'accessories',
      allBreeds: false,
      suitableBreeds: ['persian'],
      minAgeMonths: 12,
      maxWeightKg: 8,
      neckMinCm: 18,
      neckMaxCm: 30,
      ingredients: '',
      allergens: []
    })
  });
  const result = rankProductsForPet({
    products: [restricted],
    petProfiles: [pet({ breed: '', size: '', approximateAge: {}, weight: '', bodyMeasurements: {} })],
    budget: 500
  });

  assert.equal(result.status, 'no_compatible_products');
  assert.ok(Object.keys(result.exclusionSummary).some(reason => /needed to confirm/i.test(reason)));
});

test('accessory fit uses saved body measurements and rejects an out-of-range item', () => {
  const result = rankProductsForPet({
    products: [
      product('fitted-collar', {
        category: 'Pet Accessories',
        recommendationProfile: readyProfile({
          subcategory: 'accessories', neckMinCm: 20, neckMaxCm: 28,
          ingredients: '', allergens: []
        })
      }),
      product('oversized-collar', {
        category: 'Pet Accessories',
        recommendationProfile: readyProfile({
          subcategory: 'accessories', neckMinCm: 35, neckMaxCm: 45,
          ingredients: '', allergens: []
        })
      })
    ],
    petProfiles: [pet({ bodyMeasurements: { neckCm: 24 } })],
    budget: 500
  });

  assert.deepEqual(result.recommendations.map(item => item.product._id), ['fitted-collar']);
  assert.match(result.recommendations[0].reasons.join(' '), /body measurements/i);
});

test('DSS readiness distinguishes missing data from contradictory fit ranges', () => {
  assert.equal(calculateDssReadiness('Pet Food', readyProfile()).status, 'dss_ready');
  assert.equal(calculateDssReadiness('Pet Food', {}).status, 'incomplete_information');
  assert.equal(calculateDssReadiness('Pet Food', readyProfile(), [{ reviewStatus: 'seller_review_required' }]).status, 'incomplete_information');
  const correction = calculateDssReadiness('Pet Food', readyProfile({ minWeightKg: 12, maxWeightKg: 5 }));
  assert.equal(correction.status, 'needs_correction');
  assert.match(correction.issues.join(' '), /Weight minimum/);
});
