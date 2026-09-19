const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DecisionSupportService = require('../services/decisionSupportService');
const {
  evaluateInventoryAlert,
  shouldNotifyInventoryTransition,
  MINIMUM_DEMAND_OBSERVATIONS
} = require('../services/dssAlertService');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const id = value => ({ _id: value, toString: () => value });
const daysAgo = (now, days) => new Date(now.getTime() - days * 86400000);

test('seller demand classification is deterministic and requires sufficient evidence', () => {
  assert.equal(DecisionSupportService.classifyDemandTrend({ current: 1, previous: 0, observations: 1 }).classification, 'insufficient_data');
  assert.equal(DecisionSupportService.classifyDemandTrend({ current: 12, previous: 8, observations: 8 }).classification, 'increasing');
  assert.equal(DecisionSupportService.classifyDemandTrend({ current: 9, previous: 10, observations: 10 }).classification, 'stable');
  assert.equal(DecisionSupportService.classifyDemandTrend({ current: 6, previous: 10, observations: 10 }).classification, 'declining');
});

test('seller demand overview separates products, unique pet listings, and service capacity', () => {
  const now = new Date('2026-09-19T00:00:00.000Z');
  const product = { _id: 'product-1', name: 'Food', category: 'food', stockQuantity: 4, minStockThreshold: 5 };
  const petSold = { _id: 'pet-1', name: 'Buddy', species: 'dog', status: 'sold', isAvailable: false };
  const petAvailable = { _id: 'pet-2', name: 'Milo', species: 'dog', status: 'available', isAvailable: true };
  const service = { _id: 'service-1', name: 'Grooming', category: 'grooming', bookingRules: { maxDailyBookings: 1 } };
  const orders = [];
  for (let index = 0; index < 8; index += 1) {
    const current = index < 6;
    orders.push({
      createdAt: daysAgo(now, current ? index + 1 : 35 + index),
      paymentStatus: 'paid',
      status: 'delivered',
      items: [
        { itemType: 'product', itemId: id('product-1'), name: 'Food', quantity: current ? 2 : 1 },
        { itemType: 'pet', itemId: id('pet-1'), name: 'Buddy', quantity: 1 }
      ]
    });
  }
  const bookings = Array.from({ length: 8 }, (_, index) => ({
    service: id('service-1'),
    createdAt: daysAgo(now, index < 6 ? index + 1 : 35 + index),
    bookingDate: daysAgo(now, index < 6 ? index + 1 : 35 + index),
    status: 'completed'
  }));
  const result = DecisionSupportService.sellerDemandOverview({
    orders,
    bookings,
    products: [product],
    pets: [petSold, petAvailable],
    services: [service],
    inventories: [{ product: id('product-1'), quantity: 4, reorderLevel: 5, maxStock: 20 }],
    now
  });
  assert.equal(result.products.trends[0].classification, 'increasing');
  assert.equal(result.products.trends[0].inventory.onHand, 4);
  assert.equal(result.pets.trends[0].evidenceType, 'completed paid pet purchases');
  assert.equal(result.pets.trends[0].availableListings, 1);
  assert.equal(result.pets.trends[0].inventory, undefined, 'pets must not be represented as product stock');
  assert.equal(result.services.trends[0].classification, 'increasing');
  assert.equal(result.services.recurringPattern.status, 'insufficient_data');
  assert.match(result.products.forecastingNote, /existing per-product model selection/);
  assert.match(result.pets.evidenceNotice, /Views, favorites, and inquiries are not claimed/);
  assert.match(result.privacyNotice, /do not expose individual customer identities/);
});

test('cancelled and unpaid activity does not become demand evidence', () => {
  const now = new Date('2026-09-19T00:00:00.000Z');
  const result = DecisionSupportService.sellerDemandOverview({
    orders: [
      { createdAt: daysAgo(now, 1), paymentStatus: 'pending', status: 'pending_payment', items: [{ itemType: 'product', itemId: id('p'), name: 'P', quantity: 50 }] },
      { createdAt: daysAgo(now, 2), paymentStatus: 'paid', status: 'cancelled', items: [{ itemType: 'product', itemId: id('p'), name: 'P', quantity: 50 }] }
    ],
    products: [{ _id: 'p', name: 'P' }],
    now
  });
  assert.equal(result.products.trends.length, 0);
});

test('operational low-stock severity uses configured thresholds and supported projection evidence', () => {
  assert.deepEqual(evaluateInventoryAlert({ quantity: 4, reorderLevel: 5 }), {
    active: true,
    severity: 'low_stock',
    onHand: 4,
    threshold: 5,
    dailyUsage: 0,
    projectedDaysRemaining: null,
    projectionSupported: false
  });
  assert.equal(evaluateInventoryAlert({ quantity: 0, reorderLevel: 5 }).severity, 'critical_stock');
  assert.equal(evaluateInventoryAlert({ quantity: 12, reorderLevel: 5, unitsLast30: 60, observations: MINIMUM_DEMAND_OBSERVATIONS }).severity, 'projected_stockout');
  assert.equal(evaluateInventoryAlert({ quantity: 12, reorderLevel: 5, unitsLast30: 60, observations: 1 }).active, false, 'limited history must not create a projected stockout');
});

test('inventory alerts notify only on entry or severity escalation and can recur after resolution', () => {
  const low = { active: true, severity: 'low_stock' };
  const critical = { active: true, severity: 'critical_stock' };
  assert.equal(shouldNotifyInventoryTransition({}, low), true);
  assert.equal(shouldNotifyInventoryTransition(low, low), false);
  assert.equal(shouldNotifyInventoryTransition(low, critical), true);
  assert.equal(shouldNotifyInventoryTransition(critical, low), false, 'remaining low after a severity reduction must not spam recipients');
  assert.equal(shouldNotifyInventoryTransition({ active: false, severity: null }, low), true);
  assert.equal(shouldNotifyInventoryTransition(low, { active: false, severity: null }), false);
});

test('existing seller DSS, notifications, procurement handoff, and store scope are reused', () => {
  const controller = read('controllers/dssController.js');
  const alerts = read('services/dssAlertService.js');
  const routes = read('routes/dss.js');
  const dashboard = read('client/src/pages/admin/DSS.js');
  assert.match(controller, /DecisionSupportService\.sellerDemandOverview/);
  assert.match(controller, /Inventory\.find\(\{ store: storeId/);
  assert.match(controller, /store\.owner\.toString\(\) !== req\.user\._id\.toString\(\)/);
  assert.match(controller, /\{ store: null, addedBy: store\.owner \}/);
  assert.doesNotMatch(controller, /Booking\.find\(\{\s*\$or:/);
  assert.doesNotMatch(controller, /userInfo\.firstName/);
  assert.match(controller, /customerDemandSummary/);
  assert.match(routes, /router\.get\('\/admin', authenticate, adminOnly, getAdminInsights\)/);
  assert.match(alerts, /type: 'low_stock'/);
  assert.match(alerts, /\['manager', 'inventory_staff', 'procurement_officer'\]/);
  assert.match(alerts, /targetUrl: '\/admin\/inventory'/);
  assert.doesNotMatch(alerts, /PurchaseOrder\.create/);
  assert.match(dashboard, /Demand Overview/);
  assert.match(dashboard, /Actionable Recommendations/);
});
