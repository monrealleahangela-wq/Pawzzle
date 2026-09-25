const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const homePath = path.join(root, 'client', 'src', 'pages', 'customer', 'Home.js');
const cssPath = path.join(root, 'client', 'src', 'styles', 'CustomerHome.css');
const home = fs.readFileSync(homePath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

test('customer home preserves its live data and commerce integrations', () => {
  assert.match(home, /publicService\.getLandingData\(\)/);
  assert.match(home, /addToCart\(\{/);
  assert.match(home, /itemId: product\._id/);
  assert.match(home, /itemType: 'product'/);
  assert.match(home, /toast\.success/);
  assert.match(home, /formatPeso\(product\.price\)/);
  assert.match(home, /formatPeso\(pet\.price\)/);
});

test('customer home preserves customer routes and authenticated CTA behavior', () => {
  for (const route of ['/pets', '/products', '/services', '/register', '/login']) {
    assert.ok(home.includes(route), `expected ${route} to remain linked`);
  }
  assert.match(home, /`\/pets\/\$\{pet\._id\}`/);
  assert.match(home, /`\/products\/\$\{product\._id\}`/);
  assert.match(home, /!isAuthenticated/);
});

test('customer home keeps customer discovery content without the public professional showcase', () => {
  assert.match(home, /data\.pets\.length > 0/);
  assert.match(home, /data\.products\.length > 0/);
  assert.doesNotMatch(home, /data\.experts/);
  assert.doesNotMatch(home, /Public professional profiles/i);
  assert.doesNotMatch(home, /Meet Pawzzle professionals/i);
  assert.doesNotMatch(home, /customer-home-expert/);
  assert.doesNotMatch(css, /customer-home-expert/);
});

test('customer home uses project imagery without remote fallbacks', () => {
  assert.match(home, /\/images\/hero-premium\.png/);
  assert.match(home, /\/images\/landing_hero\.png/);
  assert.match(home, /\/images\/hero_pet_garden\.png/);
  assert.doesNotMatch(home, /images\.unsplash\.com/);
});

test('customer home styling is scoped, compact, responsive, and dark-mode aware', () => {
  assert.match(home, /styles\/CustomerHome\.css/);
  assert.match(css, /\.customer-home-hero\s*\{[\s\S]*?min-height:\s*330px/);
  assert.match(css, /\.customer-home-hero-image\s*\{[\s\S]*?height:\s*270px/);
  assert.match(css, /\.customer-home-stat\s*\{[\s\S]*?min-height:\s*5\.1rem/);
  assert.match(css, /\.customer-home-product-image\s*\{\s*height:\s*9\.5rem/);
  assert.match(css, /\.customer-home-service-card\s*\{[\s\S]*?height:\s*12\.5rem/);
  assert.match(css, /@media \(max-width:\s*900px\)/);
  assert.match(css, /@media \(max-width:\s*680px\)/);
  assert.match(css, /@media \(max-width:\s*420px\)/);
  assert.match(css, /\.dark \.customer-home/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /(^|\n)\s*(html|body|\.app-page)\s*\{/);
});

test('mobile layout reflows bento content instead of forcing horizontal overflow', () => {
  assert.match(home, /customer-home-listing-grid responsive-card-grid/);
  assert.match(home, /customer-home-product-grid responsive-card-grid/);
  assert.match(css, /@media \(max-width:\s*680px\)[\s\S]*?\.customer-home-hero\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(css, /@media \(max-width:\s*680px\)[\s\S]*?\.customer-home-category-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(css, /@media \(max-width:\s*680px\)[\s\S]*?\.customer-home-service-grid\s*\{\s*grid-template-columns:\s*1fr/);
  assert.match(css, /min-width:\s*0/);
  assert.doesNotMatch(css, /overflow-x:\s*hidden/);
});
