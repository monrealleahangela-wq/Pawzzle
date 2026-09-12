const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('shared summaries carry an authoritative transaction type', () => {
  const source = read('client/src/utils/paymentSummary.js');
  assert.match(source, /transactionType: TRANSACTION_TYPES\.PRODUCT_ORDER/);
  assert.match(source, /transactionType: TRANSACTION_TYPES\.SERVICE_BOOKING/);
  assert.match(source, /transactionType: TRANSACTION_TYPES\.PURCHASE_ORDER/);
  assert.match(source, /type === TRANSACTION_TYPES\.PRODUCT_ORDER/);
  assert.match(source, /type === TRANSACTION_TYPES\.SERVICE_BOOKING/);
});

test('product summaries exclude service rows and prioritize delivery details', () => {
  const source = read('client/src/utils/paymentSummary.js');
  const productBranch = source.slice(source.indexOf("if (type === TRANSACTION_TYPES.PRODUCT_ORDER)"), source.indexOf("} else if (type === TRANSACTION_TYPES.SERVICE_BOOKING)"));
  assert.match(productBranch, /Shipping distance/);
  assert.match(productBranch, /Base delivery fee/);
  assert.match(productBranch, /Distance charge/);
  assert.match(productBranch, /Additional items/);
  assert.match(productBranch, /Delivery total/);
  assert.doesNotMatch(productBranch, /Service fee|Booking fee|Home service fee/);
});

test('zero-value optional rows are hidden while free delivery remains meaningful', () => {
  const source = read('client/src/utils/paymentSummary.js');
  const component = read('client/src/components/payments/PaymentBreakdown.js');
  assert.match(source, /if \(nonZero\(summary\.additionalCharges\)\)/);
  assert.match(source, /textRow\('delivery-total', 'Delivery', 'Free'\)/);
  assert.match(component, /showZeroFees = false/);
});

test('non-VAT uses a semantic status and VAT orders retain the recorded component', () => {
  const source = read('client/src/utils/paymentSummary.js');
  assert.match(source, /'Tax status', 'Non-VAT'/);
  assert.match(source, /summary\.taxStatus === 'vat_registered'/);
  assert.doesNotMatch(read('client/src/components/payments/PaymentBreakdown.js'), /VAT \/ Tax \(Non-VAT\)/);
});

test('customer and admin order details share the same context-aware component', () => {
  const app = read('client/src/App.js');
  const detail = read('client/src/pages/customer/OrderDetail.js');
  assert.match(app, /path="orders\/:id"[\s\S]*<OrderDetail/);
  assert.match(app, /path="admin\/orders\/:id"[\s\S]*<OrderDetail/);
  assert.match(detail, /<PaymentBreakdown summary=\{authoritativePaymentSummary\}/);
});

test('downloaded product invoice reuses semantic rows instead of hardcoded booking charges', () => {
  const detail = read('client/src/pages/customer/OrderDetail.js');
  assert.match(detail, /paymentSummaryRows\(paymentSummary\)/);
  assert.doesNotMatch(detail, /Service Fee:|Booking Fee:|VAT \(\$\{/);
});

test('checkout, customer history, and platform transaction history use product-order summaries', () => {
  for (const file of [
    'client/src/pages/customer/Checkout.js',
    'client/src/pages/customer/Orders.js',
    'client/src/pages/customer/OrderDetail.js',
    'client/src/pages/superadmin/TransactionHistory.js'
  ]) {
    assert.match(read(file), /orderPaymentSummary/, `${file} should use product-order context`);
  }
});
