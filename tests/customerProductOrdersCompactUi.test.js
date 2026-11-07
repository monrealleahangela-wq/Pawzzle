const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'client/src/pages/customer/Orders.js'), 'utf8');

test('product order history uses compact cards without hiding financial details', () => {
  assert.match(source, /marketplace-order-list space-y-4/);
  assert.match(source, /marketplace-order-card overflow-hidden rounded-2xl/);
  assert.match(source, /space-y-2\.5 p-3 sm:px-4/);
  assert.match(source, /PaymentBreakdown summary=\{orderPaymentSummary\(order\)\} compact className="!space-y-1 !text-\[9px\] leading-tight"/);
  assert.match(source, /refundPolicyLabel\(orderPolicy\.type\)/);
  assert.match(source, /Payment: \{order\.paymentStatus/);
  assert.match(source, /Delivery: \{meta\.label\}/);
});

test('product order actions stay clear and compact across mobile and desktop', () => {
  assert.match(source, /h-11 w-11 shrink-0 rounded-lg/);
  assert.match(source, /flex h-9 flex-1 items-center justify-center[\s\S]{0,300}Live Track/);
  assert.match(source, /Receipt & Details/);
  assert.match(source, /Review Product/);
  assert.match(source, /Rate Rider/);
});
