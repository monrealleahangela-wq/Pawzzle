const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const clearModules = () => {
  for (const modulePath of [
    '../services/storeSubscriptionService',
    '../services/storeAccessService',
    '../middleware/subscriptionEntitlement'
  ]) {
    delete require.cache[require.resolve(modulePath)];
  }
};

const withModelMocks = async (mocks, callback) => {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  clearModules();
  try {
    await callback();
  } finally {
    Module._load = originalLoad;
    clearModules();
  }
};

const emptyCountModel = { countDocuments: async () => 0 };

test('every subscription tier receives only its configured HR access', async () => {
  await withModelMocks({
    '../models/Product': emptyCountModel,
    '../models/Pet': emptyCountModel,
    '../models/Service': emptyCountModel,
    '../models/User': emptyCountModel,
    '../models/Store': {},
    '../models/StoreSubscriptionPayment': { find: async () => [] }
  }, async () => {
    const { assertStoreEntitlement } = require('../services/storeSubscriptionService');
    const { ENTITLEMENTS } = require('../config/subscriptionPlans');
    const store = {
      _id: 'tier-matrix-store',
      subscriptionLegacyGrantOptOutAt: new Date(),
      operatingLocations: []
    };

    for (const tier of ['free', 'starter']) {
      const authoritativeSubscription = { tier, sourceStoreId: store._id, payment: null };
      await assert.rejects(
        () => assertStoreEntitlement(store, ENTITLEMENTS.STAFF_ATTENDANCE, { authoritativeSubscription }),
        error => error.code === 'SUBSCRIPTION_ENTITLEMENT_REQUIRED' && error.details.currentTier === tier
      );
    }

    for (const tier of ['growth', 'professional']) {
      const authoritativeSubscription = { tier, sourceStoreId: store._id, payment: null };
      await assert.doesNotReject(
        () => assertStoreEntitlement(store, ENTITLEMENTS.STAFF_ATTENDANCE, { authoritativeSubscription })
      );
    }

    await assert.rejects(
      () => assertStoreEntitlement(store, ENTITLEMENTS.PAYROLL, {
        authoritativeSubscription: { tier: 'growth', sourceStoreId: store._id, payment: null }
      }),
      error => error.code === 'SUBSCRIPTION_ENTITLEMENT_REQUIRED' && error.details.currentTier === 'growth'
    );
    await assert.doesNotReject(
      () => assertStoreEntitlement(store, ENTITLEMENTS.PAYROLL, {
        authoritativeSubscription: { tier: 'professional', sourceStoreId: store._id, payment: null }
      })
    );
  });
});
test('a current paid Professional subscription overrides stale Free store metadata', async () => {
  const store = {
    _id: 'operational-store',
    owner: 'owner-1',
    subscriptionTier: 'free',
    isActive: true,
    isDeleted: false,
    createdAt: new Date('2026-11-12T00:00:00.000Z'),
    operatingLocations: []
  };
  const payment = {
    store: 'billing-store',
    requestedBy: 'owner-1',
    targetTier: 'professional',
    billingInterval: 'monthly',
    status: 'paid',
    periodStart: new Date(Date.now() - 60_000),
    periodEnd: new Date(Date.now() + 86_400_000)
  };

  await withModelMocks({
    '../models/Product': emptyCountModel,
    '../models/Pet': emptyCountModel,
    '../models/Service': emptyCountModel,
    '../models/User': emptyCountModel,
    '../models/Store': { find: async () => [store] },
    '../models/StoreSubscriptionPayment': { find: async () => [payment] }
  }, async () => {
    const { assertStoreEntitlement, getStoreSubscriptionSummary } = require('../services/storeSubscriptionService');
    const { ENTITLEMENTS } = require('../config/subscriptionPlans');
    const summary = await getStoreSubscriptionSummary(store);
    assert.equal(summary.tier, 'professional');
    assert.equal(summary.subscriptionSource.type, 'paid_subscription');
    assert.equal(String(summary.subscriptionSource.storeId), 'billing-store');
    await assert.doesNotReject(() => assertStoreEntitlement(store, ENTITLEMENTS.STAFF_ATTENDANCE));
    await assert.doesNotReject(() => assertStoreEntitlement(store, ENTITLEMENTS.PAYROLL));
  });
});

