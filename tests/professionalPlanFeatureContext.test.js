const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const subscriptionServicePath = require.resolve('../services/storeSubscriptionService');

test('Professional remains a single-location plan and cannot add another location', async () => {
  const originalLoad = Module._load;
  const emptyCountModel = { countDocuments: async () => 0 };
  Module._load = function load(request, parent, isMain) {
    if (['../models/Product', '../models/Pet', '../models/Service', '../models/User'].includes(request)) {
      return emptyCountModel;
    }
    if (request === '../models/Store') return {};
    if (request === '../models/StoreSubscriptionPayment') return { find: async () => [] };
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[subscriptionServicePath];
  try {
    const { assertCanAddLocation, getStoreSubscriptionSummary } = require('../services/storeSubscriptionService');
    const store = {
      _id: 'professional-store',
      subscriptionTier: 'professional',
      subscriptionLegacyGrantOptOutAt: new Date(),
      operatingLocations: []
    };

    const summary = await getStoreSubscriptionSummary(store);
    assert.equal(summary.tier, 'professional');
    assert.equal(summary.allowances.locations, 1);
    assert.equal(summary.capabilities.canAddLocation, false);
    await assert.rejects(
      () => assertCanAddLocation(store),
      error => error?.code === 'SUBSCRIPTION_LOCATION_LIMIT'
    );
  } finally {
    Module._load = originalLoad;
    delete require.cache[subscriptionServicePath];
  }
});

test('Professional catalog no longer advertises or grants multi-location features', () => {
  const { SUBSCRIPTION_PLANS, ENTITLEMENTS, getPublicPlanCatalog } = require('../config/subscriptionPlans');
  const professional = SUBSCRIPTION_PLANS.professional;
  const publicProfessional = getPublicPlanCatalog().find(plan => plan.id === 'professional');

  assert.equal(professional.locationLimit, 1);
  assert.equal(professional.entitlements.includes(ENTITLEMENTS.MULTI_LOCATION), false);
  assert.equal(professional.entitlements.includes(ENTITLEMENTS.CONSOLIDATED_INVENTORY), false);
  assert.equal(publicProfessional.features.some(feature => /store location/i.test(feature)), false);
});
