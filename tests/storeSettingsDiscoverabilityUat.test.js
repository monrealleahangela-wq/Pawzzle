const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Store Owner navigation exposes the existing Store Settings delivery deep link', () => {
  const layout = read('client/src/components/Layout.js');
  const app = read('client/src/App.js');

  assert.match(layout, /path: '\/admin\/settings\?section=delivery', label: 'Store Settings'/);
  assert.match(layout, /case 'admin':\s*\n\s*case 'store_owner': return getAdminMenu\(user\)/);
  assert.match(app, /path="admin\/settings" element=\{<ProtectedRoute roles=\{\['admin'\]\}><AdminSettings/);
  assert.equal((app.match(/path="admin\/settings"/g) || []).length, 1);
});

test('query-backed settings links keep active state in expanded and collapsed navigation', () => {
  const layout = read('client/src/components/Layout.js');

  assert.match(layout, /navigationPathname = \(path = ''\) => path\.split\(\/\[\?#\]\/\)\[0\]/);
  assert.match(layout, /isNavigationPathActive\(currentPath, child\.path\)/);
  assert.match(layout, /title=\{group\.label\}/);
  assert.match(layout, /currentPath=\{location\.pathname\}/);
  assert.match(layout, /renderNavItems\(menuItems, false, \(\) => setIsMobileMenuOpen\(false\)\)/);
});

test('Store Settings sections are discoverable and Delivery supports a stable deep link', () => {
  const settings = read('client/src/pages/admin/AdminSettings.js');

  assert.match(settings, /useSearchParams/);
  assert.match(settings, /searchParams\.get\('section'\)/);
  assert.match(settings, /SETTINGS_SECTIONS\.has\(requestedSection\)/);
  assert.match(settings, /nextParams\.set\('section', section\)/);
  assert.match(settings, /\['delivery', 'Delivery & Shipping'\]/);
  assert.match(settings, /\['tax', 'Tax Information'\]/);
  assert.match(settings, /to="\/admin\/store"/);
});

test('delivery section explains incomplete configuration without inventing rates', () => {
  const settings = read('client/src/pages/admin/AdminSettings.js');
  const panel = read('client/src/components/settings/DeliveryPricingSettings.js');

  assert.match(settings, /baseFee: ''/);
  assert.match(settings, /ratePerKilometer: ''/);
  assert.match(panel, /Delivery pricing is not configured/);
  assert.match(panel, /Configure Delivery Pricing/);
  for (const label of ['Active', 'Inactive', 'Location required', 'Not configured']) {
    assert.match(panel, new RegExp(label));
  }
  assert.match(panel, /dark:border-primary-900/);
  assert.match(panel, /sm:flex-row/);
});

test('owner settings APIs reject generic staff while platform oversight retains explicit store routes', () => {
  const routes = read('routes/stores.js');
  const auth = read('middleware/auth.js');

  assert.match(auth, /const storeOwnerOnly = \(req, res, next\)/);
  assert.match(auth, /if \(!isStoreAdmin\(req\.user\)\)/);
  assert.match(routes, /get\('\/settings', authenticate, storeOwnerOnly/);
  assert.match(routes, /get\('\/my-store\/delivery-pricing', authenticate, storeOwnerOnly/);
  assert.match(routes, /put\('\/my-store\/delivery-pricing', authenticate, storeOwnerOnly/);
  assert.match(routes, /get\('\/:id\/delivery-pricing', authenticate, superAdminOnly/);
  assert.match(routes, /put\('\/:id\/delivery-pricing', authenticate, superAdminOnly/);
});

test('store settings middleware accepts both owner aliases and rejects non-owner roles', () => {
  const { storeOwnerOnly } = require('../middleware/auth');
  const run = role => {
    let nextCalled = false;
    let statusCode = null;
    let payload = null;
    const req = { user: role ? { role } : null };
    const res = {
      status(code) { statusCode = code; return this; },
      json(body) { payload = body; return this; }
    };
    storeOwnerOnly(req, res, () => { nextCalled = true; });
    return { nextCalled, statusCode, payload };
  };

  assert.equal(run('admin').nextCalled, true);
  assert.equal(run('store_owner').nextCalled, true);
  assert.equal(run('manager').statusCode, 403);
  assert.equal(run('platform_admin').statusCode, 403);
  assert.equal(run(null).statusCode, 401);
});

test('customer, supplier, and staff navigation do not receive Store Owner settings', () => {
  const layout = read('client/src/components/Layout.js');
  const customerEnd = layout.indexOf('const getAdminMenu');
  const customerMenu = layout.slice(layout.indexOf('const customerMenu'), customerEnd);
  const supplierStart = layout.indexOf('const supplierMenu');
  const supplierEnd = layout.indexOf('const publicMenu', supplierStart);
  const supplierMenu = layout.slice(supplierStart, supplierEnd);
  const staffStart = layout.indexOf('const getStaffMenu');
  const staffEnd = layout.indexOf('const NavLink', staffStart);
  const staffMenu = layout.slice(staffStart, staffEnd);

  assert.doesNotMatch(customerMenu, /\/admin\/settings/);
  assert.doesNotMatch(supplierMenu, /\/admin\/settings/);
  assert.doesNotMatch(staffMenu, /\/admin\/settings/);
});
