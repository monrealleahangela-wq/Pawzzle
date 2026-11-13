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

test('super-admin date filters use the shared unclipped visible-label control', () => {
  for (const [relativePath, label] of dateFilters) {
    const source = read(relativePath);
    assert.match(source, /import SuperAdminDateRangeFilter/, `${relativePath} does not import the shared date filter`);
    assert.match(source, new RegExp(`ariaLabel="${label}"`), `${relativePath} is missing its accessible date label`);
  }
});

test('shared date filter renders an unclipped label above a transparent native select', () => {
  const source = read('client/src/components/superadmin/SuperAdminDateRangeFilter.js');

  assert.match(source, /label: 'All time'/, 'All Time is missing from the date choices');
  assert.match(source, /flex items-center whitespace-nowrap text-xs/, 'visible date text is not vertically centered and protected from wrapping');
  assert.match(source, /font-extrabold uppercase leading-none/, 'visible date text does not use readable styling');
  assert.match(source, /absolute inset-0 z-10 h-full w-full.*opacity-0/, 'native select is not retained as the interactive layer');
  assert.match(source, /aria-label=\{ariaLabel\}/, 'native select is missing its accessible label');
});
