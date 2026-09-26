const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Pet = require('../models/Pet');
const Store = require('../models/Store');
const DecisionSupportService = require('../services/decisionSupportService');
const { createPet } = require('../controllers/petController');
const {
  PET_SIZES,
  PET_TEMPERAMENT_TRAITS,
  PET_ACTIVITY_LEVELS,
  PET_CARE_LEVELS,
  PET_COMPATIBILITY_LEVELS
} = require('../utils/petListingAttributes');

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
  lifestyle: ['calm', 'affectionate', 'low_maintenance'],
  preferredSpecies: ['cat'],
  preferredSizes: ['small'],
  ...overrides
});
const listing = overrides => ({
  _id: 'listing-1',
  name: 'Mochi',
  species: 'cat',
  breed: 'Mixed',
  age: 2,
  ageUnit: 'years',
  gender: 'female',
  size: 'small',
  description: 'A customer-safe listing description with enough detail for validation.',
  price: 8000,
  images: ['https://example.com/mochi.jpg'],
  temperamentTraits: ['calm', 'affectionate'],
  activityLevel: 'low',
  careNeeds: { maintenance: 'low', grooming: 'moderate', training: 'low' },
  petCompatibility: { dogs: 'unknown', cats: 'compatible', otherPets: 'unknown' },
  status: 'available',
  isAvailable: true,
  approvalStatus: 'approved',
  listingType: 'sale',
  store: { _id: 'store-1', name: 'Visible Store', isCustomerVisible: true },
  ...overrides
});

test('Pet schema persists the canonical DSS attributes and exact shared enum values', () => {
  assert.deepEqual(Pet.schema.path('size').enumValues, [...PET_SIZES]);
  assert.deepEqual(Pet.schema.path('temperamentTraits').caster.enumValues, [...PET_TEMPERAMENT_TRAITS]);
  assert.deepEqual(Pet.schema.path('activityLevel').enumValues, [...PET_ACTIVITY_LEVELS]);
  assert.deepEqual(Pet.schema.path('careNeeds.maintenance').enumValues, [...PET_CARE_LEVELS]);
  assert.deepEqual(Pet.schema.path('petCompatibility.cats').enumValues, [...PET_COMPATIBILITY_LEVELS]);

  const petData = listing({ addedBy: '507f1f77bcf86cd799439011', store: '507f1f77bcf86cd799439012' });
  delete petData._id;
  const pet = new Pet(petData);
  const error = pet.validateSync();
  assert.equal(error, undefined);
  assert.deepEqual(pet.temperamentTraits, ['calm', 'affectionate']);
  assert.equal(pet.careNeeds.maintenance, 'low');
  assert.equal(pet.petCompatibility.cats, 'compatible');
});

test('structured seller attributes power space, temperament, activity, care, and household DSS factors', () => {
  const result = DecisionSupportService.petCompatibilityAssessment(
    [listing()],
    preferences(),
    [{ name: 'Existing Cat', type: 'Cat' }]
  );
  assert.equal(result.recommendations.length, 1);
  const factors = Object.fromEntries(result.recommendations[0].calculation.map(row => [row.criterion, row]));
  assert.equal(factors.space.score, 100);
  assert.equal(factors.lifestyle.score, 100);
  assert.equal(factors.activity.score, 100);
  assert.equal(factors.care.score, 100);
  assert.equal(factors.household.score, 100);
});

test('unknown seller evidence stays unknown and legacy temperament remains backward compatible', () => {
  const unknown = DecisionSupportService.petCompatibilityAssessment([
    listing({ temperamentTraits: [], activityLevel: 'unknown', careNeeds: {}, petCompatibility: {} })
  ], preferences(), [{ type: 'Cat' }]).recommendations[0];
  assert.equal(unknown.calculation.find(row => row.criterion === 'care').score, null);
  assert.equal(unknown.calculation.find(row => row.criterion === 'household').score, null);

  const legacy = DecisionSupportService.petCompatibilityAssessment([
    listing({ temperamentTraits: undefined, activityLevel: undefined, temperament: 'calm, affectionate and quiet' })
  ], preferences({ lifestyle: ['calm', 'affectionate'] }), []).recommendations[0];
  assert.equal(legacy.calculation.find(row => row.criterion === 'lifestyle').score, 100);
  assert.equal(legacy.calculation.find(row => row.criterion === 'activity').score, 100);
});

