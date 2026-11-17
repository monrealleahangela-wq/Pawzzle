const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const controllerPath = require.resolve('../controllers/storePlanFeaturesController');
const subscriptionServicePath = require.resolve('../services/storeSubscriptionService');

test('location allowance uses the authoritative Professional tier instead of stale Free metadata', async () => {
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
    const { assertCanAddLocation } = require('../services/storeSubscriptionService');
    const store = {
      _id: 'assigned-professional-store',
      subscriptionTier: 'free',
      subscriptionLegacyGrantOptOutAt: new Date(),
      operatingLocations: [{ isActive: true }]
    };

    const summary = await assertCanAddLocation(store, {
      authoritativeSubscription: {
        tier: 'professional', sourceStoreId: store._id, payment: { targetTier: 'professional' }
      }
    });

    assert.equal(summary.tier, 'professional');
    assert.equal(summary.usage.activeLocations, 2);
    assert.equal(summary.allowances.locations, 3);
    assert.equal(summary.capabilities.canAddLocation, true);
  } finally {
    Module._load = originalLoad;
    delete require.cache[subscriptionServicePath];
  }
});

test('Professional seller location creation uses the same authoritative plan context as settings', async () => {
  const originalLoad = Module._load;
  const entitlementCalls = [];
  const locationLimitCalls = [];
  let resolvedUser;
  let saved = false;

  const operatingLocations = [];
  operatingLocations.at = Array.prototype.at;
  const professionalStore = {
    _id: 'assigned-professional-store',
    name: 'Pawzzle',
    operatingLocations,
    save: async () => { saved = true; }
  };
  const authoritativeSubscription = {
    tier: 'professional',
    sourceStoreId: professionalStore._id,
    payment: { targetTier: 'professional' }
  };

  Module._load = function load(request, parent, isMain) {
    if (request === '../models/Store') return {};
    if (request === '../models/Inventory') return {};
    if (request === '../models/Order') return {};
    if (request === '../models/Booking') return {};
    if (request === '../models/User') return {};
    if (request === '../services/storeAccessService') return {
      resolveSubscriptionContext: async user => {
        resolvedUser = user;
        return { operationalStore: professionalStore, authoritativeSubscription };
      }
    };
    if (request === '../services/storeSubscriptionService') return {
      getStoreSubscriptionSummary: async () => ({ tier: 'professional' }),
      assertStoreEntitlement: async (...args) => entitlementCalls.push(args),
      assertCanAddLocation: async (...args) => locationLimitCalls.push(args)
    };
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[controllerPath];
  try {
    const { createLocation } = require('../controllers/storePlanFeaturesController');
    const user = { _id: 'seller-account', role: 'admin', store: professionalStore._id };
    const req = {
      user,
      body: {
        name: 'Silang Branch',
        code: 'slg',
        address: {
          street: 'Pawzzle Silang', barangay: 'Narra 2', city: 'Silang', state: 'Cavite'
        }
      }
    };
    let responseStatus;
    let responseBody;
    const res = {
      status(code) { responseStatus = code; return this; },
      json(body) { responseBody = body; return body; }
    };

    await createLocation(req, res);

    assert.equal(resolvedUser, user);
    assert.equal(entitlementCalls.length, 1);
    assert.equal(entitlementCalls[0][0], professionalStore);
    assert.equal(entitlementCalls[0][1], 'multi_location');
    assert.equal(entitlementCalls[0][2].authoritativeSubscription, authoritativeSubscription);
    assert.equal(locationLimitCalls.length, 1);
    assert.equal(locationLimitCalls[0][0], professionalStore);
    assert.equal(locationLimitCalls[0][1].authoritativeSubscription, authoritativeSubscription);
    assert.equal(saved, true);
    assert.equal(responseStatus, 201);
    assert.equal(responseBody.message, 'Store location added.');
    assert.equal(professionalStore.operatingLocations[0].code, 'SLG');
  } finally {
    Module._load = originalLoad;
    delete require.cache[controllerPath];
  }
});
