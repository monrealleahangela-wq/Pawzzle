/*
 * One-time Professional-plan grant for existing operational stores.
 *
 * The command is read-only unless both --apply and the explicit approval
 * environment variable are supplied. It also verifies the database name so a
 * copied command cannot silently update the wrong environment.
 */
const mongoose = require('mongoose');

const TARGET_TIER = 'professional';
const ACTIVE_STORE_FILTER = Object.freeze({
  isActive: true,
  isDeleted: { $ne: true },
  verificationStatus: 'verified'
});

const pendingUpgradeFilter = () => ({
  ...ACTIVE_STORE_FILTER,
  $or: [
    { subscriptionTier: { $ne: TARGET_TIER } },
    { subscriptionExpires: { $exists: true, $ne: null } }
  ]
});

const inspectActiveStorePlans = async collection => {
  const [activeStores, professionalStores, pendingStores] = await Promise.all([
    collection.countDocuments(ACTIVE_STORE_FILTER),
    collection.countDocuments({ ...ACTIVE_STORE_FILTER, subscriptionTier: TARGET_TIER, subscriptionExpires: null }),
    collection.countDocuments(pendingUpgradeFilter())
  ]);

  return {
    activeStores,
    professionalStores,
    pendingStores,
    ready: activeStores === professionalStores && pendingStores === 0
  };
};

const promoteActiveStoresToProfessional = async (collection, { apply = false } = {}) => {
  const before = await inspectActiveStorePlans(collection);
  if (!apply) return { mode: 'dry-run', changed: false, before, after: before };

  const result = await collection.updateMany(
    pendingUpgradeFilter(),
    {
      $set: { subscriptionTier: TARGET_TIER },
      $unset: { subscriptionExpires: '' }
    }
  );
  const after = await inspectActiveStorePlans(collection);
  if (!after.ready) throw new Error('Active-store Professional upgrade did not reach the expected final state.');

  return {
    mode: 'apply',
    changed: Number(result.modifiedCount || 0) > 0,
    matchedStores: Number(result.matchedCount || 0),
    upgradedStores: Number(result.modifiedCount || 0),
    before,
    after
  };
};

const safeErrorMessage = error => String(error?.message || error || 'Unknown error')
  .replace(/mongodb(?:\+srv)?:\/\/[^@\s]+@/gi, 'mongodb://<credentials>@');

if (require.main === module) {
  (async () => {
    const apply = process.argv.includes('--apply');
    if (apply && process.env.ACTIVE_STORE_PROFESSIONAL_UPGRADE_APPROVED !== 'yes') {
      throw new Error('Apply requires ACTIVE_STORE_PROFESSIONAL_UPGRADE_APPROVED=yes.');
    }

    const uri = process.env.ACTIVE_STORE_PROFESSIONAL_MIGRATION_URI || process.env.MONGODB_URI;
    const expectedDatabase = process.env.ACTIVE_STORE_PROFESSIONAL_EXPECTED_DB;
    if (!uri) throw new Error('MONGODB_URI or ACTIVE_STORE_PROFESSIONAL_MIGRATION_URI is required.');
    if (!expectedDatabase) throw new Error('ACTIVE_STORE_PROFESSIONAL_EXPECTED_DB is required.');

    await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
    try {
      if (mongoose.connection.name !== expectedDatabase) {
        throw new Error('Connected database does not match ACTIVE_STORE_PROFESSIONAL_EXPECTED_DB.');
      }
      const outcome = await promoteActiveStoresToProfessional(
        mongoose.connection.db.collection('stores'),
        { apply }
      );
      console.log(JSON.stringify({ database: mongoose.connection.name, ...outcome }, null, 2));
    } finally {
      await mongoose.disconnect();
    }
  })().catch(error => {
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
  });
}

module.exports = {
  TARGET_TIER,
  ACTIVE_STORE_FILTER,
  pendingUpgradeFilter,
  inspectActiveStorePlans,
  promoteActiveStoresToProfessional
};
