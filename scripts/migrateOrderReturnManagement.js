/*
 * Guarded index/backfill maintenance for the return-management release.
 * Read-only by default. Applying requires --apply and
 * ORDER_RETURN_MIGRATION_APPROVED=yes with an explicit URI/database name.
 */
const crypto = require('node:crypto');
const mongoose = require('mongoose');

const indexDefinitions = [
  ['orderreturns', { caseId: 1 }, { name: 'caseId_1', unique: true }],
  ['orderreturns', { 'refund.idempotencyKey': 1 }, { name: 'order_return_refund_idempotency_unique', unique: true, sparse: true }],
  ['deliveries', { returnCase: 1, missionType: 1 }, {
    name: 'return_case_mission_unique', unique: true,
    partialFilterExpression: { returnCase: { $type: 'objectId' }, missionType: { $in: ['return_pickup', 'replacement'] } }
  }]
];

const caseId = () => `RET-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

const inspect = async db => {
  const returns = db.collection('orderreturns');
  const missingCaseIds = await returns.countDocuments({ $or: [{ caseId: { $exists: false } }, { caseId: null }, { caseId: '' }] });
  const duplicateCaseIds = await returns.aggregate([
    { $match: { caseId: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$caseId', count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $count: 'count' }
  ]).toArray();
  const indexes = {};
  for (const [collection, , options] of indexDefinitions) {
    indexes[`${collection}.${options.name}`] = Boolean((await db.collection(collection).indexes()).find(index => index.name === options.name));
  }
  return { missingCaseIds, duplicateCaseIds: Number(duplicateCaseIds[0]?.count || 0), indexes };
};

const migrate = async (db, { apply = false } = {}) => {
  const before = await inspect(db);
  if (!apply) return { before, changed: false };
  if (before.duplicateCaseIds) throw new Error('Duplicate return Case IDs require manual review before migration.');
  const returns = db.collection('orderreturns');
  const missing = await returns.find({ $or: [{ caseId: { $exists: false } }, { caseId: null }, { caseId: '' }] }, { projection: { _id: 1 } }).toArray();
  for (const row of missing) await returns.updateOne({ _id: row._id }, { $set: { caseId: caseId() } });
  for (const [collection, keys, options] of indexDefinitions) await db.collection(collection).createIndex(keys, options);
  return { before, after: await inspect(db), changed: missing.length > 0 || Object.values(before.indexes).some(value => !value) };
};

if (require.main === module) {
  (async () => {
    const apply = process.argv.includes('--apply');
    if (apply && process.env.ORDER_RETURN_MIGRATION_APPROVED !== 'yes') throw new Error('Apply requires ORDER_RETURN_MIGRATION_APPROVED=yes.');
    const uri = process.env.ORDER_RETURN_MIGRATION_URI;
    const expected = process.env.ORDER_RETURN_MIGRATION_EXPECTED_DB;
    if (!uri || !expected) throw new Error('Explicit ORDER_RETURN_MIGRATION_URI and ORDER_RETURN_MIGRATION_EXPECTED_DB are required.');
    await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
    try {
      if (mongoose.connection.name !== expected) throw new Error('Connected database does not match ORDER_RETURN_MIGRATION_EXPECTED_DB.');
      console.log(JSON.stringify(await migrate(mongoose.connection.db, { apply }), null, 2));
    } finally { await mongoose.disconnect(); }
  })().catch(error => { console.error(String(error?.message || error).replace(/mongodb(?:\+srv)?:\/\/[^@\s]+@/gi, 'mongodb://<credentials>@')); process.exitCode = 1; });
}

module.exports = { indexDefinitions, inspect, migrate };
