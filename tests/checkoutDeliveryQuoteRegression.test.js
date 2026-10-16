const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Product = require('../models/Product');
const Store = require('../models/Store');
const DeliveryFeeRule = require('../models/DeliveryFeeRule');
const { calculateOrderPricing, revalidatePendingOrderDelivery } = require('../services/orderPricingService');
const DeliveryFeeService = require('../services/deliveryFeeService');
const { quoteOrder } = require('../controllers/orderController');

const storeId = 'store-quote-test';
const origin = { lat: 14.30, lng: 120.90 };
const destination = { lat: 14.32, lng: 120.92 };
const store = {
  _id: storeId,
  owner: 'owner-quote-test',
  name: 'Synthetic Store',
  isActive: true,
  isDeleted: false,
  verificationStatus: 'verified',
  businessCompliance: { restrictionReasons: [], documents: [] },
  taxProfile: { verificationStatus: 'verified' },
  taxConfiguration: { isConfigured: true, taxStatus: 'non_vat', pricingMode: 'inclusive', vatRatePercent: 0 },
  contactInfo: { address: { coordinates: origin } }
};
const rule = {
  _id: 'rule-quote-test', name: 'Synthetic distance pricing', version: 1,
  baseFee: 45, includedKilometers: 2, ratePerKilometer: 10,
  additionalItemFee: 5, minimumFee: 0, maximumFee: null, maximumDistanceKm: 20
};
const product = {
  _id: 'product-quote-test', name: 'Synthetic Supply', price: 100,
  stockQuantity: 5, isActive: true, store: storeId, images: []
};
const request = {
  items: [{ itemType: 'product', itemId: product._id, quantity: 2 }],
  requestedDeliveryMethod: 'delivery',
  shippingAddress: { street: 'Test Street', barangay: 'Test Barangay', city: 'Test City', coordinates: destination }
};

const withPricingFixtures = async (run, { item = product, seller = store, activeRule = rule, configuredRule = Boolean(activeRule), ruleFailure = false } = {}) => {
  const originals = {
    productFindById: Product.findById,
    storeFindById: Store.findById,
    ruleFindOne: DeliveryFeeRule.findOne,
    ruleExists: DeliveryFeeRule.exists
  };
  Product.findById = async id => Array.isArray(item) ? item.find(entry => entry._id === id) : item;
  Store.findById = async () => seller;
  DeliveryFeeRule.findOne = () => ({ sort: async () => {
    if (ruleFailure) throw new Error('Synthetic database outage');
    return activeRule;
  } });
  DeliveryFeeRule.exists = async () => configuredRule;
  try { await run(); } finally {
    Product.findById = originals.productFindById;
    Store.findById = originals.storeFindById;
    DeliveryFeeRule.findOne = originals.ruleFindOne;
    DeliveryFeeRule.exists = originals.ruleExists;
  }
};

test('delivery quote remains available but explicitly flags missing catalog weight', async () => {
  await withPricingFixtures(async () => {
    const result = await calculateOrderPricing(request);
    const distance = DeliveryFeeService.__test.haversineKm(origin, destination);
    const expectedFee = DeliveryFeeService.__test.calculateBreakdown({ rule, distanceKm: distance, itemQuantity: 2 }).finalShippingFee;
    assert.equal(result.deliveryFeeCalculation.totalFee, expectedFee);
    assert.equal(result.pricingBreakdown.deliveryFee, expectedFee);
    assert.equal(result.parcelEstimate.status, 'missing_product_weight');
    assert.equal(result.parcelEstimate.weightKg, undefined);
    assert.equal(result.parcelEstimate.missingItems[0].name, 'Synthetic Supply');
  });
});

const rejectsCode = (input, code) => assert.rejects(
  calculateOrderPricing(input),
  error => error.code === code
);

test('customer location and malformed address produce distinct safe errors', async () => {
  await withPricingFixtures(async () => {
    await rejectsCode({ ...request, shippingAddress: { street: 'Test Street' } }, 'CUSTOMER_LOCATION_REQUIRED');
    await rejectsCode({ ...request, shippingAddress: { coordinates: { lat: null, lng: '' } } }, 'INVALID_DELIVERY_ADDRESS');
    await rejectsCode({ ...request, shippingAddress: 'not-an-address' }, 'INVALID_DELIVERY_ADDRESS');
  });
});

