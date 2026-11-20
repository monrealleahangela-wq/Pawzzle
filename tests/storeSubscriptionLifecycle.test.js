const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const lifecyclePath = require.resolve('../services/storeSubscriptionLifecycleService');

const loadLifecycle = ({ priorPaid = false, activePaidTerm = null, onNotify = () => {} } = {}) => {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === '../models/Store') return { findOneAndUpdate: async () => ({}), find: async () => [] };
    if (request === '../models/StoreSubscriptionPayment') return {
      exists: async () => priorPaid,
      findOne: () => ({ sort: async () => activePaidTerm })
    };
    if (request === '../models/User') return { findById: () => ({ select: () => ({ lean: async () => null }) }) };
    if (request === '../models/ActivityLog') return { create: async () => ({}) };
    if (request === '../controllers/notificationController') return { createNotification: async data => { onNotify(data); return {}; } };
    if (request === '../utils/emailService') return { deliverHtmlEmail: async () => ({}), wrapInTemplate: (_title, body) => body };
    if (request === './storeSubscriptionService') return { isLegacyProfessionalStore: () => false };
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[lifecyclePath];
  const lifecycle = require(lifecyclePath);
  Module._load = originalLoad;
  return lifecycle;
};

test('approved sellers receive a 30-day Growth trial exactly once', async () => {
  const lifecycle = loadLifecycle();
  const now = new Date('2026-11-21T00:00:00.000Z');
  const store = {
    _id: 'store-1', owner: 'owner-1', isActive: true, isDeleted: false,
    verificationStatus: 'verified', subscriptionTier: 'free',
    async save() { this.saved = true; }
  };
  await lifecycle.activateGrowthTrialIfEligible(store, now);
  assert.equal(store.subscriptionTier, 'growth');
  assert.equal(store.subscriptionBillingInterval, 'trial');
  assert.equal(store.subscriptionAccessStatus, 'trial');
  assert.equal(store.subscriptionExpires.getTime(), now.getTime() + (30 * lifecycle.DAY_MS));
  assert.equal(store.saved, true);
});

test('an expired unpaid trial suspends seller access and places the store on subscription vacation', async () => {
  const lifecycle = loadLifecycle();
  const now = new Date('2026-12-22T00:00:00.000Z');
  const store = {
    _id: 'store-2', owner: 'owner-2', isActive: true, isDeleted: false,
    verificationStatus: 'verified', subscriptionTier: 'growth',
    subscriptionBillingInterval: 'trial', subscriptionTrialUsedAt: new Date('2026-11-21T00:00:00.000Z'),
    subscriptionExpires: new Date('2026-12-21T00:00:00.000Z'),
    async save() { this.saved = true; }
  };
  await lifecycle.reconcileStoreSubscriptionLifecycle(store, { now, sendNotifications: false });
  assert.equal(store.subscriptionAccessStatus, 'suspended');
  assert.equal(store.vacationMode.isActive, true);
  assert.equal(store.vacationMode.source, 'subscription');
  assert.equal(store.saved, true);
});

test('a legacy Free fallback cannot keep seller access after the trial has already been used', async () => {
  const lifecycle = loadLifecycle();
  const now = new Date('2026-12-22T00:00:00.000Z');
  const store = {
    _id: 'store-free-fallback', owner: 'owner-free-fallback', isActive: true, isDeleted: false,
    verificationStatus: 'verified', subscriptionTier: 'free',
    subscriptionTrialUsedAt: new Date('2026-11-01T00:00:00.000Z'),
    async save() { this.saved = true; }
  };
  await lifecycle.reconcileStoreSubscriptionLifecycle(store, { now, sendNotifications: false });
  assert.equal(store.subscriptionAccessStatus, 'suspended');
  assert.equal(store.vacationMode.isActive, true);
  assert.equal(store.saved, true);
});

test('a confirmed paid term restores a suspended store and ends subscription vacation', async () => {
  const now = new Date('2026-12-22T00:00:00.000Z');
  const lifecycle = loadLifecycle({ activePaidTerm: {
    targetTier: 'starter', billingInterval: 'monthly', periodEnd: new Date('2027-01-21T00:00:00.000Z')
  } });
  const store = {
    _id: 'store-3', owner: 'owner-3', isActive: true, isDeleted: false,
    verificationStatus: 'verified', subscriptionTier: 'growth', subscriptionBillingInterval: 'trial',
    subscriptionTrialUsedAt: new Date('2026-11-21T00:00:00.000Z'),
    subscriptionExpires: new Date('2026-12-21T00:00:00.000Z'), subscriptionAccessStatus: 'suspended',
    vacationMode: { isActive: true, source: 'subscription', startedAt: new Date('2026-12-21T00:00:00.000Z') },
    async save() { this.saved = true; }
  };
  await lifecycle.reconcileStoreSubscriptionLifecycle(store, { now, sendNotifications: false });
  assert.equal(store.subscriptionTier, 'starter');
  assert.equal(store.subscriptionAccessStatus, 'active');
  assert.equal(store.vacationMode.isActive, false);
  assert.equal(store.saved, true);
});

test('the scheduled sweep still sends the suspension notice if a request already applied the suspension', async () => {
  const notifications = [];
  const lifecycle = loadLifecycle({ onNotify: notice => notifications.push(notice) });
  const now = new Date('2026-12-22T00:00:00.000Z');
  const store = {
    _id: 'store-4', owner: 'owner-4', isActive: true, isDeleted: false,
    verificationStatus: 'verified', subscriptionTier: 'growth', subscriptionBillingInterval: 'trial',
    subscriptionTrialUsedAt: new Date('2026-11-21T00:00:00.000Z'),
    subscriptionExpires: new Date('2026-12-21T00:00:00.000Z'), subscriptionAccessStatus: 'suspended',
    vacationMode: { isActive: true, source: 'subscription' },
    async save() { this.saved = true; }
  };
  await lifecycle.reconcileStoreSubscriptionLifecycle(store, { now });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].recipient, 'owner-4');
  assert.match(notifications[0].title, /temporarily suspended/i);
});

test('customer visibility excludes subscription-suspended and vacation stores', () => {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === '../models/User') return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[require.resolve('../utils/storeVisibility')];
  const visibility = require('../utils/storeVisibility');
  Module._load = originalLoad;
  const filter = visibility.buildCustomerVisibleStoreFilter(['owner-1']);
  assert.deepEqual(filter.subscriptionAccessStatus, { $ne: 'suspended' });
  assert.deepEqual(filter['vacationMode.isActive'], { $ne: true });
  const owner = { _id: 'owner-1', role: 'admin', isActive: true, isDeleted: false };
  const baseStore = { _id: 'store', owner: 'owner-1', isActive: true, isDeleted: false, verificationStatus: 'verified' };
  assert.equal(visibility.isCustomerVisibleStoreRecord({ ...baseStore, subscriptionAccessStatus: 'suspended' }, owner), false);
  assert.equal(visibility.isCustomerVisibleStoreRecord({ ...baseStore, vacationMode: { isActive: true } }, owner), false);
});
