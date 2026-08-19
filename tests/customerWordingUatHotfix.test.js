const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('checkout uses plain payment and voucher wording', () => {
  const source = read('client/src/pages/customer/Checkout.js');

  for (const wording of [
    'Choose payment method',
    'Pay with PayMongo',
    'Available vouchers',
    'Use voucher',
    'Remove voucher',
    'No voucher selected',
    'Pay now'
  ]) {
    assert.match(source, new RegExp(wording, 'i'), `Checkout should show "${wording}"`);
  }

  assert.doesNotMatch(source, /Deploy Voucher|Voucher Deployment|Proceed to Payment|Confirm Transaction|Retry Request|Manifest Empty|Return to Manifest|Executing\.\.\.|\bEject\b/i);
  assert.match(source, /orderService\.createOrder\(orderData\)/);
  assert.match(source, /paymentService\.createCheckoutSession\(orderId\)/);
});

test('booking and order payment actions use consistent customer wording', () => {
  const bookings = read('client/src/pages/customer/Bookings.js');
  const order = read('client/src/pages/customer/OrderDetail.js');

  assert.match(bookings, /Waiting for your confirmation/i);
  assert.match(bookings, /Confirm and pay/i);
  assert.match(bookings, /Try PayMongo again/i);
  assert.doesNotMatch(bookings, /Awaiting Confirmation|Confirm & Proceed to Payment|Revalidating|Retry PayMongo Payment|\bEJECT\b/);

  assert.match(order, /Pay now/i);
  assert.match(order, /Check payment status/i);
  assert.doesNotMatch(order, /Proceed to Payment|Refresh Payment Status/);
});

test('shared customer payment summary resolves to friendly loading, error, and total labels', () => {
  const source = read('client/src/components/payments/PaymentBreakdown.js');
  assert.match(source, /Loading amount/);
  assert.match(source, /We couldn't calculate your total\. Please try again\./);
  assert.match(source, />Total</);
  assert.doesNotMatch(source, /Calculating|Computed Total|Final Total/);
});

test('customer surfaces no longer expose the known internal-style wording', () => {
  const files = [
    'client/src/pages/customer/Cart.js',
    'client/src/pages/customer/Checkout.js',
    'client/src/pages/customer/Orders.js',
    'client/src/pages/customer/OrderDetail.js',
    'client/src/pages/customer/Bookings.js',
    'client/src/pages/customer/Search.js',
    'client/src/pages/customer/Home.js',
    'client/src/pages/customer/FindShops.js',
    'client/src/components/EnhancedChatMessenger.js',
    'client/src/components/InquiryModal.js',
    'client/src/components/ReviewModal.js',
    'client/src/components/MapPicker.js'
  ];
  const visibleCopy = files.map(read).join('\n');

  assert.doesNotMatch(visibleCopy, /No Assets Selected|Manifest Empty|Net Payload|Selected Assets|Merchant Packing|Media Manifest|premium inquiry protocol|Search assets|No assets found|Successful Protocols|Pet Protocol|Total Valuation|Financial Status|Settlement Settings|Preferred Settlement Method/i);
});
