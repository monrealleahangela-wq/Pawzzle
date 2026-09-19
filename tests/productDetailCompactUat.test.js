const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'client/src/pages/customer/ProductDetail.js'), 'utf8');

test('product detail uses a compact content-aware desktop split', () => {
  assert.match(source, /max-w-7xl/);
  assert.match(source, /lg:grid-cols-\[minmax\(0,0\.9fr\)_minmax\(0,1\.1fr\)\]/);
  assert.match(source, /aspect-\[4\/3\][^"\n]*lg:max-h-\[34rem\]/);
  assert.match(source, /object-contain/);
  assert.doesNotMatch(source, /sm:aspect-square/);
  assert.doesNotMatch(source, /sm:space-y-8/);
});

test('primary purchase controls precede secondary specifications and seller content', () => {
  const description = source.indexOf('Description</h3>');
  const buyingOptions = source.indexOf('{/* Buying Options */}');
  const specifications = source.indexOf('{/* Specifications */}');
  const seller = source.indexOf('{/* Seller Information */}');

  assert.ok(description >= 0, 'description section is missing');
  assert.ok(description < buyingOptions, 'description should introduce the buying controls');
  assert.ok(buyingOptions < specifications, 'purchase controls must come before secondary specifications');
  assert.ok(specifications < seller, 'seller information remains available after product specifications');
  assert.match(source, /hidden[^"\n]*lg:block/);
  assert.match(source, /grid grid-cols-2 gap-3/);
  assert.match(source, /lg:hidden fixed bottom-0/);
});

test('metadata and description remain readable without creating dead vertical space', () => {
  assert.match(source, /grid grid-cols-2 gap-2/);
  assert.match(source, /bg-slate-50 px-3 py-2\.5/);
  assert.doesNotMatch(source, /bg-slate-50 p-3 sm:p-5/);
  assert.match(source, /hasLongDescription && !showFullDescription \? 'line-clamp-3'/);
  assert.match(source, /Read full description/);
  assert.match(source, /aria-expanded=\{showFullDescription\}/);
});

test('commerce behavior and accessible quantity actions are preserved', () => {
  assert.match(source, /const handleAddToCart = \(\) =>/);
  assert.match(source, /const handleBuyNow = \(\) =>/);
  assert.match(source, /addToCart\(\{/);
  assert.match(source, /buyNow\(item\)/);
  assert.match(source, /navigate\('\/checkout'\)/);
  assert.match(source, /aria-label="Decrease quantity"/);
  assert.match(source, /aria-label="Increase quantity"/);
  assert.match(source, /disabled=\{product\.stockQuantity === 0\}/);
});

test('required desktop viewport widths retain two readable columns without fixed page width', () => {
  const desktopWidths = [1920, 1440, 1366];
  for (const viewport of desktopWidths) {
    const navigation = 280;
    const shellPadding = 40;
    const available = Math.min(1280, viewport - navigation - shellPadding);
    const gap = 32;
    const imageColumn = (available - gap) * (0.9 / 2);
    const informationColumn = (available - gap) * (1.1 / 2);

    assert.ok(imageColumn >= 450, `${viewport}px image column is unexpectedly narrow`);
    assert.ok(informationColumn >= 550, `${viewport}px information column is unexpectedly narrow`);
    assert.ok(imageColumn + informationColumn + gap <= available, `${viewport}px grid exceeds available width`);
  }
});
