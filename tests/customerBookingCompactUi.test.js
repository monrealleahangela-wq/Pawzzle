const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'client/src/pages/customer/Bookings.js'), 'utf8');

test('booking search reserves space for its icon without shared input-style collisions', () => {
  assert.match(source, /id="booking-search"/);
  assert.match(source, /pointer-events-none absolute left-3\.5/);
  assert.match(source, /!pl-11 !pr-4/);
  assert.match(source, /placeholder="Search by service or pet name"/);
  assert.doesNotMatch(source, /className="input pl-10[^\n]*"[\s\S]*placeholder="Search pet or service/);
});

test('booking filters and cards use the compact responsive presentation', () => {
  assert.match(source, /id="booking-filters"/);
  assert.match(source, /rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5/);
  assert.match(source, /<option value="all">All bookings<\/option>/);
  assert.match(source, /group relative flex flex-col overflow-hidden rounded-2xl[^\n]*p-3\.5/);
  assert.match(source, /mb-3 flex-1 rounded-xl[^\n]*p-3/);
  assert.match(source, /flex h-10 flex-1 items-center justify-center[\s\S]{0,400}Rate Staff/);
  assert.match(source, /aria-label="Cancel booking"/);
});
