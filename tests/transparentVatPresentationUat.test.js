const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { calculateTransactionTax } = require('../utils/taxCalculator');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('VAT-inclusive 1120 decomposes to 1000 plus 120 without changing payable total', () => {
  const result = calculateTransactionTax({
    subtotal: 1120,
    taxConfiguration: {
      isConfigured: true,
      taxStatus: 'vat_registered',
      pricingMode: 'inclusive',
      vatRatePercent: 12,
      deliveryFeeTaxable: false
    }
  });

  assert.equal(result.subtotal, 1120);
  assert.equal(result.vatExclusiveAmount, 1000);
  assert.equal(result.vatAmount, 120);
  assert.equal(result.finalTotal, 1120);
});

test('shared presentation exposes explicit inclusive labels and backend snapshot fields', () => {
  const summary = read('client/src/utils/paymentSummary.js');
  const breakdown = read('client/src/components/payments/PaymentBreakdown.js');

  assert.match(summary, /Product subtotal\$\{subtotalSuffix\}/);
  assert.match(summary, /Price before VAT/);
  assert.match(summary, /VAT \(\$\{rate\}\$\{mode\}\)/);
  assert.match(summary, /pricing\.vatExclusiveAmount/);
  assert.match(summary, /pricing\.discountedSubtotal/);
  assert.match(summary, /pricing\.deliveryFeeTaxable/);
  assert.match(breakdown, /Total to Pay/);
});

test('authoritative quote returns server-priced line items and checkout renders unit, quantity, and line total', () => {
  const controller = read('controllers/orderController.js');
  const checkout = read('client/src/pages/customer/Checkout.js');

  assert.match(controller, /items: pricing\.processedItems/);
  assert.match(checkout, /pricingQuote\?\.items\?\.length \? pricingQuote\.items : checkoutItems/);
  assert.match(checkout, /formatPeso\(item\.unitPrice\)\} × \{item\.quantity\}/);
  assert.match(checkout, /Line total/);
  assert.match(checkout, /formatPeso\(item\.lineTotal\)/);
  assert.match(checkout, /VAT is not added again at payment/);
});

test('customer and admin details share snapshot rows and the invoice includes itemized values', () => {
  const app = read('client/src/App.js');
  const detail = read('client/src/pages/customer/OrderDetail.js');

  assert.match(app, /path="orders\/:id"[\s\S]*<OrderDetail/);
  assert.match(app, /path="admin\/orders\/:id"[\s\S]*<OrderDetail/);
  assert.match(detail, /orderLineItemRows\(order\.items\)/);
  assert.match(detail, /\$\{item\.quantity\} × \$\{formatPeso\(item\.unitPrice\)\}/);
  assert.match(detail, /Line total: \$\{formatPeso\(item\.lineTotal\)\}/);
  assert.match(detail, /paymentSummaryRows\(paymentSummary\)/);
  assert.match(detail, /Total to Pay: \$\{formatPeso\(paymentSummary\.finalTotal\)\}/);
});

test('historical records disclose unavailable tax detail rather than consulting current Store tax state', () => {
  const summary = read('client/src/utils/paymentSummary.js');

  assert.match(summary, /hasAuthoritativePricing = Boolean\(pricing\.calculationVersion\)/);
  assert.match(summary, /historicalTaxBreakdownUnavailable: !hasAuthoritativePricing/);
  assert.match(summary, /Detailed tax breakdown unavailable for this historical/);
  assert.doesNotMatch(summary, /order\.store\?\.taxConfiguration|booking\.store\?\.taxConfiguration/);
});

test('service bookings use service-specific rows while product orders keep service fees out', () => {
  const summary = read('client/src/utils/paymentSummary.js');
  const productBranch = summary.slice(
    summary.indexOf("if (type === TRANSACTION_TYPES.PRODUCT_ORDER)"),
    summary.indexOf("} else if (type !== TRANSACTION_TYPES.SERVICE_BOOKING)")
  );

  assert.match(summary, /Service price\$\{subtotalSuffix\}/);
  assert.match(summary, /Home service fee/);
  assert.match(summary, /Additional service charges/);
  assert.doesNotMatch(productBranch, /Service fee|Booking fee|Home service fee/);
});

test('PayMongo still charges the stored authoritative final amount', () => {
  const payment = read('controllers/paymentController.js');
  const reconciliation = read('services/paymentReconciliationService.js');

  assert.match(payment, /recordedPricing\?\.finalTotal \?\? order\.totalAmount/);
  assert.match(payment, /amountCentavos\(order, 'order'\)/);
  assert.match(reconciliation, /Number\(record\.totalAmount\) \* 100/);
});
