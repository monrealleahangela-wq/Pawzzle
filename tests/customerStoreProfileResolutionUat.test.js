const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Store = require('../models/Store');
const {
  CUSTOMER_VISIBLE_STORE_FIELDS,
  buildCustomerVisibleStoreFilter,
  withCustomerComplianceFilter
} = require('../utils/storeVisibility');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('public Store projection is an allowlist without private parent-child path collisions', () => {
  const query = Store.findOne({ _id: '69c11078fc3043d57380d7b0' })
    .select(CUSTOMER_VISIBLE_STORE_FIELDS);
  query._applyPaths();
  const projection = query.projection();

  assert.equal(projection._id, 1);
  assert.equal(projection.name, 1);
  assert.equal(projection.contactInfo, 1);
  assert.ok(Object.values(projection).every(value => value === 1));
  assert.equal(Object.keys(projection).some(field => field === 'taxProfile' || field.startsWith('taxProfile.')), false);
  assert.equal(Object.keys(projection).some(field => field === 'businessCompliance' || field.startsWith('businessCompliance.')), false);
  assert.equal(Object.keys(projection).some(field => field.startsWith('payout')), false);
});

test('list and profile endpoints share the same customer visibility policy and canonical Store id', () => {
  const controller = read('controllers/storeController.js');
  const routes = read('routes/stores.js');
  const app = read('client/src/App.js');
  const service = read('client/src/services/apiService.js');

  assert.match(controller, /const findCustomerVisibleStore = async id/);
  assert.match(controller, /Store\.findOne\(withCustomerComplianceFilter\(buildCustomerVisibleStoreFilter\(ownerIds, \{ _id: id \}\)\)\)/);
  assert.match(controller, /const stores = await Store\.find\(filter\)[\s\S]*\.select\(CUSTOMER_VISIBLE_STORE_FIELDS\)/);
  assert.doesNotMatch(controller, /select\('-taxProfile -businessProfile\.registrationNumber -businessCompliance/);
  assert.match(routes, /router\.get\('\/:id\/details', getStoreDetails\)/);
  assert.match(app, /path="stores\/:storeId" element=\{<StoreDetail \/>\}/);
  assert.match(service, /getStoreDetails: \(id\) => api\.get\(`\/stores\/\$\{id\}\/details`\)/);
});

test('customer store links use Store _id rather than owner or StoreApplication identifiers', () => {
  for (const file of [
    'client/src/pages/customer/Stores.js',
    'client/src/pages/customer/FindShops.js'
  ]) {
    const source = read(file);
    assert.match(source, /to=\{`\/stores\/\$\{store\._id\}`\}/);
    assert.doesNotMatch(source, /storeApplicationId|applicationId/);
  }

  for (const file of [
    'client/src/pages/customer/Products.js',
    'client/src/pages/customer/Pets.js',
    'client/src/pages/customer/Services.js'
  ]) {
    assert.match(read(file), /to=\{`\/stores\/\$\{[^}]*\.store\?\._id \|\| [^}]*\.store\}`\}/);
  }
});

test('invalid Store identifiers remain 404 while backend failures are not mislabeled as missing stores', () => {
  const controller = read('controllers/storeController.js');
  const detail = read('client/src/pages/customer/StoreDetail.js');

  assert.match(controller, /error\?\.name === 'CastError'[\s\S]*status\(404\)\.json\(\{ message: 'Store not found' \}\)/);
  assert.match(controller, /status\(500\)\.json\(\{ message: 'Unable to load store right now' \}\)/);
  assert.match(detail, /error\.response\?\.status === 404/);
  assert.match(detail, /setLoadError\(notFound \? 'not_found' : 'failed'\)/);
  assert.match(detail, /Unable to Load Store/);
  assert.match(detail, /Store Not Found/);
});

test('pet and followed-store entry points cannot expose an inaccessible Store profile link', () => {
  const petController = read('controllers/petController.js');
  const socialController = read('controllers/socialController.js');

  assert.match(petController, /const visibleStores = await Store\.find\([\s\S]*withCustomerComplianceFilter\(buildCustomerVisibleStoreFilter/);
  assert.match(petController, /filter\.store = \{ \$in: visibleStores\.map\(store => store\._id\) \}/);
  assert.match(petController, /const publicStore = await Store\.findOne\(withCustomerComplianceFilter\(buildCustomerVisibleStoreFilter/);
  assert.match(petController, /if \(!publicStore\) return res\.status\(404\)\.json\(\{ message: 'Pet not found or unavailable' \}\)/);
  assert.match(socialController, /Store\.find\(withCustomerComplianceFilter\(buildCustomerVisibleStoreFilter\(ownerIds/);
});

test('visibility filter continues to reject inactive, deleted, unverified, and restricted stores', () => {
  const filter = withCustomerComplianceFilter(buildCustomerVisibleStoreFilter(['owner-1'], { _id: 'store-1' }));
  assert.deepEqual(filter.owner, { $in: ['owner-1'] });
  assert.equal(filter.isActive, true);
  assert.deepEqual(filter.isDeleted, { $ne: true });
  assert.equal(filter.verificationStatus, 'verified');
  assert.deepEqual(filter.$and, [{ _id: 'store-1' }]);
  assert.deepEqual(filter['businessCompliance.restrictionReasons'], {
    $not: { $elemMatch: { active: true } }
  });
});
