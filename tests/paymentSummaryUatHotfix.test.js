const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('checkout requests the authoritative quote without waiting for a profile phone number', () => {
  const source = read('client/src/pages/customer/Checkout.js');
  assert.doesNotMatch(source, /if\s*\(\s*!quoteItemsSignature\s*\|\|\s*!phoneNumber/);
  assert.match(source, /setIsPricingQuoteLoading\(true\)/);
  assert.match(source, /finally\s*\{[\s\S]*setIsPricingQuoteLoading\(false\)/);
  assert.match(source, /<PaymentBreakdown[\s\S]*loading=\{isPricingQuoteLoading\}[\s\S]*error=\{pricingQuoteError\}/);
  assert.doesNotMatch(source, /calculateFinalTotal/);
});

test('shared payment summary displays a complete ordered breakdown and a bounded loading state', () => {
  const source = read('client/src/components/payments/PaymentBreakdown.js');
  const orderedLabels = [
    'Subtotal',
    'Delivery fee',
    'Service fee',
    'Booking fee',
    'Additional charges',
    'Voucher discount',
    'Total'
  ];
  const rowsSource = source.slice(source.indexOf('const rows'));
  let cursor = -1;
  for (const label of orderedLabels) {
    const next = rowsSource.indexOf(label);
    assert.ok(next > cursor, `${label} should appear in the requested order`);
    cursor = next;
  }
  assert.match(rowsSource, /\['Subtotal',[\s\S]*\[taxLabel\(summary\),[\s\S]*\['Delivery fee'/);
  assert.match(source, /return 'VAT \/ Tax'/);
  assert.match(source, /if \(loading\)/);
  assert.match(source, /Loading amount/);
  assert.match(source, /We couldn't calculate your total\. Please try again\./);
});

test('peso formatting uses one Philippine currency formatter with two decimal places', () => {
  const source = read('client/src/utils/paymentSummary.js');
  assert.match(source, /Intl\.NumberFormat\('en-PH'/);
  assert.match(source, /currency:\s*'PHP'/);
  assert.match(source, /minimumFractionDigits:\s*2/);
  assert.match(source, /maximumFractionDigits:\s*2/);
});

test('all primary order, booking, receipt, platform, and supplier summaries reuse the shared presentation', () => {
  const consumers = [
    'client/src/pages/customer/Checkout.js',
    'client/src/pages/customer/Orders.js',
    'client/src/pages/customer/OrderDetail.js',
    'client/src/pages/customer/Bookings.js',
    'client/src/components/booking/ServiceCommunicationPanel.js',
    'client/src/pages/admin/BookingsManagement.js',
    'client/src/pages/admin/PurchaseOrders.js',
    'client/src/pages/supplier/SupplierDashboard.js',
    'client/src/pages/superadmin/BookingHistory.js',
    'client/src/pages/superadmin/TransactionHistory.js'
  ];
  for (const file of consumers) {
    assert.match(read(file), /PaymentBreakdown/, `${file} must use the shared payment breakdown`);
  }
});

test('PayMongo creation and reconciliation remain authoritative and untouched by display normalization', () => {
  const payment = read('controllers/paymentController.js');
  const reconciliation = read('services/paymentReconciliationService.js');
  assert.match(payment, /pricingBreakdown\?\.finalTotal\s*\?\?\s*order\.totalAmount/);
  assert.match(payment, /pricingBreakdown\?\.finalPrice\s*\?\?\s*booking\.totalPrice/);
  assert.match(reconciliation, /duplicatePaymentIds/);
  assert.match(reconciliation, /paymentDetails\.history\.paymentId/);
});
