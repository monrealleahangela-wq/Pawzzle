/*
 * Guarded SupplierProduct index maintenance.
 *
 * Default execution is read-only. Applying the migration requires both
 * `--apply` and SUPPLIER_INDEX_MIGRATION_APPROVED=yes. The connection URI and
 * expected database name must be supplied explicitly; the application URI is
 * never loaded implicitly.
 */
const mongoose = require('mongoose');
const dns = require('node:dns');
const net = require('node:net');

// Keep the Atlas SRV workaround scoped to this maintenance process. This does
// not change the application's normal MongoDB connection or Windows settings.
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

const LEGACY_INDEX_NAME = 'supplier_1_pet_1';
const REPLACEMENT_INDEX_NAME = 'supplier_live_pet_unique';
const REPLACEMENT_KEYS = { supplier: 1, pet: 1 };
const REPLACEMENT_OPTIONS = {
  name: REPLACEMENT_INDEX_NAME,
  unique: true,
  partialFilterExpression: { pet: { $type: 'objectId' } }
};

const hasExactKeys = index => index?.key?.supplier === 1
  && index?.key?.pet === 1
  && Object.keys(index.key).length === 2;

const isLegacyIndex = index => index?.name === LEGACY_INDEX_NAME
  && hasExactKeys(index)
  && index.unique === true
  && index.sparse === true
  && !index.partialFilterExpression
  && !index.collation
  && index.hidden !== true;

const isReplacementIndex = index => index?.name === REPLACEMENT_INDEX_NAME
  && hasExactKeys(index)
  && index.unique === true
  && index.sparse !== true
  && Object.keys(index.partialFilterExpression || {}).length === 1
  && Object.keys(index.partialFilterExpression?.pet || {}).length === 1
  && index.partialFilterExpression.pet.$type === 'objectId'
  && !index.collation
  && index.hidden !== true;

const countDuplicateLivePetGroups = async collection => {
  const result = await collection.aggregate([
    { $match: { pet: { $type: 'objectId' } } },
    { $group: { _id: { supplier: '$supplier', pet: '$pet' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: 'count' }
  ]).toArray();
  return Number(result[0]?.count || 0);
};

const inspectSupplierProductLivePetIndex = async collection => {
  const indexes = await collection.indexes();
  const legacy = indexes.find(index => index.name === LEGACY_INDEX_NAME);
  const replacement = indexes.find(index => index.name === REPLACEMENT_INDEX_NAME);

  if (legacy && !isLegacyIndex(legacy)) {
    throw new Error('Unexpected legacy SupplierProduct index shape; manual review required.');
  }
  if (replacement && !isReplacementIndex(replacement)) {
    throw new Error('Unexpected replacement SupplierProduct index shape; manual review required.');
  }

  const duplicateLivePetGroups = await countDuplicateLivePetGroups(collection);
  return {
    legacyPresent: Boolean(legacy),
    replacementPresent: Boolean(replacement),
    duplicateLivePetGroups,
    ready: !legacy && Boolean(replacement) && duplicateLivePetGroups === 0
  };
};

const migrateSupplierProductLivePetIndex = async (collection, { apply = false } = {}) => {
  const before = await inspectSupplierProductLivePetIndex(collection);
  if (!apply) return { ...before, changed: false };
  if (before.duplicateLivePetGroups > 0) {
    throw new Error(`SupplierProduct live-pet duplicates block migration (${before.duplicateLivePetGroups} group(s)).`);
  }

  let changed = false;
  // Build the safe replacement before removing the legacy protection.
  if (!before.replacementPresent) {
    await collection.createIndex(REPLACEMENT_KEYS, REPLACEMENT_OPTIONS);
    changed = true;
  }
  const indexesAfterCreate = await collection.indexes();
  const replacement = indexesAfterCreate.find(index => index.name === REPLACEMENT_INDEX_NAME);
  if (!isReplacementIndex(replacement)) {
    throw new Error('Replacement SupplierProduct index was not created with the expected definition.');
  }
  if (before.legacyPresent) {
    await collection.dropIndex(LEGACY_INDEX_NAME);
    changed = true;
  }

  const after = await inspectSupplierProductLivePetIndex(collection);
  if (!after.ready) throw new Error('SupplierProduct index migration did not reach the required final state.');
  return { ...after, changed };
};

if (require.main === module) {
  (async () => {
    const apply = process.argv.includes('--apply');
    if (apply && process.env.SUPPLIER_INDEX_MIGRATION_APPROVED !== 'yes') {
      throw new Error('Apply requires explicit SUPPLIER_INDEX_MIGRATION_APPROVED=yes.');
    }
    const uri = process.env.SUPPLIER_INDEX_MIGRATION_URI;
    const expectedDatabase = process.env.SUPPLIER_INDEX_MIGRATION_EXPECTED_DB;
    if (!uri) throw new Error('An explicit SUPPLIER_INDEX_MIGRATION_URI is required.');
    if (!expectedDatabase) throw new Error('SUPPLIER_INDEX_MIGRATION_EXPECTED_DB is required.');

    configureMaintenanceDns();
    await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 5000 });
    try {
      if (mongoose.connection.name !== expectedDatabase) {
        throw new Error('Connected database does not match SUPPLIER_INDEX_MIGRATION_EXPECTED_DB.');
      }
      const outcome = await migrateSupplierProductLivePetIndex(
        mongoose.connection.db.collection('supplierproducts'), { apply }
      );
      console.log(JSON.stringify(outcome));
    } finally {
      await mongoose.disconnect();
    }
  })().catch(error => {
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
  });
}

module.exports = {
  LEGACY_INDEX_NAME,
  REPLACEMENT_INDEX_NAME,
  REPLACEMENT_KEYS,
  REPLACEMENT_OPTIONS,
  configureMaintenanceDns,
  inspectSupplierProductLivePetIndex,
  migrateSupplierProductLivePetIndex
};
