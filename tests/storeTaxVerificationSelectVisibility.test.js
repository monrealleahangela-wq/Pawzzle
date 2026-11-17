const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('tax verification select uses an unclipped compact control style', () => {
  const page = source('client/src/pages/admin/StoreApplications.js');
  const styles = source('client/src/styles/Global.css');

  assert.match(page, /className="input tax-verification-select w-full"/);
  assert.match(page, />Verify as VAT Registered<\/option>/);
  assert.match(styles, /\.super-admin-interface select\.tax-verification-select\s*\{[^}]*height:\s*2\.5rem;/s);
  assert.match(styles, /\.super-admin-interface select\.tax-verification-select\s*\{[^}]*padding-top:\s*0;[^}]*padding-bottom:\s*0;/s);
  assert.match(styles, /\.super-admin-interface select\.tax-verification-select\s*\{[^}]*line-height:\s*1\.25rem;/s);
});
