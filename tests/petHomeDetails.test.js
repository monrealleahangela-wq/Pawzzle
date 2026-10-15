const test = require('node:test');
const assert = require('node:assert/strict');
const Pet = require('../models/Pet');
const Store = require('../models/Store');
const User = require('../models/User');
const { createPet, updatePet, getPetById } = require('../controllers/petController');
const { normalizePetHomeDetails, keepCommonHomeDetails } = require('../utils/petHomeDetails');

const ownerId = '507f1f77bcf86cd799439011';
const storeId = '507f1f77bcf86cd799439012';
const petId = '507f1f77bcf86cd799439013';
const response = () => {
  const result = { statusCode: 200, body: null };
  return { result, status(code) { result.statusCode = code; return this; }, json(body) { result.body = body; return this; } };
};
const validPet = extra => ({
  name: 'Milo', species: 'bird', breed: 'Mixed', birthday: '2024-01-01', age: 2,
  gender: 'male', size: 'small', description: 'Seller-provided listing details.', price: 5000,
  images: ['https://res.cloudinary.com/demo/image/upload/pawzzle/pets/milo.jpg'],
  activityLevel: 'low', temperamentTraits: ['calm'], ...extra
});

test('optional species-specific Home Details use exact numbers and preserve unknown legacy records', () => {
  const details = normalizePetHomeDetails({
    enclosureLengthCm: '80.5', ventilationNotes: ' Fresh air ', indoor: 'conditional'
  }, 'bird');
  assert.deepEqual(details, { enclosureLengthCm: 80.5, ventilationNotes: 'Fresh air', indoor: 'conditional' });
  const pet = new Pet({ ...validPet({ homeDetails: details }), addedBy: ownerId, store: storeId });
  assert.equal(pet.validateSync(), undefined);
  assert.equal(pet.toObject().homeDetails.enclosureLengthCm, 80.5);
  const legacy = new Pet({ ...validPet(), addedBy: ownerId, store: storeId });
  assert.equal(legacy.homeDetails, undefined);
  assert.equal(legacy.validateSync(), undefined);
});

test('invalid, fabricated, or species-inapplicable requirements fail validation', () => {
  for (const [value, species] of [
    [{ aquariumVolumeLiters: 40 }, 'dog'],
    [{ enclosureLengthCm: -1 }, 'bird'],
    [{ enclosureLengthCm: 'Infinity' }, 'bird'],
    [{ indoor: true }, 'cat'],
    [{ temperatureMinC: 40, temperatureMaxC: 20 }, 'reptile'],
    [{ humidityMinPercent: 90, humidityMaxPercent: 30 }, 'reptile'],
    [{ speciesCareNotes: 'x'.repeat(1001) }, 'fish'],
    [{ inventedCare: 'safe for children' }, 'dog']
  ]) assert.throws(() => normalizePetHomeDetails(value, species), { statusCode: 400 });
  assert.deepEqual(keepCommonHomeDetails({ indoor: 'suitable', aquariumVolumeLiters: 50 }), { indoor: 'suitable' });
});

test('create and edit persist validated Home Details while rejecting invalid edits', async () => {
  const originalStoreFind = Store.findOne;
  const originalSave = Pet.prototype.save;
  const originalPetFind = Pet.findById;
  const originalUpdate = Pet.findByIdAndUpdate;
  const originalStores = Store.find;
  let saved;
  let operation;
  Store.findOne = async () => ({ _id: storeId });
  Store.find = () => ({ select() { return this; }, async lean() { return [{ _id: storeId }]; } });
  Pet.prototype.save = async function () { assert.equal(this.validateSync(), undefined); saved = this.toObject(); return this; };
  Pet.findById = () => ({
    populate: async () => saved,
    then(resolve) { return resolve({ _id: petId, name: 'Milo', species: 'bird', store: storeId,
      addedBy: ownerId, status: 'available', paymentConfig: 'full_payment', homeDetails: saved?.homeDetails }); }
  });
  Pet.findByIdAndUpdate = (_id, value) => {
    operation = value;
    return { populate: async () => ({ ...saved, ...value.$set }) };
  };
  try {
    const created = response();
    await createPet({ user: { _id: ownerId, role: 'store_owner' }, body: validPet({
      homeDetails: { enclosureWidthCm: '45', flightSpaceNotes: 'Daily supervised flight' }
    }) }, created);
    assert.equal(created.result.statusCode, 201);
    assert.equal(saved.homeDetails.enclosureWidthCm, 45);
    const edited = response();
    await updatePet({ params: { id: petId }, user: { _id: ownerId, role: 'store_owner' },
      body: { homeDetails: { enclosureWidthCm: '50', indoor: 'suitable' } } }, edited);
    assert.equal(edited.result.statusCode, 200);
    assert.equal(operation.$set.homeDetails.enclosureWidthCm, 50);
    const rejected = response();
    operation = null;
    await updatePet({ params: { id: petId }, user: { _id: ownerId, role: 'store_owner' },
      body: { homeDetails: { aquariumVolumeLiters: 50 } } }, rejected);
    assert.equal(rejected.result.statusCode, 400);
    assert.equal(operation, null);
  } finally {
    Store.findOne = originalStoreFind;
    Store.find = originalStores;
    Pet.prototype.save = originalSave;
    Pet.findById = originalPetFind;
    Pet.findByIdAndUpdate = originalUpdate;
  }
});
test('customer pet fetch includes Home Details without private seller documents', async () => {
  const originalFind = Pet.findById;
  const originalUserFind = User.find;
  const originalStoreFind = Store.findOne;
  const pet = new Pet({ ...validPet({ homeDetails: { ventilationNotes: 'Airy room' } }),
    _id: petId, addedBy: ownerId, store: storeId, status: 'available', isAvailable: true,
    proofOfOwnership: ['private'] });
  Pet.findById = () => ({ populate() { return this; }, then(resolve) { return Promise.resolve(pet).then(resolve); } });
  User.find = () => ({ distinct: async () => [ownerId] });
  Store.findOne = () => ({ select: async () => ({ _id: storeId, name: 'Visible Store' }) });
  try {
    const res = response();
    await getPetById({ params: { id: petId }, baseUrl: '/api/pets' }, res);
    assert.equal(res.result.statusCode, 200);
    assert.equal(res.result.body.pet.homeDetails.ventilationNotes, 'Airy room');
    assert.equal(res.result.body.pet.proofOfOwnership, undefined);
  } finally {
    Pet.findById = originalFind;
    User.find = originalUserFind;
    Store.findOne = originalStoreFind;
  }
});
