const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('seller plan catalog uses the approved active-listing allowances', () => {
  const { SUBSCRIPTION_PLANS, normalizeSubscriptionTier } = require('../config/subscriptionPlans');
  assert.equal(SUBSCRIPTION_PLANS.free.listingLimit, 10);
  assert.equal(SUBSCRIPTION_PLANS.starter.listingLimit, 30);
  assert.equal(SUBSCRIPTION_PLANS.growth.listingLimit, 70);
  assert.equal(SUBSCRIPTION_PLANS.professional.listingLimit, null);
  assert.equal(normalizeSubscriptionTier('basic'), 'free');
  assert.equal(normalizeSubscriptionTier('premium'), 'growth');
  assert.equal(normalizeSubscriptionTier('enterprise'), 'professional');
});

test('subscription summary counts all customer-facing listing types and active staff', async () => {
  const counts = { Product: 4, Pet: 3, Service: 2, User: 1 };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    const model = request.match(/^\.\.\/models\/(Product|Pet|Service|Store|User)$/)?.[1];
    if (model === 'Store') return { findById: () => ({ select: async () => null }) };
    if (model) return { countDocuments: async () => counts[model] };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('../services/storeSubscriptionService')];
    const { getStoreSubscriptionSummary } = require('../services/storeSubscriptionService');
    const summary = await getStoreSubscriptionSummary({ _id: 'store-1', subscriptionTier: 'starter' });
    assert.equal(summary.usage.activeListings, 9);
    assert.deepEqual(summary.usage.listingsByType, { products: 4, pets: 3, services: 2 });
    assert.equal(summary.usage.activeStaff, 1);
    assert.equal(summary.allowances.listings, 30);
    assert.equal(summary.capabilities.canAddListing, true);
    assert.equal(summary.capabilities.canAddStaff, true);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve('../services/storeSubscriptionService')];
  }
});

test('listing limit blocks only a new activation and returns an upgrade-safe error', async () => {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    const model = request.match(/^\.\.\/models\/(Product|Pet|Service|Store|User)$/)?.[1];
    if (model === 'Store') return { findById: () => ({ select: async () => null }) };
    if (model === 'Product') return { countDocuments: async () => 10 };
    if (model) return { countDocuments: async () => 0 };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('../services/storeSubscriptionService')];
    const { assertCanActivateListing } = require('../services/storeSubscriptionService');
    await assert.rejects(
      () => assertCanActivateListing({ _id: 'store-2', subscriptionTier: 'free' }),
      error => error.statusCode === 409 && error.code === 'SUBSCRIPTION_LISTING_LIMIT' && /10 active listings/.test(error.message)
    );
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve('../services/storeSubscriptionService')];
  }
});

test('listing and staff entry points enforce plans without mutating existing records', () => {
  assert.match(read('controllers/productController.js'), /!wasActiveListing && nextActiveListing/);
  assert.match(read('controllers/petController.js'), /!wasActiveListing && nextActiveListing/);
  assert.match(read('controllers/serviceController.js'), /service\.isActive === false && updates\.isActive === true/);
  assert.match(read('controllers/staffController.js'), /await assertCanAddStaff\(store\)/);
  assert.doesNotMatch(read('services/storeSubscriptionService.js'), /deleteMany|updateMany|findByIdAndDelete/);
});

test('seller settings expose usage and the complete plan comparison', () => {
  const component = read('client/src/components/settings/SubscriptionPlanSettings.js');
  const settings = read('client/src/pages/admin/AdminSettings.js');
  assert.match(component, /Active listings/);
  assert.match(component, /Existing listings are never deleted on downgrade/);
  assert.match(component, /Security, verification, FDA review, and payment protection remain available on every plan/);
  assert.match(settings, /\['plan', 'Subscription'\]/);
  assert.match(settings, /<SubscriptionPlanSettings/);
});
