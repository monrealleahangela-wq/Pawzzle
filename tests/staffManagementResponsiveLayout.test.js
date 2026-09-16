const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('staff view controls retain readable content width and are separate from filters', () => {
  const page = read('client/src/pages/admin/StaffManagement.js');

  assert.match(page, /aria-label="Staff management views"[^>]*overflow-x-auto/);
  assert.match(page, /shrink-0 whitespace-nowrap rounded-md[^>]*>\{label\}/);
  assert.match(page, /Active Staff/);
  assert.match(page, /Assignment Matrix/);
  assert.match(page, /Archived Staff/);
  assert.doesNotMatch(page, /lg:flex-row lg:items-center[^\n]*Active Staff/);
});

test('staff filter toolbar reflows from one to two columns before using a desktop grid', () => {
  const page = read('client/src/pages/admin/StaffManagement.js');

  assert.match(page, /grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-\[/);
  for (const label of ['All roles', 'All availability', 'All verification', 'Recently Added']) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /aria-label="Refresh staff"/);
});

test('wide staff table scroll is contained and primary controls do not collapse', () => {
  const page = read('client/src/pages/admin/StaffManagement.js');

  assert.match(page, /scroll-region max-h-\[62vh\] overflow-auto/);
  assert.match(page, /min-w-\[1180px\]/);
  assert.match(page, /min-w-\[5\.5rem\] whitespace-nowrap[^>]*>\s*<option value="" disabled>Actions/);
  assert.match(page, /max-w-36 truncate/);
  assert.match(page, /max-w-44 truncate/);
});

test('professional verification is scoped to specialists and rider status stays distinct', () => {
  const page = read('client/src/pages/admin/StaffManagement.js');

  assert.match(page, /SPECIALISTS\.includes\(member\.staffType\)/);
  assert.match(page, /member\.riderProfile\?\.accountStatus/);
  assert.match(page, /label: `Rider \$\{status\.replaceAll/);
  assert.match(page, /label: 'Not required'/);
  assert.match(page, /verification\.professional && verification\.status === verificationFilter/);
});

test('staff actions, paging, and previously fixed marketplace responsive primitives remain wired', () => {
  const staff = read('client/src/pages/admin/StaffManagement.js');
  const css = read('client/src/styles/Global.css');
  const products = read('client/src/pages/customer/Products.js');
  const services = read('client/src/pages/customer/Services.js');

  for (const action of ['view', 'edit', 'reset', 'status', 'archive', 'restore', 'permanent']) {
    assert.match(staff, new RegExp(`value="${action}"`));
  }
  assert.match(staff, /setPage\(value=>value-1\)/);
  assert.match(staff, /setPage\(value=>value\+1\)/);
  assert.match(css, /\.responsive-card-grid/);
  assert.match(products, /responsive-card-grid/);
  assert.match(services, /content-scroll-row/);
});
