const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('seller plan catalog uses the approved allowances, prices, annual discount, and trial', () => {
  const { SUBSCRIPTION_PLANS, ENTITLEMENTS, normalizeSubscriptionTier } = require('../config/subscriptionPlans');
  assert.equal(SUBSCRIPTION_PLANS.free.listingLimit, 10);
  assert.equal(SUBSCRIPTION_PLANS.starter.listingLimit, 30);
  assert.equal(SUBSCRIPTION_PLANS.growth.listingLimit, 70);
  assert.equal(SUBSCRIPTION_PLANS.professional.listingLimit, null);
  assert.equal(SUBSCRIPTION_PLANS.starter.termDays, 30);
  assert.equal(SUBSCRIPTION_PLANS.growth.locationLimit, 1);
  assert.equal(SUBSCRIPTION_PLANS.professional.locationLimit, 3);
  assert.equal(SUBSCRIPTION_PLANS.starter.monthlyPrice, 299);
  assert.equal(SUBSCRIPTION_PLANS.growth.monthlyPrice, 699);
  assert.equal(SUBSCRIPTION_PLANS.professional.monthlyPrice, 1499);
  assert.equal(SUBSCRIPTION_PLANS.starter.annualPrice, 3049);
  assert.equal(SUBSCRIPTION_PLANS.growth.annualPrice, 7129);
  assert.equal(SUBSCRIPTION_PLANS.professional.annualPrice, 15289);
  assert.equal(SUBSCRIPTION_PLANS.growth.trialDays, 14);
  assert.ok(SUBSCRIPTION_PLANS.free.entitlements.includes(ENTITLEMENTS.SUPPLIER_CATALOG));
  assert.ok(SUBSCRIPTION_PLANS.free.entitlements.includes(ENTITLEMENTS.MANUAL_RESTOCKING));
  assert.ok(SUBSCRIPTION_PLANS.growth.entitlements.includes(ENTITLEMENTS.PRODUCT_VARIANTS));
  assert.ok(SUBSCRIPTION_PLANS.professional.entitlements.includes(ENTITLEMENTS.CONSOLIDATED_INVENTORY));
  assert.equal(normalizeSubscriptionTier('basic'), 'free');
  assert.equal(normalizeSubscriptionTier('premium'), 'growth');
  assert.equal(normalizeSubscriptionTier('enterprise'), 'professional');
});

test('effective plan honors prepaid transitions and expires them safely', () => {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (/^\.\.\/models\/(Product|Pet|Service|Store|User)$/.test(request)) return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('../services/storeSubscriptionService')];
    const { getEffectiveTier } = require('../services/storeSubscriptionService');
    const now = Date.now();
    assert.equal(getEffectiveTier({
      subscriptionTier: 'professional', subscriptionExpires: new Date(now - 1000),
      pendingSubscription: { tier: 'starter', effectiveAt: new Date(now - 500), expiresAt: new Date(now + 10000) }
    }), 'starter');
    assert.equal(getEffectiveTier({
      subscriptionTier: 'professional', subscriptionExpires: new Date(now - 1000),
      pendingSubscription: { tier: 'starter', effectiveAt: new Date(now - 5000), expiresAt: new Date(now - 500) }
    }), 'free');
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve('../services/storeSubscriptionService')];
  }
});

test('active legacy stores retain Professional access regardless of stale verification metadata unless they opt out', () => {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (/^\.\.\/models\/(Product|Pet|Service|Store|User)$/.test(request)) return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('../services/storeSubscriptionService')];
    const { getEffectiveTier, LEGACY_PROFESSIONAL_GRANT_CUTOFF } = require('../services/storeSubscriptionService');
    const beforeCutoff = new Date(LEGACY_PROFESSIONAL_GRANT_CUTOFF.getTime() - 1000);
    const afterCutoff = new Date(LEGACY_PROFESSIONAL_GRANT_CUTOFF.getTime() + 1000);
    const legacy = {
      subscriptionTier: 'free', createdAt: beforeCutoff,
      isActive: true, isDeleted: false, verificationStatus: 'verified'
    };

    assert.equal(getEffectiveTier(legacy), 'professional');
    assert.equal(getEffectiveTier({ ...legacy, verificationStatus: 'pending' }), 'professional');
    assert.equal(getEffectiveTier({ ...legacy, verificationStatus: undefined }), 'professional');
    assert.equal(getEffectiveTier({
      ...legacy,
      subscriptionTier: 'professional',
      subscriptionExpires: new Date(Date.now() - 1000)
    }), 'professional');
    assert.equal(getEffectiveTier({
      ...legacy,
      subscriptionTier: 'professional',
      pendingSubscription: {
        tier: 'starter',
        effectiveAt: new Date(Date.now() - 5000),
        expiresAt: new Date(Date.now() - 1000)
      }
    }), 'professional');
    assert.equal(getEffectiveTier({ ...legacy, createdAt: afterCutoff }), 'free');
    assert.equal(getEffectiveTier({ ...legacy, isActive: false }), 'free');
    assert.equal(getEffectiveTier({ ...legacy, subscriptionLegacyGrantOptOutAt: new Date() }), 'free');
    assert.equal(getEffectiveTier({
      ...legacy,
      subscriptionTier: 'professional',
      subscriptionExpires: new Date(Date.now() - 1000),
      subscriptionLegacyGrantOptOutAt: new Date()
    }), 'free');
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve('../services/storeSubscriptionService')];
  }
});

