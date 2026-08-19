const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const profile = fs.readFileSync(path.join(__dirname, '..', 'client', 'src', 'pages', 'customer', 'Profile.js'), 'utf8');

test('customer profile uses clear navigation labels without changing tab identities', () => {
  const expected = [
    ["id: 'overview'", "label: 'Activity'"],
    ["id: 'details'", "label: 'My Information'"],
    ["id: 'pets'", "label: 'My Pets'"],
    ["id: 'favorites'", "label: 'Favorites'"],
    ["id: 'followers'", "label: 'Following'"],
    ["id: 'security'", "label: 'Security'"],
    ["id: 'upgrade'", "label: 'Become a Seller'"]
  ];

  for (const [id, label] of expected) {
    assert.match(profile, new RegExp(`${id}[\\s\\S]{0,120}${label}`));
  }

  for (const legacyLabel of ['Ecosystem activity', 'Personal records', 'Curated list', 'Platform network', 'Access control', 'Register as seller']) {
    assert.doesNotMatch(profile, new RegExp(legacyLabel, 'i'));
  }
});

test('profile navigation remains tied to the existing active-tab handler', () => {
  assert.match(profile, /onClick=\{\(\) => setActiveTab\(item\.id\)\}/);
  assert.match(profile, /activeTab === item\.id/);
});
