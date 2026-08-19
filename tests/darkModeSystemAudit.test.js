const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const target = path.join(directory, entry.name);
  if (entry.isDirectory()) return walk(target);
  return /\.(js|jsx)$/.test(entry.name) ? [target] : [];
});

const reactSources = walk(path.join(root, 'client', 'src'));
const combinedReactSource = reactSources.map(file => fs.readFileSync(file, 'utf8')).join('\n');
const globalCss = read('client/src/styles/Global.css');

test('existing theme owns semantic text, surface, border, placeholder, and disabled tokens', () => {
  for (const token of [
    '--text-primary', '--text-secondary', '--text-muted', '--text-disabled',
    '--surface-page', '--surface-card', '--surface-subtle', '--surface-muted', '--border-subtle'
  ]) assert.ok(globalCss.includes(token), `missing theme token ${token}`);

  for (const utility of ['.text-prose', '.text-default', '.text-secondary', '.text-muted', '.text-disabled']) {
    assert.ok(globalCss.includes(utility), `missing semantic utility ${utility}`);
  }
  assert.match(globalCss, /\.dark input::placeholder/);
  assert.match(globalCss, /\.dark button:disabled/);
  assert.match(globalCss, /label, legend, th, td/);
  assert.match(globalCss, /\[role="dialog"\].*\[role="menu"\].*\[role="listbox"\]/);
});

test('every hardcoded dark neutral text utility found in React is covered by the dark compatibility layer', () => {
  const tokens = new Set(combinedReactSource.match(/text-(?:black|(?:slate|gray|zinc|neutral)-(?:950|900|800|700|600|500|400))/g) || []);
  assert.ok(tokens.size > 0, 'expected legacy neutral text utilities');
  for (const token of tokens) {
    assert.ok(globalCss.includes(`[class~="${token}"]`), `dark mode does not cover ${token}`);
  }
});

test('legacy neutral interaction states and pale panels remain dark-mode safe', () => {
  const interactionTokens = new Set(combinedReactSource.match(/(?:hover|focus|group-hover):text-(?:black|(?:slate|gray|neutral)-(?:900|800|700|600|500|400))/g) || []);
  for (const token of interactionTokens) {
    assert.ok(globalCss.includes(`[class~="${token}"]`), `dark interaction state is not covered: ${token}`);
  }

  for (const token of ['bg-white', 'bg-slate-50', 'bg-slate-100', 'bg-slate-200', 'bg-gray-50', 'bg-gray-100', 'bg-neutral-50', 'bg-neutral-100']) {
    if (combinedReactSource.includes(token)) assert.ok(globalCss.includes(`[class~="${token}"]`), `dark surface is not covered: ${token}`);
  }
  for (const token of ['bg-primary-50', 'bg-secondary-50', 'bg-emerald-50', 'bg-rose-50', 'bg-amber-50', 'bg-blue-50']) {
    assert.ok(globalCss.includes(`[class~="${token}"]`), `pale status surface is not covered: ${token}`);
  }
});

test('shared forms, cards, and modals use semantic theme-aware text classes', () => {
  const sharedSources = [
    read('client/src/components/ui/Form.js'),
    read('client/src/components/ui/Card.js'),
    read('client/src/components/ui/Modal.js'),
    read('client/src/components/forms/CompactEntityForm.js')
  ].join('\n');

  assert.match(sharedSources, /text-default/);
  assert.match(sharedSources, /text-secondary/);
  assert.match(sharedSources, /text-muted/);
  assert.doesNotMatch(sharedSources, /inline[^\n]*color:\s*['"](?:black|#000(?:000)?)['"]/i);
});

test('required UAT screens inherit the single application theme and contain no inline black text', () => {
  const app = read('client/src/App.js');
  assert.match(app, /styles\/Global\.css/);

  const requiredScreens = [
    'client/src/pages/auth/Login.js',
    'client/src/pages/auth/Register.js',
    'client/src/pages/admin/Dashboard.js',
    'client/src/pages/admin/Pets.js',
    'client/src/pages/admin/ProductInventory.js',
    'client/src/pages/admin/ServiceManagement.js',
    'client/src/pages/customer/PetDetail.js',
    'client/src/pages/customer/ProductDetail.js',
    'client/src/pages/customer/Services.js',
    'client/src/pages/admin/StaffManagement.js',
    'client/src/pages/admin/RoleManagement.js',
    'client/src/pages/admin/DSS.js',
    'client/src/pages/customer/Checkout.js',
    'client/src/pages/customer/Orders.js',
    'client/src/pages/customer/Bookings.js',
    'client/src/pages/shared/ChatManagement.js',
    'client/src/components/NotificationBell.js',
    'client/src/pages/admin/AdminSettings.js'
  ];

  for (const screen of requiredScreens) assert.ok(fs.existsSync(path.join(root, screen)), `missing audited screen: ${screen}`);
  assert.doesNotMatch(combinedReactSource, /color\s*:\s*['"](?:black|#000(?:000)?)['"]/i);
});
