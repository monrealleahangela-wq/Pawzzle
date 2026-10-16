const mongoose = require('mongoose');
const dns = require('node:dns');
const net = require('node:net');

const PRODUCT_INDEX = {
  name: 'review_product_order_item_unique',
  key: { user: 1, targetType: 1, orderId: 1, orderItemId: 1 },
  options: {
    unique: true,
    partialFilterExpression: {
      targetType: 'Product',
      orderId: { $type: 'objectId' },
      orderItemId: { $type: 'objectId' }
    }
  }
};
const NON_PRODUCT_INDEX = {
  name: 'review_non_product_user_target_unique',
  key: { user: 1, targetId: 1, targetType: 1 },
  options: {
    unique: true,
    partialFilterExpression: {
      targetType: { $in: ['Store', 'Pet', 'Service', 'PetProfile'] }
    }
  }
};
const LEGACY_LOOKUP_INDEX = {
  name: 'review_product_legacy_lookup',
  key: { user: 1, orderId: 1, targetId: 1 },
  options: {
    partialFilterExpression: {
      targetType: 'Product',
      orderId: { $type: 'objectId' }
    }
  }
};
const OBSOLETE_INDEXES = [
  { key: { user: 1, targetId: 1, targetType: 1 }, unique: true, partialFilterExpression: undefined },
  { key: { user: 1, orderId: 1 }, unique: true, partialFilterExpression: { orderId: { $type: 'objectId' } } }
];

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
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
const safeError = error => String(error?.message || error || 'Unknown error')
  .replace(/mongodb(?:\+srv)?:\/\/[^@\s]+@/gi, 'mongodb://<credentials>@');

const isExact = (actual, expected) => Boolean(actual
  && same(actual.key, expected.key)
  && Boolean(actual.unique) === Boolean(expected.options.unique)
  && same(actual.partialFilterExpression, expected.options.partialFilterExpression));

const inspect = async collection => {
  const [indexes, productDuplicates, nonProductDuplicates, legacy] = await Promise.all([
    collection.indexes(),
    collection.aggregate([
      { $match: PRODUCT_INDEX.options.partialFilterExpression },
      { $group: { _id: { user: '$user', orderId: '$orderId', orderItemId: '$orderItemId' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: 'groups' }
    ]).toArray(),
    collection.aggregate([
      { $match: NON_PRODUCT_INDEX.options.partialFilterExpression },
      { $group: { _id: { user: '$user', targetId: '$targetId', targetType: '$targetType' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: 'groups' }
    ]).toArray(),
    collection.aggregate([
      { $match: { targetType: 'Product' } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          mapped: { $sum: { $cond: [{ $and: [{ $eq: [{ $type: '$orderId' }, 'objectId'] }, { $eq: [{ $type: '$orderItemId' }, 'objectId'] }] }, 1, 0] } },
          exactOrderLegacy: { $sum: { $cond: [{ $and: [{ $eq: [{ $type: '$orderId' }, 'objectId'] }, { $ne: [{ $type: '$orderItemId' }, 'objectId'] }] }, 1, 0] } },
          unbound: { $sum: { $cond: [{ $ne: [{ $type: '$orderId' }, 'objectId'] }, 1, 0] } }
        }
      }
    ]).toArray()
  ]);

  const expected = [PRODUCT_INDEX, NON_PRODUCT_INDEX, LEGACY_LOOKUP_INDEX].map(definition => {
    const actual = indexes.find(index => index.name === definition.name);
    return { name: definition.name, present: Boolean(actual), exact: isExact(actual, definition) };
  });
  const obsolete = indexes.filter(index => OBSOLETE_INDEXES.some(definition => (
    same(index.key, definition.key)
    && Boolean(index.unique) === definition.unique
    && same(index.partialFilterExpression, definition.partialFilterExpression)
  ))).map(index => index.name);

  return {
    expected,
    productDuplicateGroups: productDuplicates[0]?.groups || 0,
    nonProductDuplicateGroups: nonProductDuplicates[0]?.groups || 0,
    legacyProductReviews: legacy[0] || { total: 0, mapped: 0, exactOrderLegacy: 0, unbound: 0 },
    obsoleteIndexes: obsolete
  };
};

const run = async () => {
  const uri = process.env.MONGODB_URI;
  const expectedDatabase = process.env.PRODUCT_REVIEW_INDEX_DATABASE;
  const apply = process.argv.includes('--apply');
  if (!uri) throw new Error('MONGODB_URI is required through the operator environment.');
  if (!expectedDatabase) throw new Error('PRODUCT_REVIEW_INDEX_DATABASE must name the verified target database.');

  configureMaintenanceDns();
  await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
  try {
    if (mongoose.connection.name !== expectedDatabase) {
      throw new Error(`Connected database does not match the operator-confirmed target (${expectedDatabase}).`);
    }
    const collection = mongoose.connection.db.collection('reviews');
    const preflight = await inspect(collection);
    console.log(JSON.stringify({ database: mongoose.connection.name, collection: 'reviews', ...preflight }, null, 2));
    if (!apply) return;
    if (process.env.APPROVE_PRODUCT_REVIEW_INDEX_MIGRATION !== 'MIGRATE') {
      throw new Error('Migration requires APPROVE_PRODUCT_REVIEW_INDEX_MIGRATION=MIGRATE.');
    }
    if (preflight.productDuplicateGroups || preflight.nonProductDuplicateGroups) {
      throw new Error('Migration refused because duplicate groups conflict with replacement indexes.');
    }
    if (preflight.expected.some(index => index.present && !index.exact)) {
      throw new Error('Migration refused because a named replacement index has a different definition.');
    }

    for (const definition of [PRODUCT_INDEX, NON_PRODUCT_INDEX, LEGACY_LOOKUP_INDEX]) {
      if (!preflight.expected.find(index => index.name === definition.name)?.present) {
        await collection.createIndex(definition.key, { name: definition.name, ...definition.options });
      }
    }
    const replacements = await inspect(collection);
    if (replacements.expected.some(index => !index.exact)) {
      throw new Error('Replacement index verification failed; obsolete indexes were not changed.');
    }
    for (const indexName of replacements.obsoleteIndexes) await collection.dropIndex(indexName);
    const verified = await inspect(collection);
    if (verified.expected.some(index => !index.exact) || verified.obsoleteIndexes.length) {
      throw new Error('Post-migration index verification failed.');
    }
    console.log(JSON.stringify({ migrationVerified: true, expected: verified.expected }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  run().catch(error => {
    console.error(`Product review index maintenance failed: ${safeError(error)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  PRODUCT_INDEX,
  NON_PRODUCT_INDEX,
  LEGACY_LOOKUP_INDEX,
  OBSOLETE_INDEXES,
  inspect,
  isExact,
  configureMaintenanceDns,
  safeError
};
