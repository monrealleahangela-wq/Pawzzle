const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  ACTIVE_STORE_FILTER,
  pendingUpgradeFilter,
  promoteActiveStoresToProfessional
} = require('../scripts/promoteActiveStoresToProfessional');

const createCollection = () => {
  let applied = false;
  const calls = [];
  return {
    calls,
    async countDocuments(filter) {
      calls.push({ operation: 'countDocuments', filter });
      if (filter.$or) return applied ? 0 : 3;
      if (filter.subscriptionTier === 'professional') return applied ? 4 : 1;
      return 4;
    },
    async updateMany(filter, update) {
      calls.push({ operation: 'updateMany', filter, update });
      applied = true;
      return { matchedCount: 3, modifiedCount: 3 };
    }
  };
};

test('active store upgrade targets only verified, operational stores', () => {
  assert.deepEqual(ACTIVE_STORE_FILTER, {
    isActive: true,
    isDeleted: { $ne: true },
    verificationStatus: 'verified'
  });
  assert.deepEqual(pendingUpgradeFilter().$or, [
    { subscriptionTier: { $ne: 'professional' } },
    { subscriptionExpires: { $exists: true, $ne: null } }
  ]);
});

test('dry-run reports stores without changing subscriptions', async () => {
  const collection = createCollection();
  const outcome = await promoteActiveStoresToProfessional(collection);
  assert.equal(outcome.mode, 'dry-run');
  assert.equal(outcome.before.activeStores, 4);
  assert.equal(outcome.before.pendingStores, 3);
  assert.equal(collection.calls.some(call => call.operation === 'updateMany'), false);
});

test('apply grants permanent Professional access and is verifiably complete', async () => {
  const collection = createCollection();
  const outcome = await promoteActiveStoresToProfessional(collection, { apply: true });
  const updateCall = collection.calls.find(call => call.operation === 'updateMany');

  assert.equal(outcome.upgradedStores, 3);
  assert.equal(outcome.after.ready, true);
  assert.deepEqual(updateCall.filter, pendingUpgradeFilter());
  assert.deepEqual(updateCall.update, {
    $set: { subscriptionTier: 'professional' },
    $unset: { subscriptionExpires: '' }
  });
});

test('package command is available without changing normal server startup', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts.start, 'node server.js');
  assert.equal(
    packageJson.scripts['promote:active-stores:professional'],
    'node scripts/promoteActiveStoresToProfessional.js'
  );
});
