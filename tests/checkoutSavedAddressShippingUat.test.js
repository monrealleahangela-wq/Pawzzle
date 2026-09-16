const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DeliveryFeeService = require('../services/deliveryFeeService');
const { pickProfileUpdates, applyProfileUpdates } = require('../utils/authSecurity');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

const checkout = () => read('client/src/pages/customer/Checkout.js');
const addressUtility = () => read('client/src/utils/deliveryAddress.js');

test('saved-address normalization supports flat, nested, and GeoJSON coordinate representations', () => {
  const source = addressUtility();
  assert.match(source, /address\?\.coordinates/);
  assert.match(source, /address\?\.location/);
  assert.match(source, /Array\.isArray\(direct\?\.coordinates\)/);
  assert.match(source, /address\?\.latitude/);
  assert.match(source, /address\?\.longitude/);
  assert.match(source, /latitude < -90 \|\| latitude > 90/);
});

test('Use This Address applies trusted coordinates and requests a fresh quote', () => {
  const source = checkout();
  assert.match(source, /const resetToProfileAddress = \(\) =>/);
  assert.match(source, /setShippingAddress\(profileAddress\)/);
  assert.match(source, /hasValidAddressCoordinates\(profileAddress\)/);
  assert.match(source, /setDestinationConfirmed\(true\)/);
  assert.match(source, /Address selected\. Calculating delivery/);
});

