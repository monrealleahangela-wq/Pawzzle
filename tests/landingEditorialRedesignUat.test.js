const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
const landing = () => read('client/src/pages/public/Landing.js');
const styles = () => read('client/src/styles/Landing.css');

test('landing redesign preserves the existing live data and search integrations', () => {
  const source = landing();
  assert.match(source, /publicService\.getLandingData\(\)/);
  assert.match(source, /navigate\(`\/search\?q=\$\{encodeURIComponent\(query\)\}`\)/);
  assert.match(source, /data\.pets\.slice\(0, 4\)/);
  assert.match(source, /data\.products\.slice\(0, 4\)/);
  assert.match(source, /data\.services\.slice\(0, 4\)/);
});

test('landing navigation and calls to action retain their established routes', () => {
  const source = landing();
  for (const route of ['/login', '/register', '/seller-join', '/pets', '/products', '/services']) {
    assert.match(source, new RegExp(`to=["'{\\\`]${route.replace('/', '\\/')}`));
  }
  for (const anchor of ['#explore', '#features', '#how-it-works']) {
    assert.match(source, new RegExp(`href="${anchor}"`));
  }
  assert.match(source, /id="landing-mobile-menu"/);
  assert.match(source, /event\.key === 'Escape'/);
});

test('editorial presentation uses existing pet photography and varied bento compositions', () => {
  const source = landing();
  const css = styles();
  for (const asset of ['landing_hero.png', 'hero-premium.png', 'hero_pet_garden.png']) {
    assert.match(source, new RegExp(asset.replace('.', '\\.')));
  }
  assert.match(css, /\.landing-feature-bento[\s\S]*grid-template-columns: repeat\(12/);
  assert.match(css, /\.landing-catalog-bento[\s\S]*grid-template-columns/);
  assert.match(css, /Georgia, 'Times New Roman', serif/);
  assert.match(css, /--landing-cream: #f6efe4/);
  assert.match(css, /--landing-brown-dark: #2f1b11/);
});

test('responsive rules recompose rather than horizontally squeezing the desktop grid', () => {
  const css = styles();
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.landing-hero-grid \{ grid-template-columns: 1fr/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.landing-feature-bento \{ display: flex; flex-direction: column/);
  assert.match(css, /\.landing-catalog-bento \{ display: grid; grid-template-columns: 1fr/);
  assert.match(css, /overflow-x: clip/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('catalog retains real images, safe fallbacks, empty state, and direct detail routes', () => {
  const source = landing();
  assert.match(source, /getImageUrl\(item\.image\)/);
  assert.match(source, /No active \{activeCatalog\} are listed right now/);
  assert.match(source, /`\/pets\/\$\{pet\._id\}`/);
  assert.match(source, /`\/products\/\$\{product\._id\}`/);
  assert.doesNotMatch(source, /placeholder\.com|unsplash\.com|lorem ipsum/i);
});
