const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildCustomerVisibleStoreFilter,
  isCustomerVisibleStoreRecord
} = require('../utils/storeVisibility');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('customer store visibility requires a current active owner and verified active store', () => {
  const ownerIds = ['owner-1', 'owner-2'];
  assert.deepEqual(buildCustomerVisibleStoreFilter(ownerIds), {
    owner: { $in: ownerIds },
    isActive: true,
    isDeleted: { $ne: true },
    verificationStatus: 'verified',
    name: { $ne: 'Admin Pet Store' }
  });

  assert.deepEqual(buildCustomerVisibleStoreFilter(ownerIds, { _id: 'store-1' }).$and, [
    { _id: 'store-1' }
  ]);
});

test('a legitimate verified Pawzzle store qualifies without a name-specific exception', () => {
  const owner = { _id: 'owner-pawzzle', role: 'admin', isActive: true, isDeleted: false };
  const pawzzle = {
    _id: 'store-pawzzle',
    name: 'Pawzzle',
    owner: owner._id,
    verificationStatus: 'verified',
    isActive: true,
    isDeleted: false
  };

  assert.equal(isCustomerVisibleStoreRecord(pawzzle, owner), true);
  assert.equal(isCustomerVisibleStoreRecord({ ...pawzzle, verificationStatus: 'pending' }, owner), false);
  assert.equal(isCustomerVisibleStoreRecord({ ...pawzzle, verificationStatus: 'suspended' }, owner), false);
  assert.equal(isCustomerVisibleStoreRecord({ ...pawzzle, isActive: false }, owner), false);
  assert.equal(isCustomerVisibleStoreRecord({ ...pawzzle, isDeleted: true }, owner), false);
});

test('orphaned jilay remains excluded while Pawzzle legacy admin ownership stays valid', () => {
  const legacyOwner = { _id: 'owner-pawzzle', role: 'admin', isActive: true, isDeleted: false };
  const store = { owner: legacyOwner._id, verificationStatus: 'verified', isActive: true, isDeleted: false };
  assert.equal(isCustomerVisibleStoreRecord(store, legacyOwner), true);
  assert.equal(isCustomerVisibleStoreRecord({ ...store, owner: 'missing-owner' }, null), false);
  assert.equal(isCustomerVisibleStoreRecord(store, { ...legacyOwner, role: 'customer' }), false);
});

test('all customer store endpoints share the same visibility source of truth', () => {
  const controller = read('controllers/storeController.js');
  assert.match(controller, /const getAllStores[\s\S]*getCustomerVisibleOwnerIds\(\)[\s\S]*buildCustomerVisibleStoreFilter\(ownerIds\)/);
  assert.match(controller, /const getStoreById[\s\S]*buildCustomerVisibleStoreFilter\(ownerIds, \{ _id: req\.params\.id \}\)/);
  assert.match(controller, /const getStoreDetails[\s\S]*buildCustomerVisibleStoreFilter\(ownerIds, \{ _id: req\.params\.id \}\)/);
  assert.match(controller, /const getStoreByOwner[\s\S]*buildCustomerVisibleStoreFilter\(ownerIds, \{ owner: ownerId \}\)/);
  assert.match(controller, /const getStoreLocations[\s\S]*Store\.find\(buildCustomerVisibleStoreFilter\(ownerIds\)\)/);
});

test('customer Stores accepts Cavite municipalities and retrieves every API page', () => {
  const storesPage = read('client/src/pages/customer/Stores.js');
  const locationUtility = read('client/src/utils/storeLocation.js');

  assert.match(storesPage, /while \(hasNext\)[\s\S]*getAllStores\(\{ page, limit: 50 \}\)/);
  assert.match(storesPage, /isCaviteAddress\(store\.contactInfo\?\.address\)/);
  assert.match(locationUtility, /'bacoor'[\s\S]*'imus'[\s\S]*'kawit'[\s\S]*'silang'[\s\S]*'tagaytay'/);
  assert.doesNotMatch(storesPage, /state\.includes\('cavite'\) \|\| city\.includes\('cavite'\)/);
});

test('Pawzzle search remains case-insensitive and has no platform-name exclusion', () => {
  const controller = read('controllers/storeController.js');
  assert.match(controller, /\{ name: \{ \$regex: search, \$options: 'i' \} \}/);
  assert.doesNotMatch(controller, /name: \{ \$ne: ['"]Pawzzle['"] \}/);
});

test('shops without coordinates remain listed but cannot start broken directions', () => {
  const findShops = read('client/src/pages/customer/FindShops.js');
  assert.match(findShops, /disabled=\{!hasMapCoordinates\(store\)\}/);
  assert.match(findShops, /Map Location Unavailable/);
  assert.match(findShops, /if \(!hasMapCoordinates\(store\)\)[\s\S]*has not added a map location yet/);
});

test('application approval cannot create an orphaned or duplicate store', () => {
  const controller = read('controllers/storeApplicationController.js');
  assert.match(controller, /User\.findOne\(\{[\s\S]*_id: application\.applicant[\s\S]*isActive: \{ \$ne: false \}[\s\S]*isDeleted: \{ \$ne: true \}/);
  assert.match(controller, /cannot be approved because its applicant account is missing, archived, or inactive/);
  assert.match(controller, /Store\.findOne\(\{ owner: applicant\._id, isDeleted: \{ \$ne: true \} \}\)/);
});

test('platform archive cannot permanently delete a store ownership identity', () => {
  const archiveController = read('controllers/archiveController.js');
  assert.match(archiveController, /if \(type === 'users'\)[\s\S]*Store\.findOne\(\{ owner: item\._id \}\)/);
  assert.match(archiveController, /preserve the store ownership record/);
});

test('platform application history and account pagination remain available', () => {
  const applicationController = read('controllers/storeApplicationController.js');
  const applicationUi = read('client/src/pages/admin/StoreApplications.js');
  const userController = read('controllers/userController.js');
  const authController = read('controllers/authController.js');

  assert.match(applicationController, /StoreApplication\.find\(filter\)[\s\S]*populate\('applicant'/);
  assert.match(applicationController, /attachStoreSummaries\(applications\)/);
  assert.match(applicationUi, /Applicant account unavailable/);
  assert.match(applicationUi, /application remains visible for audit history/);
  assert.match(applicationUi, /Approve Store Verification/);
  assert.match(applicationUi, /storeService\.approveVerification\(storeId\)/);
  assert.match(userController, /User\.find\(filter\)[\s\S]*skip\(skip\)[\s\S]*limit\(parseInt\(limit\)\)/);
  assert.match(authController, /if \(!user\.isActive\)/);
  assert.match(authController, /isDeleted: false/);
});

test('verification approval remains platform-only and rejects orphan ownership', () => {
  const routes = read('routes/stores.js');
  const controller = read('controllers/storeController.js');
  assert.match(routes, /router\.post\('\/:id\/approve-verification', authenticate, superAdminOnly, approveVerification\)/);
  assert.match(controller, /const approveVerification[\s\S]*role: \{ \$in: \['admin', 'store_owner'\] \}[\s\S]*owner account is restored/);
});

test('store tenant resolution remains server-owned and cross-store requests stay blocked', () => {
  const resolver = read('utils/resolveStore.js');
  assert.match(resolver, /String\(explicitStore\) !== String\(req\.user\.store\)/);
  assert.match(resolver, /PLATFORM_ROLES\.has\(req\.user\.role\) \? explicitStore : null/);
  assert.match(resolver, /Store\.findOne\(\{ owner: req\.user\?\._id \}\)/);
});
