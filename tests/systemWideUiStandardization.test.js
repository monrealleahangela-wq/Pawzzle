const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('route inventory retains every Pawzzle interface family', () => {
  const app = read('client/src/App.js');
  for (const route of [
    '/login', '/seller-join', 'products', 'services', 'checkout', 'orders/:id',
    'staff/attendance', 'admin/dashboard', 'admin/staff', 'admin/hr',
    'admin/logistics/:id', 'supplier/dashboard', 'superadmin/dashboard',
    'superadmin/store-applications', 'superadmin/staff-verification'
  ]) assert.match(app, new RegExp(`path=["']${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`));
});

test('global text overflow preserves primary interactive labels', () => {
  const css = read('client/src/styles/Global.css');
  assert.match(css, /\.app-page :where\(p, td, dd, label, li\)[\s\S]*?overflow-wrap: anywhere/);
  assert.match(css, /\.app-page :where\(button, a, \[role="button"\]\)[\s\S]*?overflow-wrap: normal;[\s\S]*?word-break: normal/);
  assert.doesNotMatch(css, /:where\([^)]*button[^)]*\)\s*\{\s*overflow-wrap: anywhere/);
});

test('shared application primitives use content-aware responsive sizing', () => {
  const css = read('client/src/styles/Global.css');
  for (const primitive of ['ui-page-stack', 'ui-page-header', 'ui-toolbar', 'ui-control', 'ui-card-surface', 'ui-table-region', 'ui-empty-state']) {
    assert.match(css, new RegExp(`\\.${primitive}`));
  }
  assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 11rem\), 1fr\)\)/);
  assert.match(css, /\.ui-table-region[\s\S]*?overflow-x: auto/);
});

test('buttons, badges, forms, cards, charts, and modals share readable behavior', () => {
  const button = read('client/src/components/ui/Button.js');
  const badge = read('client/src/components/ui/Badge.js');
  const card = read('client/src/components/ui/Card.js');
  const form = read('client/src/components/ui/Form.js');
  const modal = read('client/src/components/ui/Modal.js');
  const chart = read('client/src/components/ui/Chart.js');

  assert.match(button, /break-normal/);
  assert.doesNotMatch(button, /break-words/);
  assert.match(button, /default: "min-h-10/);
  assert.match(badge, /break-normal/);
  assert.match(card, /min-w-0 rounded-xl/);
  assert.match(form, /React\.useId\(\)/);
  assert.match(form, /htmlFor=\{fieldId\}/);
  assert.match(form, /resize-y/);
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /aria-label="Close dialog"/);
  assert.match(chart, /maxWidth: size, aspectRatio: '1 \/ 1'/);
});

test('layout applies the same shell system to aliases, operational staff, and suppliers', () => {
  const layout = read('client/src/components/Layout.js');
  assert.match(layout, /isStaffUI = user\?\.role === 'staff' \|\| OPERATIONAL_ROLES\.has\(user\?\.role\)/);
  assert.match(layout, /isSupplierUI = user\?\.role === 'supplier'/);
  assert.match(layout, /supplier-ui-shell/);
  assert.match(layout, /supplier-interface/);
  for (const label of ['Platform Operations', 'Store Operations', 'Supplier Workspace', 'Staff Workspace', 'Customer Marketplace']) {
    assert.match(layout, new RegExp(label));
  }
});

test('marketplace primary names wrap and grids respond to actual content width', () => {
  const css = read('client/src/styles/Global.css');
  const products = read('client/src/pages/customer/Products.js');
  const services = read('client/src/pages/customer/Services.js');
  const pets = read('client/src/pages/customer/Pets.js');

  assert.match(css, /\.responsive-card-grid/);
  assert.match(products, /responsive-card-grid/);
  assert.match(products, /line-clamp-2 break-words/);
  assert.match(pets, /responsive-card-grid/);
  assert.match(pets, /line-clamp-2 break-words/);
  assert.match(services, /content-scroll-row/);
  assert.match(services, /shrink-0 whitespace-nowrap/);
});

test('wide staff data stays in a local scroll region and actions remain reachable', () => {
  const staff = read('client/src/pages/admin/StaffManagement.js');
  assert.match(staff, /ui-table-region scroll-region max-h-\[62vh\] overflow-auto/);
  assert.match(staff, /min-w-\[1180px\]/);
  assert.match(staff, /min-w-\[5\.5rem\] whitespace-nowrap/);
  assert.match(staff, /ui-page-header/);
});

test('management financial surfaces reuse the authoritative peso formatter', () => {
  for (const file of [
    'client/src/pages/admin/Dashboard.js',
    'client/src/pages/admin/FinanceManagement.js',
    'client/src/pages/admin/HRManagement.js',
    'client/src/pages/admin/Logistics.js',
    'client/src/components/admin/RiderDashboard.js',
    'client/src/pages/superadmin/Dashboard.js'
  ]) {
    const source = read(file);
    assert.match(source, /import \{ formatPeso \} from ['"]\.\.\/.*utils\/paymentSummary['"]/);
    assert.doesNotMatch(source, /const (money|peso) = value => `₱/);
  }
});

test('dark mode remains token-based across shared surfaces', () => {
  const css = read('client/src/styles/Global.css');
  assert.match(css, /\.dark \{[\s\S]*?--surface-card:/);
  assert.match(css, /\.dark \[class~="bg-white"\][\s\S]*?background-color: var\(--surface-card\)/);
  assert.match(css, /\.dark input,[\s\S]*?\.dark textarea,[\s\S]*?\.dark select/);
  assert.match(css, /\.dark :where\(\[role="dialog"\], \[role="menu"\], \[role="listbox"\]\)/);
});
