const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DeliveryFeeRule = require('../models/DeliveryFeeRule');
const DeliveryFeeService = require('../services/deliveryFeeService');
const {
  validateRuleInput,
  calculateRulePreview
} = require('../services/deliveryPricingConfigurationService');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

const validRule = {
  baseFee: 40,
  includedKilometers: 3,
  ratePerKilometer: 10,
  additionalItemFee: 5,
  minimumFee: 0,
  maximumFee: '',
  maximumDistanceKm: 15
};

test('delivery pricing rejects missing, negative, and contradictory values with field errors', () => {
  const missing = validateRuleInput({});
  assert.equal(missing.valid, false);
  assert.equal(missing.fieldErrors.baseFee, 'Enter a valid number.');
  assert.equal(missing.fieldErrors.ratePerKilometer, 'Enter a valid number.');

  const negative = validateRuleInput({ ...validRule, baseFee: -1, additionalItemFee: -2 });
  assert.equal(negative.valid, false);
  assert.equal(negative.fieldErrors.baseFee, 'Value cannot be negative.');
  assert.equal(negative.fieldErrors.additionalItemFee, 'Value cannot be negative.');

  const limits = validateRuleInput({ ...validRule, minimumFee: 100, maximumFee: 50, maximumDistanceKm: 0 });
  assert.equal(limits.valid, false);
  assert.match(limits.fieldErrors.maximumFee, /cannot be lower/);
  assert.match(limits.fieldErrors.maximumDistanceKm, /greater than zero/);
});

test('the management preview uses the same authoritative base, distance, item, minimum, and maximum formula', () => {
  const preview = calculateRulePreview({ input: validRule, distanceKm: 5, itemQuantity: 3 });
  assert.equal(preview.valid, true);
  assert.equal(preview.breakdown.baseFee, 40);
  assert.equal(preview.breakdown.billableKilometers, 2);
  assert.equal(preview.breakdown.distanceCharge, 20);
  assert.equal(preview.breakdown.additionalItemQuantity, 2);
  assert.equal(preview.breakdown.itemCharge, 10);
  assert.equal(preview.finalShippingFee, 70);

  const minimum = calculateRulePreview({ input: { ...validRule, minimumFee: 90 }, distanceKm: 3, itemQuantity: 1 });
  assert.equal(minimum.finalShippingFee, 90);
  const maximum = calculateRulePreview({ input: { ...validRule, maximumFee: 60 }, distanceKm: 10, itemQuantity: 4 });
  assert.equal(maximum.finalShippingFee, 60);
});

test('checkout distinguishes no rule, intentionally inactive delivery, active calculation, and range failure', async () => {
  const originalFindOne = DeliveryFeeRule.findOne;
  const originalExists = DeliveryFeeRule.exists;
  let capturedQuery;
  try {
    DeliveryFeeRule.findOne = query => {
      capturedQuery = query;
      return { sort: async () => null };
    };
    DeliveryFeeRule.exists = async () => null;
    await assert.rejects(
      DeliveryFeeService.calculate({ store: 'store-a', origin: { lat: 14.3, lng: 120.9 }, destination: { lat: 14.31, lng: 120.91 } }),
      error => error.code === 'DELIVERY_RULE_REQUIRED'
    );
    assert.equal(capturedQuery.store, 'store-a');

    DeliveryFeeRule.exists = async query => query.store === 'store-a';
    await assert.rejects(
      DeliveryFeeService.calculate({ store: 'store-a', origin: { lat: 14.3, lng: 120.9 }, destination: { lat: 14.31, lng: 120.91 } }),
      error => error.code === 'HOME_DELIVERY_DISABLED'
    );

    const rule = { _id: 'rule-a', name: 'Current rule', version: 4, ...validRule };
    DeliveryFeeRule.findOne = query => {
      capturedQuery = query;
      return { sort: async () => rule };
    };
    const calculation = await DeliveryFeeService.calculate({
      store: 'store-a',
      origin: { lat: 14.3, lng: 120.9 },
      destination: { lat: 14.31, lng: 120.91 },
      itemQuantity: 2
    });
    assert.equal(capturedQuery.store, 'store-a');
    assert.equal(capturedQuery.isActive, true);
    assert.equal(calculation.rule.version, 4);
    assert.equal(calculation.breakdown.additionalItemQuantity, 1);

    DeliveryFeeRule.findOne = () => ({ sort: async () => ({ ...rule, maximumDistanceKm: 0.1 }) });
    await assert.rejects(
      DeliveryFeeService.calculate({ store: 'store-a', origin: { lat: 14.3, lng: 120.9 }, destination: { lat: 14.31, lng: 120.91 } }),
      error => error.code === 'OUTSIDE_DELIVERY_RANGE'
    );
  } finally {
    DeliveryFeeRule.findOne = originalFindOne;
    DeliveryFeeRule.exists = originalExists;
  }
});

