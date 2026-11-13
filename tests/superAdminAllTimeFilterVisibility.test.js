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

test('shared date filter uses the fixed-height accessible select control', () => {
  const source = read('client/src/components/superadmin/SuperAdminDateRangeFilter.js');

  assert.match(source, /label: 'All time'/, 'All Time is missing from the date choices');
  assert.match(source, /SuperAdminSelectFilter/, 'date filter does not use the shared select control');
});

test('shared select control renders complete labels above a transparent native select', () => {
  const source = read('client/src/components/superadmin/SuperAdminSelectFilter.js');

  assert.match(source, /h-12 min-w-0 overflow-hidden/, 'filter height is not fixed independently of native select rules');
  assert.match(source, /font-sans text-xs font-extrabold uppercase leading-normal/, 'visible filter text does not use readable typography');
  assert.match(source, /min-h-0 max-h-none/, 'native select can still inherit conflicting global height limits');
  assert.match(source, /absolute inset-0 z-10 h-full.*opacity-0/, 'native select is not retained as the interactive layer');
  assert.match(source, /aria-label=\{ariaLabel\}/, 'native select is missing its accessible label');
});

test('transaction status filter uses the same unclipped visible-label control', () => {
  const source = read('client/src/pages/superadmin/TransactionHistory.js');

  assert.match(source, /import SuperAdminSelectFilter/, 'transaction history does not import the shared select control');
  assert.match(source, /label: 'All statuses'/, 'All Statuses is missing from the status choices');
  assert.match(source, /ariaLabel="Filter transactions by status"/, 'status filter is missing its accessible label');
  assert.doesNotMatch(source, /w-full h-full bg-slate-800 border-none/, 'legacy clipped status select is still present');
});

test('booking status filter uses the same unclipped visible-label control', () => {
  const source = read('client/src/pages/superadmin/BookingHistory.js');

  assert.match(source, /import SuperAdminSelectFilter/, 'booking history does not import the shared select control');
  assert.match(source, /label: 'All statuses'/, 'All Statuses is missing from the booking status choices');
  assert.match(source, /ariaLabel="Filter bookings by status"/, 'booking status filter is missing its accessible label');
  assert.doesNotMatch(source, /w-full h-full bg-slate-800 border-none/, 'legacy clipped booking status select is still present');
});

test('report filters use the shared unclipped visible-label controls', () => {
  const source = read('client/src/pages/superadmin/ReportManagement.js');

  assert.match(source, /import SuperAdminSelectFilter/, 'report management does not import the shared select control');
  assert.match(source, /import SuperAdminDateRangeFilter/, 'report management does not import the shared date control');
  assert.match(source, /label: 'All statuses'/, 'All Statuses is missing from the report status choices');
  assert.match(source, /ariaLabel="Filter reports by status"/, 'report status filter is missing its accessible label');
  assert.match(source, /ariaLabel="Filter reports by date"/, 'report date filter is missing its accessible label');
  assert.doesNotMatch(source, /w-full h-full bg-slate-800 border-none/, 'legacy clipped report status select is still present');
});

test('feedback filters use the shared unclipped visible-label controls', () => {
  const source = read('client/src/pages/superadmin/FeedbackManagement.js');

  assert.match(source, /import SuperAdminSelectFilter/, 'feedback management does not import the shared select control');
  assert.match(source, /label: 'Any category'/, 'Any Category is missing from the feedback category choices');
  assert.match(source, /label: 'Any status'/, 'Any Status is missing from the feedback status choices');
  assert.match(source, /ariaLabel="Filter feedback by category"/, 'feedback category filter is missing its accessible label');
  assert.match(source, /ariaLabel="Filter feedback by status"/, 'feedback status filter is missing its accessible label');
  assert.doesNotMatch(source, /w-full h-full bg-slate-800 border-none/, 'legacy clipped feedback selects are still present');
});

test('support filters use the shared unclipped visible-label controls', () => {
  const source = read('client/src/pages/superadmin/SupportManagement.js');

  assert.match(source, /import SuperAdminSelectFilter/, 'support management does not import the shared select control');
  assert.match(source, /import SuperAdminDateRangeFilter/, 'support management does not import the shared date control');
  assert.match(source, /label: 'All statuses'/, 'All Statuses is missing from the support status choices');
  assert.match(source, /ariaLabel="Filter support tickets by status"/, 'support status filter is missing its accessible label');
  assert.match(source, /ariaLabel="Filter support tickets by date"/, 'support date filter is missing its accessible label');
  assert.doesNotMatch(source, /w-full h-full bg-slate-800 border-none/, 'legacy clipped support status select is still present');
});

test('supplier status filter uses the shared unclipped visible-label control', () => {
  const source = read('client/src/pages/superadmin/SupplierManagement.js');

  assert.match(source, /import SuperAdminSelectFilter/, 'supplier management does not import the shared select control');
  assert.match(source, /label: 'All statuses'/, 'All Statuses is missing from the supplier status choices');
  assert.match(source, /ariaLabel="Filter suppliers by status"/, 'supplier status filter is missing its accessible label');
  assert.doesNotMatch(source, /w-full h-full bg-slate-800 text-white text-\[10px\]/, 'legacy clipped supplier status select is still present');
});