test('legacy text-only saved addresses require map confirmation without fabricated coordinates', () => {
  const source = checkout();
  assert.match(source, /Confirm this saved address on the map before delivery can be calculated/);
  assert.match(source, /setAddressInputType\('map'\)/);
  assert.match(source, /Confirm on Map/);
  assert.doesNotMatch(source, /coordinates:\s*\{\s*lat:\s*14\.3121/);
});

test('profile no longer assigns default coordinates to text-only addresses', () => {
  const source = read('client/src/pages/customer/Profile.js');
  assert.doesNotMatch(source, /coordinates: user\.address\?\.coordinates \|\| \{\s*lat: 14\.3121/);
  assert.match(source, /coordinates: user\.address\?\.coordinates \|\| null/);
  assert.match(source, /coordinates: null/);
  assert.match(source, /initialCoordinates=\{formData\.address\.coordinates\}/);
});

test('editing address text clears stale saved coordinates without replacing them with defaults', () => {
  const updates = pickProfileUpdates({
    address: { street: 'Updated Street', coordinates: null }
  });
  const user = { address: { street: 'Old Street', coordinates: { lat: 14.3, lng: 120.9 } } };
  applyProfileUpdates(user, updates);
  assert.equal(user.address.street, 'Updated Street');
  assert.equal(user.address.coordinates, undefined);
});

test('manual address changes invalidate coordinates and the previous quote', () => {
  const source = checkout();
  assert.match(source, /handleAddressChange[\s\S]*coordinates: undefined/);
  assert.match(source, /handleAddressChange[\s\S]*setDestinationConfirmed\(false\)/);
  assert.match(source, /startAddressChange[\s\S]*setPricingQuote\(null\)/);
});

test('confirmed map selection updates the authoritative address and quote inputs', () => {
  const source = checkout();
  assert.match(source, /onLocationSelected=\{\(location\) =>/);
  assert.match(source, /coordinates: getAddressCoordinates\(location\)/);
  assert.match(source, /initialCoordinates=\{getAddressCoordinates\(shippingAddress\)\}/);
  assert.match(source, /setDestinationConfirmed\(true\)/);
});

test('quote effect waits for a confirmed delivery destination but pickup does not', () => {
  const source = checkout();
  assert.match(source, /deliveryMethod === 'delivery' && \(!destinationConfirmed \|\| !hasValidAddressCoordinates\(shippingAddress\)\)/);
  assert.match(source, /deliveryMethod === 'delivery' && destinationConfirmed \? shippingAddress : \{\}/);
  assert.match(read('services/orderPricingService.js'), /if \(deliveryMethod === 'pickup'\) return \{ fee: 0, calculation: null \}/);
});

test('stale quote responses cannot replace a newer destination quote', () => {
  const source = checkout();
  assert.match(source, /quoteRequestIdRef = React\.useRef\(0\)/);
  assert.match(source, /requestId = \+\+quoteRequestIdRef\.current/);
  assert.match(source, /quoteRequestIdRef\.current === requestId/);
  assert.match(source, /active = false/);
});

test('backend distinguishes customer, store, rule, and range delivery failures', () => {
  const pricing = read('services/orderPricingService.js');
  const delivery = read('services/deliveryFeeService.js');
  for (const code of [
    'CUSTOMER_LOCATION_REQUIRED',
    'STORE_LOCATION_REQUIRED',
    'DELIVERY_RULE_REQUIRED',
    'OUTSIDE_DELIVERY_RANGE'
  ]) {
    assert.match(`${pricing}\n${delivery}`, new RegExp(code));
  }
});

test('quote API returns machine-readable error codes while preserving tax verification', () => {
  const controller = read('controllers/orderController.js');
  assert.match(controller, /code: error\.code \|\| 'QUOTE_FAILED'/);
  assert.match(controller, /error\.code === 'STORE_TAX_VERIFICATION_REQUIRED'/);
  assert.match(controller, /deliveryErrorCodes/);
});

test('server validates coordinate ranges and calculates distance authoritatively', () => {
  const { validateCoordinates, haversineKm } = DeliveryFeeService.__test;
  assert.equal(validateCoordinates({ lat: 14.3, lng: 120.9 }), true);
  assert.equal(validateCoordinates({ lat: 91, lng: 120.9 }), false);
  assert.equal(validateCoordinates({ lat: 14.3, lng: 181 }), false);
  assert.ok(haversineKm({ lat: 14.3, lng: 120.9 }, { lat: 14.31, lng: 120.91 }) > 0);
});

test('existing fee rule formula returns base, distance, and additional-item charges', () => {
  const result = DeliveryFeeService.__test.calculateBreakdown({
    rule: {
      baseFee: 45,
      includedKilometers: 2,
      ratePerKilometer: 10,
      additionalItemFee: 5,
      minimumFee: 0,
      maximumFee: null
    },
    distanceKm: 5,
    itemQuantity: 3
  });
  assert.equal(result.breakdown.baseFee, 45);
  assert.equal(result.breakdown.distanceCharge, 30);
  assert.equal(result.breakdown.itemCharge, 10);
  assert.equal(result.finalShippingFee, 85);
});

test('checkout displays selected destination and disables payment until quote is authoritative', () => {
  const source = checkout();
  assert.match(source, />Delivering to</);
  assert.match(source, /formatDeliveryAddress\(shippingAddress\)/);
  assert.match(source, /!pricingQuote/);
  assert.match(source, /deliveryMethod === 'delivery'[\s\S]*!destinationConfirmed/);
});

test('frontend never submits shipping fee, distance charge, or final total as authority', () => {
  const source = checkout();
  const orderData = source.slice(source.indexOf('const orderData = {'), source.indexOf('const response = await orderService.createOrder'));
  assert.doesNotMatch(orderData, /shippingFee|distanceCharge|finalTotal/);
  const pricing = read('services/orderPricingService.js');
  assert.match(pricing, /DeliveryFeeService\.calculate/);
  assert.match(pricing, /calculateTransactionTax/);
});

test('order creation and PayMongo retain the server pricing snapshot', () => {
  const controller = read('controllers/orderController.js');
  const payment = read('controllers/paymentController.js');
  assert.match(controller, /totalAmount: breakdown\.finalTotal/);
  assert.match(controller, /deliveryFeeCalculation: pricing\.deliveryFeeCalculation/);
  assert.match(payment, /order\.totalAmount/);
});