test('supplier management loads independent resources without blanking verified suppliers', () => {
  const page = read('client/src/pages/admin/PurchaseOrders.js');
  assert.match(page, /Promise\.allSettled/);
  assert.match(page, /setSuppliers\(suppliersResult\.value\.data\.suppliers \|\| \[\]\)/);
  assert.match(page, /supplierLoadError/);
  assert.doesNotMatch(page, /const \[ordRes, supRes, prodRes, cartRes\] = await Promise\.all/);
});

test('canonical owner store prefers an active verified Professional store over a stale Free reference', () => {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === '../models/Store') return {};
    if (request === './storeSubscriptionService') return { getEffectiveTier: store => store.subscriptionTier || 'free' };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('../services/storeAccessService')];
    const { selectCanonicalOwnedStore } = require('../services/storeAccessService');
    const selected = selectCanonicalOwnedStore([
      { _id: 'stale-free-store', isActive: true, verificationStatus: 'verified', subscriptionTier: 'free' },
      { _id: 'owned-professional-store', isActive: true, verificationStatus: 'verified', subscriptionTier: 'professional' }
    ], 'stale-free-store');
    assert.equal(selected._id, 'owned-professional-store');
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve('../services/storeAccessService')];
  }
});

test('paid plan remains authoritative when a legacy Free row has newer verification metadata', () => {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === '../models/Store') return {};
    if (request === './storeSubscriptionService') return { getEffectiveTier: store => store.subscriptionTier || 'free' };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('../services/storeAccessService')];
    const { selectCanonicalOwnedStore } = require('../services/storeAccessService');
    const selected = selectCanonicalOwnedStore([
      { _id: 'legacy-free-store', isActive: true, verificationStatus: 'verified', subscriptionTier: 'free' },
      { _id: 'paid-store', isActive: true, verificationStatus: 'pending', subscriptionTier: 'professional' }
    ], 'legacy-free-store');
    assert.equal(selected._id, 'paid-store');
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve('../services/storeAccessService')];
  }
});

test('store admin resolution includes the assigned paid store when legacy ownership is inconsistent', async () => {
  const originalLoad = Module._load;
  const ownedFreeStore = {
    _id: 'owned-free-store',
    owner: 'owner-user',
    isActive: true,
    verificationStatus: 'verified',
    subscriptionTier: 'free'
  };
  const assignedProfessionalStore = {
    _id: 'assigned-professional-store',
    owner: 'legacy-owner-reference',
    isActive: true,
    verificationStatus: 'verified',
    subscriptionTier: 'professional'
  };
  Module._load = function load(request, parent, isMain) {
    if (request === '../models/Store') return {
      find: async query => {
        assert.equal(query.owner, 'owner-user');
        return [ownedFreeStore];
      },
      findOne: async query => {
        assert.equal(query._id, 'assigned-professional-store');
        return assignedProfessionalStore;
      }
    };
    if (request === './storeSubscriptionService') return { getEffectiveTier: store => store.subscriptionTier || 'free' };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('../services/storeAccessService')];
    const { resolveOperationalStore } = require('../services/storeAccessService');
    const selected = await resolveOperationalStore({
      _id: 'owner-user',
      role: 'admin',
      store: 'assigned-professional-store'
    });
    assert.equal(selected._id, 'assigned-professional-store');
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve('../services/storeAccessService')];
  }
});

test('subscription gates use the shared operational store resolver', async () => {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === '../services/storeSubscriptionService') return { assertStoreEntitlement: async () => {} };
    if (request === '../services/storeAccessService') return {
      resolveOperationalStore: async user => ({ _id: user.role === 'staff' ? 'assigned-store' : 'owned-professional-store' })
    };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('../middleware/subscriptionEntitlement')];
    const { resolveStoreId } = require('../middleware/subscriptionEntitlement');
    const staffStore = await resolveStoreId({
      user: { _id: 'staff-user', role: 'staff', staffType: 'manager', store: 'assigned-store' }
    });
    const ownerStore = await resolveStoreId({
      user: { _id: 'owner-user', role: 'admin', store: 'stale-free-store' }
    });
    assert.equal(staffStore, 'assigned-store');
    assert.equal(ownerStore, 'owned-professional-store');
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve('../middleware/subscriptionEntitlement')];
  }
});

