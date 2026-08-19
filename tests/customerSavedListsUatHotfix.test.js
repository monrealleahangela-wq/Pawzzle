const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
const profile = read('client/src/pages/customer/Profile.js');
const savedLists = read('client/src/components/profile/SavedProfileLists.js');
const socialController = read('controllers/socialController.js');

test('Following navigation renders the followed-store panel', () => {
  assert.match(profile, /id: 'followers'[\s\S]{0,120}label: 'Following'/);
  assert.match(profile, /activeTab === 'followers'[\s\S]{0,240}<FollowingPanel/);
  assert.doesNotMatch(profile, /activeTab === 'following'/);
  assert.match(profile, /onClick=\{\(\) => setActiveTab\('followers'\)\}/);
});

test('Favorites supports all existing saved-item categories and route navigation', () => {
  for (const category of ['pets', 'products', 'services', 'stores']) {
    assert.match(savedLists, new RegExp(`id: '${category}'`));
  }

  for (const route of ['/pets/', '/products/', '/bookings?service=', '/stores/']) {
    assert.ok(savedLists.includes(route), `missing existing navigation route ${route}`);
  }

  assert.match(profile, /favoritePets/);
  assert.match(profile, /favoriteStores/);
  assert.match(profile, /getUserFavorites/);
});

test('saved lists include skeletons, empty states, and immediate update handlers', () => {
  assert.match(savedLists, /Loading favorites/);
  assert.match(savedLists, /Loading followed stores/);
  assert.match(savedLists, /No favorites yet\./);
  assert.match(savedLists, /You're not following any stores yet\./);
  assert.match(savedLists, /Browse Stores/);
  assert.match(savedLists, /Explore Marketplace/);
  assert.match(profile, /setFollowing\(previous => previous\.filter/);
  assert.match(profile, /setFavorites\(previous => \(\{/);
});

test('following endpoint reuses its query to return public store card details', () => {
  for (const field of ['name', 'logo', 'businessType', 'ratings', 'contactInfo.address']) {
    assert.ok(socialController.includes(field), `missing followed store field ${field}`);
  }
  assert.match(socialController, /store: store\?\.toObject\(\) \|\| null/);
});
