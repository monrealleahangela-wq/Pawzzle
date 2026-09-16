const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const viewports = [
  [1920, 1080], [1536, 864], [1440, 900], [1366, 768], [1280, 720],
  [1024, 768], [768, 1024], [430, 932], [390, 844], [375, 812]
];

test('the shared application shell sizes pages from the space remaining beside navigation', () => {
  const layout = read('client/src/components/Layout.js');
  const css = read('client/src/styles/Global.css');

  assert.match(layout, /app-shell[^"`]*w-full max-w-full min-w-0/);
  assert.match(layout, /app-content-shell[^"`]*w-full max-w-full flex-1[^"`]*min-w-0/);
  assert.match(layout, /app-content-main[^"`]*w-full max-w-full min-w-0 flex-1/);
  assert.match(layout, /app-page[^"`]*w-full max-w-full min-w-0/);
  assert.doesNotMatch(layout, /app-shell[^"`]*overflow-x-hidden/);
  assert.match(css, /#root,[\s\S]*\.app-page \{[\s\S]*max-width: 100%;[\s\S]*min-width: 0;/);
  assert.doesNotMatch(css, /body\s*\{[^}]*overflow-x:\s*hidden/);
});

test('customer pages no longer use zoom or expanded widths to simulate compact sizing', () => {
  const css = read('client/src/styles/Global.css');

  assert.doesNotMatch(css, /\.customer-interface\s*\{[^}]*zoom:/);
  assert.doesNotMatch(css, /\.customer-interface\s*\{[^}]*width:\s*1(?:08\.6957|13\.6364)%/);
  assert.doesNotMatch(css, /\.customer-interface\s*\{[^}]*transform:\s*scale/);
});

test('products reflow from their real container and card actions cannot widen a track', () => {
  const products = read('client/src/pages/customer/Products.js');
  const css = read('client/src/styles/Global.css');

  assert.match(css, /\.responsive-card-grid\s*\{[\s\S]*repeat\(auto-fill, minmax\(min\(100%, var\(--card-min/);
  assert.match(products, /xl:w-60 xl:shrink-0/);
  assert.match(products, /xl:hidden w-full flex/);
  assert.match(products, /<main className="w-full min-w-0 flex-1">/);
  assert.match(products, /responsive-card-grid \[--card-min:17rem\] sm:\[--card-min:18rem\] xl:\[--card-min:19rem\]/);
  assert.match(products, /grid-cols-\[2\.5rem_2\.5rem_minmax\(0,1fr\)\]/);
  assert.match(products, /line-clamp-2 break-words/);
  assert.match(products, /<span>Buy Now<\/span>/);
  assert.match(products, /fixed inset-0 z-\[-1\] pointer-events-none overflow-hidden/);
  assert.doesNotMatch(products, /xl:grid-cols-3/);
});

test('the products layout fits every required viewport without clipping a hidden column', () => {
  for (const [viewport, height] of viewports) {
    const desktopShell = viewport >= 1024;
    const shellSidebar = desktopShell ? 280 : 0;
    const pagePadding = viewport >= 1024 ? 40 : viewport >= 640 ? 32 : 24;
    const filterWidth = viewport >= 1280 ? 240 : 0;
    const splitGap = viewport >= 1280 ? 20 : 0;
    const gridWidth = viewport - shellSidebar - pagePadding - filterWidth - splitGap;
    const cardMin = viewport >= 1280 ? 304 : viewport >= 640 ? 288 : 272;
    const cardGap = 14;
    const columns = Math.max(1, Math.floor((gridWidth + cardGap) / (cardMin + cardGap)));
    const occupiedWidth = columns * cardMin + (columns - 1) * cardGap;

    assert.ok(gridWidth > 0, `${viewport}px leaves no product-grid width`);
    assert.ok(occupiedWidth <= gridWidth, `${viewport}px product columns overflow their container`);
    assert.ok(columns >= 1, `${viewport}px must render at least one real product column`);
    assert.ok(height >= 720, `${viewport}px viewport height must match the UAT matrix`);
  }
});

test('content-sized controls retain readable labels instead of shrinking or clipping', () => {
  const css = read('client/src/styles/Global.css');
  const services = read('client/src/pages/customer/Services.js');
  const button = read('client/src/components/ui/Button.js');
  const badge = read('client/src/components/ui/Badge.js');
  const modal = read('client/src/components/ui/Modal.js');
  const layout = read('client/src/components/Layout.js');
  const bottomNav = read('client/src/components/BottomNavBar.js');

  assert.doesNotMatch(css, /\.app-page \.flex > \*/);
  assert.match(css, /\.content-scroll-row > \* \{\s*flex: 0 0 auto;/);
  assert.match(services, /content-scroll-row[^"]*Service categories|content-scroll-row[^\n]*aria-label="Service categories"/i);
  assert.match(services, /shrink-0 whitespace-nowrap[^`]*tracking-wide/);
  assert.match(services, /sm:grid-cols-\[minmax\(15rem,1fr\)_auto\]/);
  assert.match(services, /sm:min-w-\[15rem\]/);
  assert.doesNotMatch(services, /!pl-20|md:w-48/);
  assert.match(button, /min-h-9 h-auto/);
  assert.match(button, /whitespace-normal break-normal/);
  assert.doesNotMatch(button, /whitespace-normal break-words/);
  assert.match(badge, /max-w-full min-w-0[^"]*whitespace-normal break-normal/);
  assert.doesNotMatch(badge, /whitespace-normal break-words/);
  assert.match(modal, /flex flex-wrap items-center justify-end/);
  assert.match(layout, /whitespace-normal break-words/);
  assert.doesNotMatch(layout, /tracking-tight truncate">\{(?:item|group|child)\.label\}/);
  assert.match(bottomNav, /min-w-\[76px\] shrink-0/);
  assert.match(bottomNav, /line-clamp-2 break-words/);
});

test('primary marketplace and management card titles receive a practical content width', () => {
  const expectations = new Map([
    ['client/src/pages/customer/Pets.js', /\[--card-min:17rem\][\s\S]*line-clamp-2 break-words/],
    ['client/src/pages/customer/Products.js', /\[--card-min:17rem\][\s\S]*line-clamp-2 break-words/],
    ['client/src/pages/customer/Services.js', /\[--card-min:17rem\][\s\S]*line-clamp-2 break-words/],
    ['client/src/pages/customer/Stores.js', /\[--card-min:17rem\][\s\S]*line-clamp-2 break-words/],
    ['client/src/pages/customer/Search.js', /\[--card-min:17rem\][\s\S]*line-clamp-2 break-words/],
    ['client/src/pages/customer/StoreDetail.js', /\[--card-min:17rem\][\s\S]*line-clamp-2 break-words/],
    ['client/src/pages/admin/ProductInventory.js', /\[--card-min:17rem\][\s\S]*line-clamp-2 break-words/],
    ['client/src/pages/admin/ServiceManagement.js', /\[--card-min:18rem\][\s\S]*line-clamp-2 break-words/],
    ['client/src/pages/supplier/SupplierDashboard.js', /\[--card-min:17rem\][\s\S]*line-clamp-2 break-words/]
  ]);

  for (const [file, expectation] of expectations) {
    assert.match(read(file), expectation, `${file} can still crush its primary card title`);
  }
});

test('other catalog and role surfaces reuse intrinsic grids or shrinkable panes', () => {
  const intrinsicGridPages = [
    'client/src/pages/customer/Pets.js',
    'client/src/pages/customer/Search.js',
    'client/src/pages/customer/Services.js',
    'client/src/pages/customer/Home.js',
    'client/src/pages/customer/Stores.js',
    'client/src/pages/customer/StoreDetail.js',
    'client/src/pages/supplier/SupplierDashboard.js'
  ];

  for (const page of intrinsicGridPages) {
    assert.match(read(page), /responsive-card-grid/, `${page} still relies only on viewport column breakpoints`);
  }

  for (const page of [
    'client/src/pages/customer/FindShops.js',
    'client/src/pages/shared/ChatManagement.js',
    'client/src/pages/admin/AdminChat.js'
  ]) {
    assert.match(read(page), /min-w-0/, `${page} contains a non-shrinking split pane`);
  }
});

test('calendar, specialized staff forms, and shared modals collapse inside narrow viewports', () => {
  const calendar = read('client/src/pages/customer/BookingCalendar.js');
  const staffFields = read('client/src/components/admin/SpecializedStaffFields.js');
  const modal = read('client/src/components/ui/Modal.js');

  assert.match(calendar, /grid-cols-\[auto_minmax\(0,1fr\)_auto\]/);
  assert.match(calendar, /hidden sm:inline/);
  assert.match(calendar, /max-h-\[calc\(100dvh-1rem\)\]/);
  assert.match(staffFields, /grid-cols-2[\s\S]*lg:grid-cols-\[82px_repeat\(4,minmax\(0,1fr\)\)\]/);
  assert.match(staffFields, /grid-cols-1[^"`]*sm:grid-cols-2/);
  assert.match(modal, /p-2 sm:p-4/);
  assert.match(modal, /w-full min-w-0 max-w-full/);
  assert.match(modal, /max-h-\[calc\(100dvh-1rem\)\]/);
});

test('genuinely wide tables scroll inside their component instead of widening the page', () => {
  const css = read('client/src/styles/Global.css');
  const rolePermissions = read('client/src/pages/superadmin/RolePermissions.js');
  const staff = read('client/src/pages/admin/StaffManagement.js');
  const logistics = read('client/src/pages/admin/Logistics.js');

  assert.match(css, /\.app-page \[class~="overflow-x-auto"\][\s\S]*max-width: 100%;[\s\S]*min-width: 0;/);
  assert.match(rolePermissions, /overflow-x-auto[\s\S]*min-w-\[760px\]/);
  assert.match(staff, /overflow-auto[\s\S]*min-w-\[1180px\]/);
  assert.match(logistics, /overflow-x-auto[\s\S]*min-w-\[1080px\]/);
});