test('the newest current paid plan is authoritative over legacy grants and expired payments are ignored', async () => {
  const legacyProfessionalStore = {
    _id: 'legacy-store',
    owner: 'owner-2',
    subscriptionTier: 'professional',
    isActive: true,
    isDeleted: false,
    createdAt: new Date('2026-11-01T00:00:00.000Z')
  };
  const currentGrowthPayment = {
    store: 'legacy-store',
    targetTier: 'growth',
    status: 'paid',
    periodStart: new Date(Date.now() - 60_000),
    periodEnd: new Date(Date.now() + 86_400_000)
  };

  await withModelMocks({
    '../models/Product': emptyCountModel,
    '../models/Pet': emptyCountModel,
    '../models/Service': emptyCountModel,
    '../models/User': emptyCountModel,
    '../models/Store': { find: async () => [legacyProfessionalStore] },
    '../models/StoreSubscriptionPayment': { find: async () => [currentGrowthPayment] }
  }, async () => {
    const { assertStoreEntitlement, getStoreSubscriptionSummary } = require('../services/storeSubscriptionService');
    const { ENTITLEMENTS } = require('../config/subscriptionPlans');
    const summary = await getStoreSubscriptionSummary(legacyProfessionalStore);
    assert.equal(summary.tier, 'growth');
    await assert.doesNotReject(() => assertStoreEntitlement(legacyProfessionalStore, ENTITLEMENTS.STAFF_ATTENDANCE));
    await assert.rejects(
      () => assertStoreEntitlement(legacyProfessionalStore, ENTITLEMENTS.PAYROLL),
      error => error.code === 'SUBSCRIPTION_ENTITLEMENT_REQUIRED' && error.details.currentTier === 'growth'
    );
  });
});

test('staff inherit the authoritative plan from their assigned store business', async () => {
  const assignedStore = {
    _id: 'assigned-store', owner: 'business-owner', subscriptionTier: 'free',
    isActive: true, isDeleted: false, createdAt: new Date('2026-11-12T00:00:00.000Z')
  };
  const professionalStore = {
    _id: 'professional-store', owner: 'business-owner', subscriptionTier: 'professional',
    isActive: true, isDeleted: false, createdAt: new Date('2026-11-12T00:00:00.000Z')
  };

  await withModelMocks({
    '../models/Store': {
      findOne: async () => assignedStore,
      find: async query => {
        assert.equal(query.owner, 'business-owner');
        return [assignedStore, professionalStore];
      }
    },
    '../models/StoreSubscriptionPayment': { find: async () => [] },
    '../models/Product': emptyCountModel,
    '../models/Pet': emptyCountModel,
    '../models/Service': emptyCountModel,
    '../models/User': emptyCountModel
  }, async () => {
    const { resolveSubscriptionContext } = require('../services/storeAccessService');
    const context = await resolveSubscriptionContext({
      _id: 'staff-1', role: 'staff', staffType: 'manager', store: 'assigned-store'
    });
    assert.equal(context.operationalStore._id, 'assigned-store');
    assert.equal(context.subscriptionStoreId, 'professional-store');
    assert.equal(context.tier, 'professional');
  });
});

test('subscription middleware keeps operational data scope separate from the plan source', async () => {
  let assertion = null;
  await withModelMocks({
    '../services/storeSubscriptionService': {
      assertStoreEntitlement: async (store, entitlement, options) => {
        assertion = { store, entitlement, options };
      }
    },
    '../services/storeAccessService': {
      resolveOperationalStore: async () => ({ _id: 'data-store' }),
      resolveSubscriptionContext: async () => ({
        operationalStore: { _id: 'data-store' },
        tier: 'professional',
        subscriptionStoreId: 'plan-store',
        authoritativeSubscription: { tier: 'professional', sourceStoreId: 'plan-store', payment: null }
      })
    }
  }, async () => {
    const { requireSubscriptionEntitlement } = require('../middleware/subscriptionEntitlement');
    const req = { user: { _id: 'owner-3', role: 'admin' } };
    let nextCalled = false;
    await requireSubscriptionEntitlement('staff_attendance')(
      req,
      { status: () => ({ json: () => assert.fail('gate should not reject') }) },
      () => { nextCalled = true; }
    );
    assert.equal(nextCalled, true);
    assert.equal(assertion.store._id, 'data-store');
    assert.equal(assertion.options.authoritativeSubscription.tier, 'professional');
    assert.equal(req.subscriptionStoreId, 'data-store');
    assert.equal(req.subscriptionPlanStoreId, 'plan-store');
    assert.equal(req.subscriptionTier, 'professional');
  });
});
