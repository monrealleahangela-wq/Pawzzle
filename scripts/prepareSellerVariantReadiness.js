/*
 * Guarded seller-variant readiness maintenance.
 *
 * The default mode is read-only. Applying requires --apply, an explicit
 * maintenance URI, the exact database name, and the approval phrase below.
 * The command only creates the ProductVariant/SkuClaim indexes and missing,
 * collision-free Store SKU claims. It never rewrites SKUs or inventory.
 */
const dns = require('node:dns');
const net = require('node:net');
const mongoose = require('mongoose');
const ProductVariant = require('../models/ProductVariant');
const SkuClaim = require('../models/SkuClaim');
const {
  REQUIRED_INDEXES,
  buildSellerSkuCoverageReport,
  indexMatches
} = require('../services/sellerVariantReadinessService');
const { claimSku } = require('../services/skuClaimService');

const APPROVAL_PHRASE = 'PREPARE_SELLER_VARIANTS';

const configureMaintenanceDns = () => {
  const configured = process.env.MONGODB_MAINTENANCE_DNS_SERVERS || '1.1.1.1,8.8.8.8';
  const servers = configured.split(',').map(value => value.trim()).filter(Boolean);
  if (!servers.length || servers.some(server => net.isIP(server) === 0)) {
    throw new Error('MONGODB_MAINTENANCE_DNS_SERVERS must contain comma-separated DNS server IP addresses.');
  }
  dns.setServers(servers);
  dns.setDefaultResultOrder('ipv4first');
};

const safeErrorMessage = error => String(error?.message || error || 'Unknown error')
  .replace(/mongodb(?:\+srv)?:\/\/[^@\s]+@/gi, 'mongodb://<credentials>@');

const modelFor = name => (name === 'SkuClaim' ? SkuClaim : ProductVariant);

const collectionIndexes = async Model => {
  const exists = await mongoose.connection.db.listCollections({ name: Model.collection.name }).hasNext();
  return exists ? Model.collection.indexes() : [];
};

const inspectRequiredIndexes = async () => {
  const status = {};
  for (const [modelName, definitions] of Object.entries(REQUIRED_INDEXES)) {
    const indexes = await collectionIndexes(modelFor(modelName));
    const byName = new Map(indexes.map(index => [index.name, index]));
    status[modelName] = definitions.map(definition => ({
      name: definition.name,
      ready: indexMatches(byName.get(definition.name), definition),
      present: byName.has(definition.name)
    }));
  }
  return status;
};

const indexesReady = status => Object.values(status).every(rows => rows.every(row => row.ready));

const assertReplicaSet = async () => {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName || !hello.isWritablePrimary) {
    throw new Error('Seller variants require a writable MongoDB replica set for transactional SKU claims.');
  }
  return hello.setName;
};

const createRequiredIndexes = async () => {
  for (const [modelName, definitions] of Object.entries(REQUIRED_INDEXES)) {
    const Model = modelFor(modelName);
    for (const definition of definitions) {
      await Model.collection.createIndex(definition.key, {
        name: definition.name,
        unique: definition.unique,
        ...(definition.partialFilterExpression
          ? { partialFilterExpression: definition.partialFilterExpression }
          : {})
      });
    }
  }
};

const backfillMissingClaims = async coverage => {
  let created = 0;
  for (const missing of coverage.missingClaims) {
    const claimCreated = await mongoose.connection.transaction(async session => {
      const existing = await SkuClaim.findOne({ activeKey: missing.key }).select('+activeKey').session(session);
      if (existing) {
        if (existing.entityType === missing.entityType && String(existing.entity) === missing.entity) return false;
        throw new Error(`SKU ${missing.normalizedSku} is already claimed by another store product.`);
      }
      await claimSku({
        namespaceType: missing.namespaceType,
        owner: missing.owner,
        sku: missing.normalizedSku,
        entityType: missing.entityType,
        entity: missing.entity,
        session
      });
      return true;
    });
    if (claimCreated) created += 1;
  }
  return created;
};

const prepareSellerVariantReadiness = async ({ apply = false } = {}) => {
  const replicaSet = await assertReplicaSet();
  const before = {
    indexes: await inspectRequiredIndexes(),
    coverage: await buildSellerSkuCoverageReport()
  };
  if (before.coverage.collisions.length || before.coverage.invalidLegacySkus.length) {
    throw new Error('Store SKU collisions or invalid legacy SKUs must be corrected before variant activation.');
  }
  if (!apply) {
    return {
      mode: 'read-only',
      replicaSet,
      ready: indexesReady(before.indexes) && before.coverage.ready,
      ...before
    };
  }

  await createRequiredIndexes();
  const claimsCreated = await backfillMissingClaims(before.coverage);
  const after = {
    indexes: await inspectRequiredIndexes(),
    coverage: await buildSellerSkuCoverageReport()
  };
  const ready = indexesReady(after.indexes) && after.coverage.ready;
  if (!ready) throw new Error('Seller variant readiness verification failed after maintenance.');
  return { mode: 'apply', replicaSet, ready, claimsCreated, before, after };
};

const run = async () => {
  const apply = process.argv.includes('--apply');
  const uri = process.env.SELLER_VARIANT_MIGRATION_URI;
  const expectedDatabase = process.env.SELLER_VARIANT_MIGRATION_EXPECTED_DB;
  if (!uri) throw new Error('SELLER_VARIANT_MIGRATION_URI is required.');
  if (!expectedDatabase) throw new Error('SELLER_VARIANT_MIGRATION_EXPECTED_DB is required.');
  if (apply && process.env.SELLER_VARIANT_MIGRATION_APPROVED !== APPROVAL_PHRASE) {
    throw new Error(`Apply requires SELLER_VARIANT_MIGRATION_APPROVED=${APPROVAL_PHRASE}.`);
  }

  configureMaintenanceDns();
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
  try {
    if (mongoose.connection.name !== expectedDatabase) {
      throw new Error('Connected database does not match SELLER_VARIANT_MIGRATION_EXPECTED_DB.');
    }
    const result = await prepareSellerVariantReadiness({ apply });
    console.log(JSON.stringify({ database: mongoose.connection.name, ...result }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  run().catch(error => {
    console.error(`Seller variant readiness failed: ${safeErrorMessage(error)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  APPROVAL_PHRASE,
  backfillMissingClaims,
  createRequiredIndexes,
  indexesReady,
  inspectRequiredIndexes,
  prepareSellerVariantReadiness,
  safeErrorMessage
};
