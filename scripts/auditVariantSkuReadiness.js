/*
 * Read-only SKU namespace/index readiness report for Product Variants.
 *
 * This script never creates indexes or claims. Operators must provide a URI
 * explicitly and acknowledge read-only mode. Any future backfill must be a
 * separately reviewed migration using the collision-free `missingClaims`
 * plan emitted here.
 */
const mongoose = require('mongoose');
const { getSupplierVariantReadiness } = require('../services/supplierVariantReadinessService');

const run = async () => {
  const uri = process.env.MONGODB_VARIANT_READINESS_AUDIT_URI;
  if (!uri) throw new Error('MONGODB_VARIANT_READINESS_AUDIT_URI is required.');
  if (process.env.VARIANT_READINESS_AUDIT_CONFIRM !== 'READ_ONLY') {
    throw new Error('Set VARIANT_READINESS_AUDIT_CONFIRM=READ_ONLY to confirm that this command performs no writes.');
  }
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
  try {
    const report = await getSupplierVariantReadiness({ auditWhenDisabled: true });
    console.log(JSON.stringify({
      database: mongoose.connection.name,
      generatedAt: new Date().toISOString(),
      mode: 'read-only',
      ...report
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  run().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { run };
