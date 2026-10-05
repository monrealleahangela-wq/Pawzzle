const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../client/src/pages/admin/ProductInventory.js'),
  'utf8'
);

test('Product Inventory uses the compact responsive management layout', () => {
  assert.match(source, /p-4 sm:p-6 lg:p-7 space-y-5 sm:space-y-6/);
  assert.match(source, /role="heading" aria-level="1"[^>]*text-\[1\.75rem\][^"\n]*sm:text-\[2rem\]/);
  assert.match(source, /Add Product[\s\S]*Update Stock/);
  assert.match(source, /h-11[^"\n]*px-5[^"\n]*text-\[13px\]/);
  assert.match(source, /role="tablist" aria-label="Product inventory views"/);
  assert.match(source, /role="tab"[\s\S]*aria-selected=\{activeTab === tab\.id\}/);
  assert.match(source, /min-h-10[^"\n]*px-4 py-2[^"\n]*text-\[13px\]/);
});

test('catalog controls stay compact, labelled, and connected to canonical categories', () => {
  assert.match(source, /import \{ PRODUCT_CATEGORIES, normalizeProductCategory \} from '\.\.\/\.\.\/constants\/productCategories'/);
  assert.match(source, /htmlFor="product-catalog-search"[^>]*>Search products</);
  assert.match(source, /id="product-catalog-search"[\s\S]*value=\{productSearchInput\}/);
  assert.match(source, /htmlFor="product-category-filter"[^>]*>Filter products by category</);
  assert.match(source, /id="product-category-filter"[\s\S]*value=\{productFilters\.category\}/);
  assert.match(source, /PRODUCT_CATEGORIES\.map\(category =>/);
  assert.match(source, /sm:grid-cols-\[minmax\(0,1fr\)_minmax\(14rem,20rem\)\]/);
  assert.match(source, /h-11 w-full[^"\n]*focus-visible:ring-2/);
});

test('catalog grid and cards provide five-to-one column density without fixed card widths', () => {
  assert.match(source, /grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5/);
  assert.match(source, /aspect-\[4\/3\][^"\n]*p-3/);
  assert.match(source, /alt=\{product\.name\}[^>]*object-contain/);
  assert.match(source, /line-clamp-2 break-words/);
  assert.match(source, /role="heading" aria-level="3"[^>]*text-base/);
  assert.match(source, /\{product\.stockQuantity \|\| 0\} UNITS/);
  assert.match(source, /aria-label=\{`Edit \$\{product\.name\}`\}/);
  assert.match(source, /aria-label=\{`Delete \$\{product\.name\}`\}/);
  assert.doesNotMatch(source, /responsive-card-grid \[--card-min:17rem\] sm:\[--card-min:18rem\]/);
});

test('Inventory Status keeps compact controls and contains mobile overflow', () => {
  assert.match(source, /min-w-0 space-y-5 sm:space-y-6/);
  assert.match(source, /htmlFor="inventory-search"[^>]*>Search inventory</);
  assert.match(source, /max-w-full overflow-x-auto no-scrollbar/);
  assert.match(source, /min-w-\[720px\] divide-y divide-slate-100/);
  assert.match(source, /px-5 py-3\.5[^"]*"[^>]*>Stock Quantity</);
  assert.match(source, /h-10[^"]*px-4[^"]*"[^>]*>\s*Adjust Stock/);
});
