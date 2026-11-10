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

test('proposal entitlements are enforced on their real server routes', () => {
  const suppliers = read('routes/suppliers.js');
  const purchasing = read('routes/purchaseOrders.js');
  const inventory = read('routes/inventory.js');
  const staff = read('routes/staff.js');
  const hr = read('routes/hr.js');
  const stores = read('routes/stores.js');
  assert.match(suppliers, /supplierCatalogPlan, getSupplierCatalog/);
  assert.match(purchasing, /supplierComparisonPlan, getComparableSupplierOffers/);
  assert.match(purchasing, /receivingPlan, confirmDelivery/);
  assert.match(inventory, /lossApprovalPlan/);
  assert.match(staff, /schedulingPlan, updateStaffAvailability/);
  assert.match(hr, /ENTITLEMENTS\.PAYROLL/);
  assert.match(hr, /ENTITLEMENTS\.COMPENSATION/);
  assert.match(stores, /performanceSummaryPlan, getStoreDashboard/);
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
