const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const routePages = {
  dashboard: 'client/src/pages/superadmin/Dashboard.js',
  permissions: 'client/src/pages/superadmin/RolePermissions.js',
  'account-management': 'client/src/pages/superadmin/AccountManagement.js',
  'store-applications': 'client/src/pages/admin/StoreApplications.js',
  'transaction-history': 'client/src/pages/superadmin/TransactionHistory.js',
  'system-analytics': 'client/src/pages/superadmin/SystemAnalytics.js',
  'booking-history': 'client/src/pages/superadmin/BookingHistory.js',
  archive: 'client/src/pages/superadmin/ArchiveManagement.js',
  reports: 'client/src/pages/superadmin/ReportManagement.js',
  feedback: 'client/src/pages/superadmin/FeedbackManagement.js',
  support: 'client/src/pages/superadmin/SupportManagement.js',
  insights: 'client/src/pages/superadmin/DSS.js',
  'activity-history': 'client/src/pages/superadmin/ActivityHistory.js',
  suppliers: 'client/src/pages/superadmin/SupplierManagement.js',
  payouts: 'client/src/pages/admin/Payouts.js'
};

test('every routed platform administration page remains present and protected', () => {
  const app = read('client/src/App.js');
  assert.equal(Object.keys(routePages).length, 15);
  for (const [route, page] of Object.entries(routePages)) {
    assert.ok(fs.existsSync(path.join(root, page)), `missing page for /superadmin/${route}`);
    assert.ok(app.includes(`path="superadmin/${route}"`), `missing /superadmin/${route} route`);
  }
  assert.equal((app.match(/path="superadmin\//g) || []).length, 15);
  assert.equal((app.match(/roles=\{\['super_admin'\]\}/g) || []).length >= 15, true);
});

test('platform role aliases share the same compact shell and navigation', () => {
  const layout = read('client/src/components/Layout.js');
  const authorization = read('client/src/utils/authorization.js');

  assert.match(authorization, /PLATFORM_ADMIN_ROLES = new Set\(\['super_admin', 'platform_admin'\]\)/);
  assert.match(layout, /PLATFORM_ADMIN_ROLES\.has\(user\?\.role\)/);
  assert.match(layout, /super-admin-ui-shell/);
  assert.match(layout, /super-admin-interface/);

  for (const route of Object.keys(routePages)) {
    assert.ok(layout.includes(`/superadmin/${route}`), `navigation omits /superadmin/${route}`);
  }
});

test('compact portal scope standardizes typography, spacing, cards, tables, forms, and overlays', () => {
  const css = read('client/src/styles/Global.css');
  for (const selector of [
    '.super-admin-interface h1',
    '.super-admin-interface h2',
    '.super-admin-interface button',
    '.super-admin-interface input',
    '.super-admin-interface textarea',
    '.super-admin-interface table th',
    '.super-admin-interface table thead',
    '.super-admin-ui-shell .sidebar-nav-item'
  ]) assert.ok(css.includes(selector), `missing compact rule: ${selector}`);

  for (const token of ['text-6xl', 'text-5xl', 'text-4xl', 'p-20', 'p-16', 'p-12', 'p-10', 'p-8', 'py-24', 'py-20', 'rounded-[3rem]']) {
    assert.ok(css.includes(`[class~="${token}"]`), `legacy size ${token} is not normalized`);
  }
  assert.match(css, /max-height: calc\(100dvh - 1\.5rem\)/);
});

test('platform portal has explicit dark-mode and mobile safeguards', () => {
  const css = read('client/src/styles/Global.css');
  assert.match(css, /\.dark \.super-admin-interface \.bg-white/);
  assert.match(css, /\.dark \.super-admin-interface input/);
  assert.match(css, /\.dark \.super-admin-interface input::placeholder/);
  assert.match(css, /\.dark \.super-admin-interface table thead/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.super-admin-interface table \{ min-width: 42rem; \}/);
  assert.match(css, /overflow-x: hidden/);
});

test('plain-language labels and accessible permission controls are present', () => {
  const layout = read('client/src/components/Layout.js');
  const permissions = read('client/src/pages/superadmin/RolePermissions.js');
  const dss = read('client/src/pages/superadmin/DSS.js');

  for (const label of ['Accounts', 'Transactions', 'Analytics', 'Payouts', 'Archive', 'Support', 'Activity', 'Suppliers', 'Role Permissions']) {
    assert.ok(layout.includes(`label: '${label}'`), `missing navigation label: ${label}`);
  }
  assert.match(permissions, /role="switch"/);
  assert.match(permissions, /aria-checked=\{checked\}/);
  assert.match(permissions, /overflow-x-auto/);
  assert.match(dss, /Decision support is unavailable/);
  assert.match(dss, /Try Again/);
  assert.doesNotMatch(dss, /Universal[\s\S]*Meta-Intelligence/);
});
