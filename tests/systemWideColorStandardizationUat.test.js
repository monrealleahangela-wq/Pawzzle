const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Pawzzle exposes one brand palette and maps legacy decorative accents to it', () => {
  const config = read('client/tailwind.config.js');

  for (const hex of ['#8B4513', '#BFA6A0', '#FDF5F0', '#5D2E0D']) {
    assert.ok(config.includes(hex), `missing established Pawzzle color ${hex}`);
  }

  for (const family of ['blue', 'indigo', 'purple', 'violet', 'fuchsia', 'pink', 'cyan', 'sky', 'teal', 'lime', 'orange', 'yellow']) {
    assert.match(config, new RegExp(`\\b${family}: pawzzleAccent`), `${family} remains a separate module accent`);
  }

  assert.match(config, /success:\s*\{[\s\S]*#15803D/);
  assert.match(config, /warning:\s*\{[\s\S]*#B45309/);
  assert.match(config, /error:\s*\{[\s\S]*#BE123C/);
});

test('shared controls use brand, neutral, and meaning-based semantic colors', () => {
  const button = read('client/src/components/ui/Button.js');
  const badge = read('client/src/components/ui/Badge.js');
  const toast = read('client/src/components/ui/Toast.js');
  const indexCss = read('client/src/index.css');

  assert.match(button, /primary: ["']bg-primary-600/);
  assert.match(button, /secondary: ["']border border-neutral-300 bg-white text-neutral-700/);
  assert.match(button, /destructive: ["']bg-error-600/);
  assert.match(badge, /success: ["']bg-success-50 text-success-700 border-success-200/);
  assert.match(badge, /warning: ["']bg-warning-50 text-warning-700 border-warning-200/);
  assert.match(badge, /error: ["']bg-error-50 text-error-700 border-error-200/);
  assert.match(toast, /bg-success-50 border-success-200/);
  assert.match(toast, /bg-error-50 border-error-200/);
  assert.match(indexCss, /accent-color: #8B4513/);
  assert.match(indexCss, /:focus-visible[\s\S]*outline: 2px solid #8B4513/);
});

test('light and dark surfaces cover legacy pages, forms, overlays, and semantic states', () => {
  const css = read('client/src/styles/Global.css');

  for (const token of [
    '--surface-page', '--surface-card', '--surface-subtle', '--border-subtle',
    '--brand-primary', '--brand-primary-soft', '--status-success-soft',
    '--status-warning-soft', '--status-danger-soft'
  ]) assert.ok(css.includes(token), `missing theme token ${token}`);

  assert.match(css, /\.dark input,[\s\S]*\.dark textarea,[\s\S]*\.dark select/);
  assert.match(css, /\.dark input::placeholder/);
  assert.match(css, /\[role="dialog"\], \[role="menu"\], \[role="listbox"\]/);
  assert.match(css, /border-success-200/);
  assert.match(css, /border-warning-200/);
  assert.match(css, /border-error-200/);
  assert.match(css, /bg-indigo-50[\s\S]*background-color: var\(--brand-primary-soft\)/);
  assert.match(css, /text-purple-700[\s\S]*color: var\(--brand-primary\)/);
});

test('customer, staff, supplier, delivery, and platform surfaces share brand emphasis', () => {
  const sources = {
    supplier: read('client/src/pages/supplier/SupplierDashboard.js'),
    specialist: read('client/src/components/admin/SpecializedStaffDashboard.js'),
    rider: read('client/src/components/admin/RiderDashboard.js'),
    delivery: read('client/src/components/delivery/RiderDeliveryWorkspace.js'),
    platformSupplier: read('client/src/pages/superadmin/SupplierManagement.js'),
    platformDss: read('client/src/pages/superadmin/DSS.js'),
    customerTracking: read('client/src/pages/DeliveryTracking.js'),
    customerShops: read('client/src/pages/customer/FindShops.js')
  };

  assert.doesNotMatch(sources.supplier, /bg-indigo-600|bg-purple-600/);
  assert.doesNotMatch(sources.specialist, /text-blue-600|text-violet-600/);
  assert.doesNotMatch(sources.rider, /text-orange-600|bg-orange-600/);
  assert.doesNotMatch(sources.delivery, /bg-indigo-600|text-indigo-600/);
  assert.doesNotMatch(sources.platformSupplier, /bg-purple-|text-purple-|bg-indigo-|text-indigo-/);
  assert.doesNotMatch(sources.platformDss, /bg-indigo-|text-indigo-/);
  assert.match(sources.customerTracking, /color="#8B4513"/);
  assert.match(sources.customerShops, /color="#8B4513"/);
});

test('charts are restrained while statuses retain labels and semantic colors', () => {
  const chart = read('client/src/components/ui/Chart.js');
  const adminDashboard = read('client/src/pages/admin/Dashboard.js');
  const supplier = read('client/src/pages/superadmin/SupplierManagement.js');

  assert.match(chart, /'#8B4513', '#BFA6A0', '#2E2D2D', '#766D6A', '#D9D0C9', '#5D2E0D'/);
  assert.match(adminDashboard, /\['#8B4513', '#BFA6A0', '#475569'\]/);
  assert.match(supplier, /text-emerald-500/);
  assert.match(supplier, />Verify</);
  assert.match(supplier, />Suspend</);
  assert.match(supplier, />Reactivate</);
  assert.match(supplier, />Reject</);
});

test('global theme reaches every routed interface without changing route ownership', () => {
  const app = read('client/src/App.js');
  const index = read('client/src/index.js');

  assert.match(app, /import '\.\/styles\/Global\.css'/);
  assert.match(index, /import '\.\/index\.css'/);
  for (const routeFragment of [
    'seller-join', 'rider-track/:token', 'checkout', 'booking-calendar',
    'admin/dashboard', 'admin/purchase-orders', 'admin/logistics',
    'supplier/dashboard', 'superadmin/dashboard', 'superadmin/suppliers'
  ]) assert.ok(app.includes(routeFragment), `representative routed interface missing: ${routeFragment}`);

  assert.match(app, /roles=\{\['super_admin'\]\}/);
  assert.match(app, /roles=\{\['supplier', 'customer'\]\}/);
  assert.match(app, /roles=\{\['admin', 'super_admin', 'staff'\]\}/);
  assert.match(read('client/src/utils/authorization.js'), /admin.*store_owner|store_owner.*admin/s);
});
