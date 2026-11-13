const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(
  path.join(__dirname, '..', 'client/src/pages/admin/StoreApplications.js'),
  'utf8'
);

test('store application status filter keeps its selected label vertically visible', () => {
  assert.match(page, /aria-label="Filter applications by status"/);
  assert.match(page, /h-12 !min-h-12 !max-h-12/);
  assert.match(page, /uppercase leading-normal/);
  assert.match(page, /pr-10 py-0/);
  assert.doesNotMatch(page, /<option[^>]*italic[^>]*>ALL STATUSES<\/option>/);
});
