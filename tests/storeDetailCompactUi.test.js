const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'client/src/pages/customer/StoreDetail.js'),
  'utf8'
);

test('store profile uses a compact responsive storefront header', () => {
  assert.match(source, /data-testid="store-profile-hero"/);
  assert.match(source, /h-36 overflow-hidden sm:h-44 lg:h-52/);
  assert.doesNotMatch(source, /sm:h-\[60vh\]/);
  assert.match(source, /Verified store/);
  assert.match(source, /Follow store/);
  assert.match(source, /Message store/);
});

test('store navigation uses customer-friendly section names', () => {
  for (const label of ['Products', 'Services', 'Pets', 'Store team']) {
    assert.match(source, new RegExp(`label: '${label}'`));
  }
  assert.doesNotMatch(source, /label: 'Gear'|label: 'Ops'|label: 'Fleet'/);
  assert.match(source, /No products available yet/);
  assert.match(source, /No services available yet/);
  assert.match(source, /No pets available yet/);
});

test('contact and business information use clear compact labels', () => {
  assert.match(source, />Store contact</);
  assert.match(source, /Save store contact/);
  assert.match(source, />Business hours</);
  assert.match(source, /View location/);
  assert.match(source, /: 'Closed'/);
  assert.doesNotMatch(source, /Base Intel|Extract vCard|>Timeline<|>OFFLINE</);
});

test('existing store interactions remain wired', () => {
  assert.match(source, /onClick=\{handleToggleFollow\}/);
  assert.match(source, /onClick=\{handleStartChat\}/);
  assert.match(source, /onClick=\{handleDownloadStoreCard\}/);
  assert.match(source, /<ReviewSection targetType="Store" targetId=\{storeId\} \/>/);
  assert.match(source, /<GoogleMap/);
});
