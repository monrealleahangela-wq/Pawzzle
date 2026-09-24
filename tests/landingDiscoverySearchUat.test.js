const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const landing = read('client/src/pages/public/Landing.js');
const discovery = read('client/src/pages/customer/Search.js');
const styles = read('client/src/styles/DiscoveryHub.css');

test('finalized landing search keeps its existing design and passes an encoded query to Discovery Hub', () => {
  assert.match(landing, /<form onSubmit=\{handleSearch\} className="landing-search" role="search">/);
  assert.match(landing, /const query = searchQuery\.trim\(\)/);
  assert.match(landing, /navigate\(`\/search\?q=\$\{encodeURIComponent\(query\)\}`\)/);
  assert.match(landing, /import '\.\.\/\.\.\/styles\/Landing\.css'/);
  assert.doesNotMatch(landing, /DiscoveryHub\.css/);
});

test('Discovery Hub initializes from URL state and submits later searches back to the URL', () => {
  assert.match(discovery, /useSearchParams\(\)/);
  assert.match(discovery, /searchParams\.get\('q'\)/);
  assert.match(discovery, /setSearchQuery\(urlQuery\)/);
  assert.match(discovery, /params\.set\('q', term\.trim\(\)\)/);
  assert.match(discovery, /setSearchParams\(params\)/);
  assert.match(discovery, /<form onSubmit=\{handleSearch\}[^>]*role="search"/);
});

test('Discovery Hub searches all existing public catalog APIs with the submitted term', () => {
  assert.match(discovery, /const params = \{ search: term, limit: 50 \}/);
  assert.match(discovery, /petService\.getAllPets\(params\)/);
  assert.match(discovery, /productService\.getAllProducts\(params\)/);
  assert.match(discovery, /serviceService\.getAllServices\(params\)/);
  assert.match(discovery, /storeService\.getAllStores\(params\)/);
  assert.match(discovery, /petsResponse\.data\?\.pets \|\| \[\]/);
  assert.match(discovery, /productsResponse\.data\?\.products \|\| \[\]/);
  assert.match(discovery, /servicesResponse\.data\?\.services \|\| \[\]/);
});

test('Discovery Hub no longer discards authoritative API results with its former Cavite address filter', () => {
  assert.doesNotMatch(discovery, /STRICT CAVITE FILTERING/);
  assert.doesNotMatch(discovery, /const isCavite/);
  assert.doesNotMatch(discovery, /filter\([^\n]*isCavite/);
  assert.match(discovery, /Public catalog endpoints already enforce their authoritative visibility/);
});

test('search changes, clear, retry, empty, and stale-response behavior are explicit', () => {
  assert.match(discovery, /requestId !== requestIdRef\.current/);
  assert.match(discovery, /const handleClearSearch/);
  assert.match(discovery, /setResults\(EMPTY_RESULTS\)/);
  assert.match(discovery, /setSearchParams\(new URLSearchParams\(\)\)/);
  assert.match(discovery, /No matching results/);
  assert.match(discovery, /Search unavailable/);
  assert.match(discovery, /Try again/);
  assert.match(discovery, /What are you looking for\?/);
});

test('existing category, city, price, near-me, tabs, and detail routes remain connected', () => {
  assert.match(discovery, /CAVITE_CITIES\.map/);
  assert.match(discovery, /handleFilterChange\('category'/);
  assert.match(discovery, /handleFilterChange\('priceRange'/);
  assert.match(discovery, /handleFilterChange\('city'/);
  assert.match(discovery, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(discovery, /activeTab/);
  assert.match(discovery, /`\/pets\/\$\{item\._id\}`/);
  assert.match(discovery, /`\/products\/\$\{item\._id\}`/);
  assert.match(discovery, /navigate\(`\/services\/\$\{service\._id\}`\)/);
  assert.match(discovery, /`\/stores\/\$\{item\._id\}`/);
});

test('Discovery Hub density styles are scoped, compact, responsive, and dark-mode aware', () => {
  assert.match(discovery, /styles\/DiscoveryHub\.css/);
  assert.match(discovery, /responsive-card-grid \[--card-min:17rem\]/);
  assert.match(styles, /\.discovery-hub\s*\{/);
  assert.match(styles, /\.discovery-search\s*\{[\s\S]*?min-height:\s*3\.45rem/);
  assert.match(styles, /\.discovery-card-image\s*\{[\s\S]*?height:\s*9\.5rem/);
  assert.match(styles, /\.discovery-card-copy\s*\{[\s\S]*?padding:\s*0\.7rem/);
  assert.match(styles, /\.dark \.discovery-hub/);
  assert.match(styles, /@media \(max-width:\s*800px\)/);
  assert.match(styles, /@media \(max-width:\s*520px\)/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.doesNotMatch(styles, /(^|\n)\s*(html|body|\.landing-page)\s*\{/);
  assert.doesNotMatch(styles, /overflow-x:\s*hidden/);
});

test('existing backend controllers still implement real database search fields', () => {
  const pets = read('controllers/petController.js');
  const products = read('controllers/productController.js');
  const services = read('controllers/serviceController.js');
  const stores = read('controllers/storeController.js');
  for (const source of [pets, products, services, stores]) {
    assert.match(source, /\bsearch\b/);
    assert.match(source, /\$regex:\s*search/);
  }
});
