const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'client', 'src', 'App.js'), 'utf8');

test('customer order pages cannot render inside seller or platform portals', () => {
  const routes = appSource.split(/\r?\n/).filter(line => line.includes('<Route path="orders'));
  assert.equal(routes.length, 2);
  routes.forEach(route => {
    assert.match(route, /roles=\{\['customer'\]\}/);
    assert.doesNotMatch(route, /'admin'|'store_owner'|'super_admin'|'platform_admin'/);
  });
});