test('management routes are protected and expose read, preview, update, and platform oversight endpoints', () => {
  const routes = read('routes/stores.js');
  assert.match(routes, /get\('\/my-store\/delivery-pricing', authenticate, adminOnly/);
  assert.match(routes, /post\('\/my-store\/delivery-pricing\/preview', authenticate, adminOnly/);
  assert.match(routes, /put\('\/my-store\/delivery-pricing', authenticate, adminOnly/);
  assert.match(routes, /post\('\/:id\/delivery-pricing\/preview', authenticate, superAdminOnly/);
  assert.match(routes, /put\('\/:id\/delivery-pricing', authenticate, superAdminOnly/);
  assert.doesNotMatch(routes, /delivery-pricing', authenticate, customerOnly/);
});

test('Store Settings has no invented rate defaults and clearly exposes origin, activation, field errors, and server preview', () => {
  const settings = read('client/src/pages/admin/AdminSettings.js');
  const panel = read('client/src/components/settings/DeliveryPricingSettings.js');
  assert.match(settings, /baseFee: ''/);
  assert.match(settings, /ratePerKilometer: ''/);
  assert.match(settings, /previewDeliveryPricing/);
  assert.match(panel, /Store delivery origin/);
  assert.match(panel, /Map location needs confirmation/);
  assert.match(panel, /role="switch"/);
  assert.match(panel, /Server-calculated example/);
  assert.match(panel, /Delivery fee = base fee \+ distance beyond/);
  assert.match(panel, /fieldErrors\[field\]/);
});

test('rule activation preserves version history and records the responsible account', () => {
  const controller = read('controllers/storeController.js');
  const model = read('models/DeliveryFeeRule.js');
  assert.match(controller, /findOne\(\{ store: store\._id \}\)\.sort\(\{ version: -1, createdAt: -1 \}\)/);
  assert.match(controller, /version = Number\(previous\?\.version \|\| 0\) \+ 1/);
  assert.match(controller, /effectiveUntil: now, deactivatedBy: req\.user\._id/);
  assert.match(controller, /createdBy: req\.user\._id/);
  assert.match(model, /createdBy: \{ type: mongoose\.Schema\.Types\.ObjectId, ref: 'User' \}/);
  assert.match(model, /deactivatedBy: \{ type: mongoose\.Schema\.Types\.ObjectId, ref: 'User' \}/);
});

test('checkout error semantics, pickup behavior, server authority, and historical snapshots remain intact', () => {
  const address = read('client/src/utils/deliveryAddress.js');
  const pricing = read('services/orderPricingService.js');
  const orderController = read('controllers/orderController.js');
  const orderModel = read('models/Order.js');
  const checkout = read('client/src/pages/customer/Checkout.js');

  assert.match(address, /HOME_DELIVERY_DISABLED: 'Home delivery is currently unavailable for this store\.'/);
  assert.match(address, /DELIVERY_RULE_REQUIRED: 'Delivery pricing is not configured for this store\.'/);
  assert.match(pricing, /if \(deliveryMethod === 'pickup'\) return \{ fee: 0, calculation: null \}/);
  assert.match(pricing, /DeliveryFeeService\.calculate\(\{/);
  assert.match(pricing, /calculateTransactionTax\(\{/);
  assert.match(orderController, /deliveryFeeCalculation: pricing\.deliveryFeeCalculation/);
  assert.match(orderModel, /rule:[\s\S]*id: \{ type: mongoose\.Schema\.Types\.ObjectId, ref: 'DeliveryFeeRule' \}/);
  assert.match(checkout, /!pricingQuote/);
  assert.doesNotMatch(checkout.slice(checkout.indexOf('const orderData = {'), checkout.indexOf('const response = await orderService.createOrder')), /shippingFee|finalTotal|distanceCharge/);
});

test('one-store-per-checkout remains enforced so another Store rule cannot price the order', () => {
  const pricing = read('services/orderPricingService.js');
  assert.match(pricing, /Items from different stores must be checked out separately/);
  assert.match(pricing, /store: store\._id/);
  assert.match(pricing, /const store = await Store\.findById\(storeId\)/);
});
