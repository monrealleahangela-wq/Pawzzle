const mongoose = require('mongoose');
const { dryRunVariantInventoryMigration, getVariantInventoryReadiness } = require('../services/variantInventoryReadinessService');

const uri = process.env.MONGODB_TRANSACTION_TEST_URI;
if (!uri) {
  console.error('MONGODB_TRANSACTION_TEST_URI is required. Production and staging URIs are intentionally ignored.');
  process.exitCode = 2;
} else {
  (async () => {
    try {
      const parsed = new URL(uri);
      if (parsed.protocol !== 'mongodb:' || parsed.hostname !== '127.0.0.1'
          || parsed.port !== '27018' || parsed.searchParams.get('replicaSet') !== 'pawzzleTestRS') {
        throw new Error('Readiness tooling accepts only the approved local pawzzleTestRS replica set at 127.0.0.1:27018.');
      }
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      const [migration, readiness] = await Promise.all([
        dryRunVariantInventoryMigration(),
        getVariantInventoryReadiness()
      ]);
      console.log(JSON.stringify({ migration, readiness }, null, 2));
      if (!migration.safe || !readiness.indexesReady) process.exitCode = 1;
    } finally {
      await mongoose.disconnect();
    }
  })().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
