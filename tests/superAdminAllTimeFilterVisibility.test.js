const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const dateFilters = [
  ['client/src/pages/superadmin/AccountManagement.js', 'Filter accounts by date'],
  ['client/src/pages/superadmin/TransactionHistory.js', 'Filter transactions by date'],
  ['client/src/pages/superadmin/SupportManagement.js', 'Filter support tickets by date'],
  ['client/src/pages/superadmin/ReportManagement.js', 'Filter reports by date'],
  ['client/src/pages/superadmin/ActivityHistory.js', 'Filter activity by date']
];

test('super-admin All Time filters keep an explicit readable control height', () => {
  for (const [relativePath, label] of dateFilters) {
    const source = read(relativePath);
    const selectStart = source.lastIndexOf('<select', source.indexOf(`aria-label="${label}"`));
    const selectEnd = source.indexOf('</select>', selectStart);
    const select = source.slice(selectStart, selectEnd);

    assert.ok(select.includes(`aria-label="${label}"`), `${relativePath} is missing its accessible date label`);
    assert.match(select, /h-12 !min-h-12 !max-h-12/, `${relativePath} can be compressed by global select styles`);
    assert.match(select, /uppercase leading-normal/, `${relativePath} does not provide readable label line height`);
    assert.match(select, /pr-10 py-0/, `${relativePath} still applies vertical padding that clips native select text`);
    assert.match(select, />ALL TIME<\/option>/, `${relativePath} no longer provides the All Time choice`);
    assert.doesNotMatch(select, /\bh-full\b|\bpy-3\.5\b/, `${relativePath} contains the legacy clipped select sizing`);
  }
});