test('missing Store origin, coverage failure, and missing or inactive rules remain blocked', async () => {
  await withPricingFixtures(
    () => rejectsCode(request, 'STORE_LOCATION_REQUIRED'),
    { seller: { ...store, contactInfo: { address: { coordinates: null } } } }
  );
  await withPricingFixtures(
    () => rejectsCode(request, 'OUTSIDE_DELIVERY_RANGE'),
    { activeRule: { ...rule, maximumDistanceKm: 0.1 } }
  );
  await withPricingFixtures(
    () => rejectsCode(request, 'DELIVERY_RULE_REQUIRED'),
    { activeRule: null, configuredRule: false }
  );
  await withPricingFixtures(
    () => rejectsCode(request, 'HOME_DELIVERY_DISABLED'),
    { activeRule: null, configuredRule: true }
  );
});

test('invalid pricing configuration and temporary rule storage failure cannot produce a zero-fee quote', async () => {
  await withPricingFixtures(
    () => rejectsCode(request, 'DELIVERY_PRICING_UNAVAILABLE'),
    { activeRule: { ...rule, ratePerKilometer: null } }
  );
  await withPricingFixtures(
    () => rejectsCode(request, 'DELIVERY_SERVICE_UNAVAILABLE'),
    { ruleFailure: true }
  );
});

test('cart spanning Stores is rejected before one Store can price the other Store item', async () => {
  const other = { ...product, _id: 'product-other-store', store: 'store-other', name: 'Other Store Supply' };
  await withPricingFixtures(async () => {
    await rejectsCode({ ...request, items: [
      { itemType: 'product', itemId: product._id, quantity: 1 },
      { itemType: 'product', itemId: other._id, quantity: 1 }
    ] }, 'MULTI_STORE_DELIVERY_UNSUPPORTED');
  }, { item: [product, other] });
});

test('quote API returns safe configuration and temporary failure codes, never a raw backend exception', async () => {
  const response = () => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  });
  await withPricingFixtures(async () => {
    const res = response();
    await quoteOrder({ body: { ...request, deliveryMethod: 'delivery' } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'DELIVERY_RULE_REQUIRED');
  }, { activeRule: null, configuredRule: false });
  await withPricingFixtures(async () => {
    const res = response();
    await quoteOrder({ body: { ...request, deliveryMethod: 'delivery' } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'DELIVERY_SERVICE_UNAVAILABLE');
    assert.doesNotMatch(res.body.message, /Synthetic database outage/);
  }, { ruleFailure: true });
});

test('checkout creation recomputes the delivery fee and never trusts a submitted fee or final total', async () => {
  await withPricingFixtures(async () => {
    const priced = await calculateOrderPricing({ ...request, shippingFee: -9999, totalAmount: 1 });
    assert.ok(priced.pricingBreakdown.deliveryFee > 0);
    assert.ok(priced.pricingBreakdown.finalTotal > 1);
  });
  const source = fs.readFileSync(path.join(__dirname, '../controllers/orderController.js'), 'utf8');
  const activeCreate = source.slice(source.indexOf('const createOrder = async'), source.indexOf('const quoteOrder = async'));
  assert.match(activeCreate, /const pricing = await calculateOrderPricing\(/);
  assert.match(activeCreate, /shippingFee: breakdown\.deliveryFee/);
  assert.match(activeCreate, /totalAmount: breakdown\.finalTotal/);
  assert.doesNotMatch(activeCreate, /req\.body\.shippingFee|req\.body\.totalAmount/);
});

test('PayMongo initiation rejects stale or invalid delivery instead of using an old fee snapshot', async () => {
  const distance = DeliveryFeeService.__test.haversineKm(origin, destination);
  const fee = DeliveryFeeService.__test.calculateBreakdown({ rule, distanceKm: distance, itemQuantity: 2 }).finalShippingFee;
  const pendingOrder = {
    deliveryMethod: 'delivery', store, shippingAddress: request.shippingAddress,
    items: request.items, pricingBreakdown: { deliveryFee: fee }, shippingFee: fee
  };
  await withPricingFixtures(() => revalidatePendingOrderDelivery(pendingOrder));
  await withPricingFixtures(
    () => assert.rejects(revalidatePendingOrderDelivery(pendingOrder), error => error.code === 'DELIVERY_QUOTE_CHANGED' && error.statusCode === 409),
    { activeRule: { ...rule, baseFee: rule.baseFee + 10 } }
  );
  await withPricingFixtures(
    () => assert.rejects(revalidatePendingOrderDelivery(pendingOrder), error => error.code === 'OUTSIDE_DELIVERY_RANGE'),
    { activeRule: { ...rule, maximumDistanceKm: 0.1 } }
  );
  const source = fs.readFileSync(path.join(__dirname, '../controllers/paymentController.js'), 'utf8');
  const payment = source.slice(source.indexOf('const createCheckoutSession = async'), source.indexOf('const createBookingCheckoutSession = async'));
  assert.ok(payment.indexOf('await revalidatePendingOrderDelivery(order)') < payment.indexOf('await ensureCheckoutSession({'));
  assert.match(payment, /code: error\.code/);
});
