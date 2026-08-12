const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateTransactionTax } = require('../utils/taxCalculator');

test('calculates 12% VAT-inclusive totals without adding VAT twice', () => {
  const result = calculateTransactionTax({
    subtotal: 1120,
    taxConfiguration: { taxStatus: 'vat_registered', pricingMode: 'inclusive', vatRatePercent: 12 }
  });
  assert.equal(result.vatExclusiveAmount, 1000);
  assert.equal(result.vatAmount, 120);
  assert.equal(result.finalTotal, 1120);
});

test('calculates 12% VAT-exclusive totals and PayMongo-ready final amount', () => {
  const result = calculateTransactionTax({
    subtotal: 1000,
    taxConfiguration: { taxStatus: 'vat_registered', pricingMode: 'exclusive', vatRatePercent: 12 }
  });
  assert.equal(result.vatAmount, 120);
  assert.equal(result.finalTotal, 1120);
});

test('applies discounts before VAT', () => {
  const result = calculateTransactionTax({
    subtotal: 1000,
    discountAmount: 100,
    taxConfiguration: { taxStatus: 'vat_registered', pricingMode: 'exclusive', vatRatePercent: 12 }
  });
  assert.equal(result.discountedSubtotal, 900);
  assert.equal(result.vatAmount, 108);
  assert.equal(result.finalTotal, 1008);
});

test('separates taxable and non-taxable delivery fees', () => {
  const taxable = calculateTransactionTax({
    subtotal: 1000,
    deliveryFee: 100,
    taxConfiguration: { taxStatus: 'vat_registered', pricingMode: 'exclusive', vatRatePercent: 12, deliveryFeeTaxable: true }
  });
  const nonTaxable = calculateTransactionTax({
    subtotal: 1000,
    deliveryFee: 100,
    taxConfiguration: { taxStatus: 'vat_registered', pricingMode: 'exclusive', vatRatePercent: 12, deliveryFeeTaxable: false }
  });
  assert.equal(taxable.vatAmount, 132);
  assert.equal(taxable.finalTotal, 1232);
  assert.equal(nonTaxable.vatAmount, 120);
  assert.equal(nonTaxable.finalTotal, 1220);
});

test('does not charge VAT for non-VAT, exempt, and zero-rated stores', () => {
  for (const taxStatus of ['non_vat', 'vat_exempt', 'zero_rated']) {
    const result = calculateTransactionTax({ subtotal: 999.99, taxConfiguration: { taxStatus, pricingMode: 'exclusive', vatRatePercent: 12 } });
    assert.equal(result.vatAmount, 0);
    assert.equal(result.finalTotal, 999.99);
  }
});

test('uses stable centavo rounding', () => {
  const result = calculateTransactionTax({
    subtotal: 99.99,
    discountAmount: 0.01,
    taxConfiguration: { taxStatus: 'vat_registered', pricingMode: 'exclusive', vatRatePercent: 12 }
  });
  assert.equal(result.vatAmount, 12);
  assert.equal(result.finalTotal, 111.98);
});

test('calculates a multiple-item subtotal consistently', () => {
  const itemLines = [{ price: 125.5, quantity: 2 }, { price: 249, quantity: 3 }];
  const subtotal = itemLines.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const result = calculateTransactionTax({
    subtotal,
    taxConfiguration: { taxStatus: 'vat_registered', pricingMode: 'exclusive', vatRatePercent: 12 }
  });
  assert.equal(result.subtotal, 998);
  assert.equal(result.vatAmount, 119.76);
  assert.equal(result.finalTotal, 1117.76);
});

test('a stored transaction snapshot does not change with future store settings', () => {
  const savedSnapshot = calculateTransactionTax({
    subtotal: 1000,
    taxConfiguration: { taxStatus: 'vat_registered', pricingMode: 'exclusive', vatRatePercent: 12 }
  });
  calculateTransactionTax({
    subtotal: 1000,
    taxConfiguration: { taxStatus: 'vat_registered', pricingMode: 'exclusive', vatRatePercent: 15 }
  });
  assert.equal(savedSnapshot.vatRatePercent, 12);
  assert.equal(savedSnapshot.vatAmount, 120);
  assert.equal(savedSnapshot.finalTotal, 1120);
});
