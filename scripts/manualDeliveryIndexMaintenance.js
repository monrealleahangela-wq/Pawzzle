const mongoose = require('mongoose');
const dns = require('node:dns');
const net = require('node:net');

const INDEX_NAME = 'manual_delivery_store_idempotency_unique';
const INDEX_KEYS = { store: 1, 'manualDelivery.idempotencyKey': 1 };
const PARTIAL_FILTER = {
  sourceType: 'manual',
  'manualDelivery.idempotencyKey': { $type: 'string' }
};

const sameDocument = (left, right) => JSON.stringify(left) === JSON.stringify(right);

// Windows can resolve Atlas through nslookup while Node's c-ares resolver still
// targets an unavailable local DNS endpoint. This override is intentionally
// scoped to this one maintenance process and never changes application startup.
const configureMaintenanceDns = () => {
  const configured = process.env.MONGODB_MAINTENANCE_DNS_SERVERS || '1.1.1.1,8.8.8.8';
  const servers = configured.split(',').map(value => value.trim()).filter(Boolean);
  if (!servers.length || servers.some(server => net.isIP(server) === 0)) {
    throw new Error('MONGODB_MAINTENANCE_DNS_SERVERS must contain comma-separated DNS server IP addresses.');
  }
  dns.setServers(servers);
  dns.setDefaultResultOrder('ipv4first');
  return [...dns.getServers()];
};

const safeErrorMessage = error => String(error?.message || error || 'Unknown error')
  .replace(/mongodb(?:\+srv)?:\/\/[^@\s]+@/gi, 'mongodb://<credentials>@');

const inspectManualDeliveryIndex = async collection => {
  const [indexes, duplicateGroups] = await Promise.all([
    collection.indexes(),
    collection.aggregate([
      { $match: PARTIAL_FILTER },
      { $group: { _id: { store: '$store', idempotencyKey: '$manualDelivery.idempotencyKey' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: 'conflicts' }
    ]).toArray()
  ]);
  const named = indexes.find(index => index.name === INDEX_NAME);
  const exact = Boolean(named
    && named.unique === true
    && sameDocument(named.key, INDEX_KEYS)
    && sameDocument(named.partialFilterExpression, PARTIAL_FILTER));
  return {
    indexPresent: Boolean(named),
    indexExact: exact,
    conflictingGroups: duplicateGroups[0]?.conflicts || 0,
    namedIndex: named ? {
      name: named.name,
      key: named.key,
      unique: named.unique === true,
      partialFilterExpression: named.partialFilterExpression
    } : null
  };
};

const run = async () => {
  const uri = process.env.MONGODB_URI;
  const expectedDatabase = process.env.MANUAL_DELIVERY_INDEX_DATABASE;
  const apply = process.argv.includes('--apply');
  if (!uri) throw new Error('MONGODB_URI is required through the operator environment.');
  if (!expectedDatabase) throw new Error('MANUAL_DELIVERY_INDEX_DATABASE must name the verified target database.');

  configureMaintenanceDns();
  await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
  try {
    const actualDatabase = mongoose.connection.name;
    if (actualDatabase !== expectedDatabase) {
      throw new Error(`Connected database does not match the operator-confirmed target (${expectedDatabase}).`);
    }
    const collection = mongoose.connection.db.collection('deliveries');
    const result = await inspectManualDeliveryIndex(collection);
    console.log(JSON.stringify({ database: actualDatabase, collection: 'deliveries', ...result }, null, 2));

    if (!apply) return;
    if (process.env.APPROVE_MANUAL_DELIVERY_INDEX_CREATE !== 'CREATE') {
      throw new Error('Index creation requires APPROVE_MANUAL_DELIVERY_INDEX_CREATE=CREATE.');
    }
    if (result.conflictingGroups) throw new Error('Index creation refused because duplicate key groups exist.');
    if (result.indexPresent && !result.indexExact) throw new Error('Index creation refused because the named index has a different definition.');
    if (!result.indexPresent) {
      await collection.createIndex(INDEX_KEYS, {
        name: INDEX_NAME,
        unique: true,
        partialFilterExpression: PARTIAL_FILTER
      });
    }
    const verified = await inspectManualDeliveryIndex(collection);
    if (!verified.indexExact) throw new Error('Post-create verification did not find the exact required index.');
    console.log(JSON.stringify({ indexCreatedOrAlreadyExact: true, index: verified.namedIndex }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  run().catch(error => {
    console.error(`Manual delivery index maintenance failed: ${safeErrorMessage(error)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  INDEX_NAME,
  INDEX_KEYS,
  PARTIAL_FILTER,
  configureMaintenanceDns,
  safeErrorMessage,
  inspectManualDeliveryIndex
};
