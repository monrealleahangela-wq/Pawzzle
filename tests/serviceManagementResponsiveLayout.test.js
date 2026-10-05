const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
const source = read('client/src/pages/admin/ServiceManagement.js');

test('Service Manager header keeps all operational actions in a compact responsive group', () => {
  assert.match(source, /p-4 sm:p-6 lg:p-7 space-y-5 sm:space-y-6/);
  assert.match(source, /role="heading" aria-level="1"[^>]*text-\[1\.75rem\][^"\n]*sm:text-\[2rem\]/);
  assert.match(source, /flex w-full flex-wrap items-center gap-2\.5 sm:w-auto lg:justify-end/);
  assert.match(source, /onClick=\{\(\) => setShowDSSConfig\(true\)\}[\s\S]*DSS Weights/);
  assert.match(source, /to="\/admin\/bookings"[\s\S]*View Bookings/);
  assert.match(source, /resetForm\(\); setShowModal\(true\);[\s\S]*Create Service/);
  assert.match(source, /h-11[^"\n]*text-\[13px\]/);
});

test('all four unchanged service metrics render in compact responsive tiles', () => {
  for (const label of ['Active Services', 'Total Services', 'With Pricing Rules', 'With Add-Ons']) {
    assert.ok(source.includes(label), `missing service metric: ${label}`);
  }
  assert.match(source, /services\.filter\(s => s\.isActive\)\.length/);
  assert.match(source, /services\.filter\(s => s\.pricingRules/);
  assert.match(source, /services\.filter\(s => s\.addOns/);
  assert.match(source, /grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4/);
  assert.match(source, /min-h-24[^"\n]*items-center[^"\n]*p-4/);
  assert.match(source, /h-9 w-9[^"\n]*rounded-xl/);
});

test('search and category controls remain labelled, compact, and state-connected', () => {
  assert.match(source, /htmlFor="service-manager-search"[^>]*>Search services</);
  assert.match(source, /id="service-manager-search"[\s\S]*value=\{searchTerm\}/);
  assert.match(source, /htmlFor="service-category-filter"[^>]*>Filter services by category</);
  assert.match(source, /id="service-category-filter"[\s\S]*value=\{filterCategory\}/);
  assert.match(source, /categories\.map\(c =>/);
  assert.match(source, /sm:grid-cols-\[minmax\(0,1fr\)_minmax\(14rem,20rem\)\]/);
  assert.match(source, /h-11 w-full[^"\n]*focus-visible:ring-2/);
});

test('service cards use denser responsive tracks and retain management details and actions', () => {
  assert.match(source, /grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4/);
  assert.match(source, /aspect-\[16\/10\][^"\n]*w-full/);
  assert.match(source, /alt=\{service\.name\}[^>]*object-cover/);
  assert.match(source, /role="heading" aria-level="3"[^>]*line-clamp-2 break-words/);
  assert.match(source, /DYNAMIC PRICING/);
  assert.match(source, /\+\{service\.addOns\.length\} ADD-ONS/);
  assert.match(source, /Base Price[\s\S]*Duration[\s\S]*Staff/);
  assert.match(source, /onClick=\{\(\) => handleEdit\(service\)\}/);
  assert.match(source, /aria-label=\{`Delete \$\{service\.name\}`\}/);
  assert.doesNotMatch(source, /responsive-card-grid \[--card-min:18rem\]/);
});

test('service APIs, permission gates, and the customer marketplace remain separate', () => {
  const customerServices = read('client/src/pages/customer/Services.js');

  assert.match(source, /adminServiceService\.getAllServices\(\)/);
  assert.match(source, /adminServiceService\.createService/);
  assert.match(source, /adminServiceService\.updateService/);
  assert.match(source, /hasUiActionPermission\(user, 'services', 'create'/);
  assert.match(source, /hasUiActionPermission\(user, 'services', 'update'/);
  assert.match(source, /hasUiActionPermission\(user, 'services', 'delete'/);
  assert.match(customerServices, /customer-marketplace-page marketplace-services/);
  assert.match(customerServices, /responsive-card-grid[^\n]*\[--card-min:16rem\]/);
});