test('dashboard consumes the same subscription-resolved store used by the entitlement gate', () => {
  const controller = read('controllers/storeController.js');
  assert.match(controller, /if \(req\.subscriptionStoreId\) \{\s*store = await Store\.findById\(req\.subscriptionStoreId\)/);
  assert.match(controller, /const getMyStoreSubscription[\s\S]*?const store = await resolveOperationalStore\(req\.user\)/);
  assert.match(read('controllers/supplierController.js'), /const resolveAuthorizedStore = resolveOperationalStore/);
});

test('explicit Free plan choices opt out of the legacy Professional compatibility grant', () => {
  assert.match(read('controllers/subscriptionController.js'), /subscriptionLegacyGrantOptOutAt = now/);
  assert.match(read('controllers/storeController.js'), /subscriptionLegacyGrantOptOutAt: new Date\(\)/);
  assert.match(read('models/Store.js'), /subscriptionLegacyGrantOptOutAt: Date/);
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

test('expired legacy Professional metadata still satisfies the supplier catalog entitlement', async () => {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    const model = request.match(/^\.\.\/models\/(Product|Pet|Service|Store|User)$/)?.[1];
    if (model === 'Store') return { findById: () => ({ select: async () => null }) };
    if (model) return { countDocuments: async () => 0 };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('../services/storeSubscriptionService')];
    const { assertStoreEntitlement, LEGACY_PROFESSIONAL_GRANT_CUTOFF } = require('../services/storeSubscriptionService');
    const { ENTITLEMENTS } = require('../config/subscriptionPlans');
    const summary = await assertStoreEntitlement({
      _id: 'defense-store',
      subscriptionTier: 'professional',
      subscriptionExpires: new Date(Date.now() - 1000),
      createdAt: new Date(LEGACY_PROFESSIONAL_GRANT_CUTOFF.getTime() - 1000),
      isActive: true,
      isDeleted: false
    }, ENTITLEMENTS.SUPPLIER_CATALOG);
    assert.equal(summary.tier, 'professional');
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
  assert.match(component, /PayMongo confirmation/);
  assert.match(component, /Monthly/);
  assert.match(component, /Annual/);
  assert.match(component, /14-day Growth trial/);
  assert.match(component, /no marketplace platform fee/i);
  assert.match(settings, /\['plan', 'Subscription'\]/);
  assert.match(settings, /<SubscriptionPlanSettings/);
});

test('paid plan checkout is server-authoritative and webhook reconciled', () => {
  const controller = read('controllers/subscriptionController.js');
  const reconciliation = read('services/paymentReconciliationService.js');
  const routes = read('routes/stores.js');
  assert.match(controller, /SUBSCRIPTION_PLANS\[requestedTier\]/);
  assert.match(controller, /getPlanPrice\(requestedTier, billingInterval\)/);
  assert.match(controller, /amountCentavos: Math\.round\(authoritativePrice \* 100\)/);
  assert.match(controller, /record_type: 'subscription'/);
  assert.match(controller, /StoreSubscriptionPayment\.init\(\)/);
  assert.match(reconciliation, /finalizeSubscriptionPayment/);
  assert.match(routes, /my-store\/subscription\/checkout/);
  assert.match(routes, /storeOwnerOnly, createSubscriptionCheckout/);
});

test('core supplier operations stay available while advanced plan features remain enforced', () => {
  const suppliers = read('routes/suppliers.js');
  const purchasing = read('routes/purchaseOrders.js');
  const inventory = read('routes/inventory.js');
  const staff = read('routes/staff.js');
  const hr = read('routes/hr.js');
  const stores = read('routes/stores.js');
  assert.match(suppliers, /requirePermission\('suppliers\.manage', 'procurement\.manage'\), getSupplierCatalog/);
  assert.doesNotMatch(suppliers, /supplierCatalogPlan/);
  assert.match(purchasing, /requirePermission\('procurement\.manage'\), getProcurementCart/);
  assert.match(purchasing, /requirePermission\('procurement\.manage'\), submitProcurementCart/);
  assert.doesNotMatch(purchasing, /restockingPlan/);
  assert.match(purchasing, /supplierComparisonPlan, getComparableSupplierOffers/);
  assert.match(purchasing, /receivingPlan, confirmDelivery/);
  assert.match(inventory, /lossApprovalPlan/);
  assert.match(staff, /schedulingPlan, updateStaffAvailability/);
  assert.match(hr, /ENTITLEMENTS\.PAYROLL/);
  assert.match(hr, /ENTITLEMENTS\.COMPENSATION/);
  assert.match(stores, /requirePermission\('dashboard\.view'\), getStoreDashboard/);
  assert.doesNotMatch(stores, /performanceSummaryPlan/);
  assert.match(stores, /consolidated-inventory\/:inventoryId\/location/);
});

test('new marketplace transactions charge no platform fee', () => {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (/^\.\.\/models\/(Store|Order|Booking)$/.test(request)) return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('../services/revenueService')];
    const RevenueService = require('../services/revenueService');
    const totals = RevenueService.totalsFor({ totalAmount: 1000, pricingBreakdown: { vatAmount: 107.14 } }, 'order');
    assert.equal(totals.platformFee, 0);
    assert.equal(totals.netAmount, 1000);
    assert.equal(totals.recognizedRevenue, 892.86);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve('../services/revenueService')];
  }
});

test('store order details no longer display a ten-percent commission deduction', () => {
  const orderDetail = read('client/src/pages/customer/OrderDetail.js');
  assert.doesNotMatch(orderDetail, /lineTotal\s*\*\s*0\.9/);
  assert.match(orderDetail, /Store earnings/);
});