test('compact Add Pet collects aligned fields without exposing a separate Advanced options flow', () => {
  const form = read('client/src/components/pets/PetListingFormModal.js');
  for (const value of ['small', 'medium', 'large', 'extra_large', 'temperamentTraits', 'activityLevel', 'careNeeds', 'petCompatibility']) {
    assert.match(form, new RegExp(value));
  }
  assert.match(form, /Payment Strategy/);
  assert.match(form, /Pickup Availability/);
  assert.match(form, /Selling Permit/);
  assert.match(form, /Proof of Ownership/);
  assert.doesNotMatch(form, /Advanced options/);
});

test('create API requires aligned evidence and owns the approval/store identity fields server-side', () => {
  const adminRoutes = read('routes/adminPets.js');
  const regularRoutes = read('routes/pets.js');
  const controller = read('controllers/petController.js');
  for (const routes of [adminRoutes, regularRoutes]) {
    assert.match(routes, /temperamentTraits.*isArray\(\{ min: 1/);
    assert.match(routes, /activityLevel.*isIn\(PET_ACTIVITY_LEVELS\.filter/);
    assert.match(routes, /body\('birthday'\)\.isISO8601/);
    assert.match(routes, /body\('images'\)\.isArray\(\{ min: 1 \}\)/);
  }
  assert.match(controller, /approvalStatus: 'approved'/);
  assert.match(controller, /store: store\._id/);
  assert.match(controller, /approvalStatus,[\s\S]*\.\.\.listingData/);
});

test('a valid aligned Add Pet payload is saved with authoritative Store and approval state', async () => {
  const originalFindStore = Store.findOne;
  const originalSave = Pet.prototype.save;
  const originalFindPet = Pet.findById;
  const ownerId = '507f1f77bcf86cd799439011';
  const storeId = '507f1f77bcf86cd799439012';
  let saved;
  Store.findOne = async () => ({ _id: storeId });
  Pet.prototype.save = async function save() {
    const error = this.validateSync();
    if (error) throw error;
    saved = this.toObject();
    return this;
  };
  Pet.findById = () => ({ populate: async () => saved });

  const req = {
    user: { _id: ownerId, role: 'store_owner' },
    body: {
      ...listing(),
      _id: undefined,
      store: '507f1f77bcf86cd799439099',
      addedBy: '507f1f77bcf86cd799439098',
      approvalStatus: 'rejected',
      birthday: '2024-01-15',
      paymentConfig: 'full_payment'
    }
  };
  let statusCode = 200;
  let response;
  const res = {
    status(value) { statusCode = value; return this; },
    json(value) { response = value; return this; }
  };

  try {
    await createPet(req, res);
    assert.equal(statusCode, 201);
    assert.equal(response.message, 'Pet created successfully');
    assert.equal(String(saved.store), storeId);
    assert.equal(String(saved.addedBy), ownerId);
    assert.equal(saved.approvalStatus, 'approved');
    assert.deepEqual(saved.temperamentTraits, ['calm', 'affectionate']);
    assert.equal(saved.activityLevel, 'low');
  } finally {
    Store.findOne = originalFindStore;
    Pet.prototype.save = originalSave;
    Pet.findById = originalFindPet;
  }
});

test('Customer DSS query fetches every structured listing attribute used for scoring', () => {
  const controller = read('controllers/dssController.js');
  for (const field of ['temperamentTraits', 'activityLevel', 'careNeeds', 'petCompatibility']) {
    assert.match(controller, new RegExp(field));
  }
  assert.match(controller, /approvalStatus: 'approved'/);
  assert.match(controller, /status: 'available'/);
  assert.match(controller, /isAvailable: true/);
});
