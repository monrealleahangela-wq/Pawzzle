/*
 * Manual, idempotent index maintenance. Do not run automatically at startup.
 * The legacy sparse compound index includes every offer because supplier is
 * always present, even when pet is absent. It blocks a second ordinary offer.
 */
const mongoose = require('mongoose');

const oldName = 'supplier_1_pet_1';
const newName = 'supplier_live_pet_unique';
const newOptions = {
  name: newName, unique: true,
  partialFilterExpression: { pet: { $type: 'objectId' } }
};
const isLegacyIndex = index => index?.name === oldName
  && index.key?.supplier === 1 && index.key?.pet === 1
  && Object.keys(index.key).length === 2
  && index.unique === true && index.sparse === true
  && !index.partialFilterExpression && !index.collation && index.hidden !== true;
const isReplacementIndex = index => index?.name === newName
  && index.key?.supplier === 1 && index.key?.pet === 1
  && Object.keys(index.key).length === 2
  && index.unique === true && index.sparse !== true
  && Object.keys(index.partialFilterExpression || {}).length === 1
  && Object.keys(index.partialFilterExpression?.pet || {}).length === 1
  && index.partialFilterExpression.pet.$type === 'objectId'
  && !index.collation && index.hidden !== true;

const migrateSupplierProductLivePetIndex = async (collection, { apply = false } = {}) => {
  const indexes = await collection.indexes();
  const legacy = indexes.find(index => index.name === oldName);
  if (legacy && !isLegacyIndex(legacy)) throw new Error('Unexpected legacy index shape; manual review required.');
  const next = indexes.find(index => index.name === newName);
  if (next && !isReplacementIndex(next)) {
    throw new Error('Unexpected replacement index shape; manual review required.');
  }
  if (!apply) return { legacyPresent: Boolean(legacy), replacementPresent: Boolean(next), changed: false };
  if (!next) await collection.createIndex({ supplier: 1, pet: 1 }, newOptions);
  if (legacy) await collection.dropIndex(oldName);
  return { legacyPresent: Boolean(legacy), replacementPresent: true, changed: Boolean(legacy || !next) };
};

if (require.main === module) {
  (async () => {
    if (process.argv.includes('--apply') && process.env.SUPPLIER_INDEX_MIGRATION_APPROVED !== 'yes') {
      throw new Error('Apply requires explicit SUPPLIER_INDEX_MIGRATION_APPROVED=yes.');
    }
    const uri = process.env.SUPPLIER_INDEX_MIGRATION_URI;
    if (!uri) throw new Error('An explicit SUPPLIER_INDEX_MIGRATION_URI is required; the application URI is never used implicitly.');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    try {
      const outcome = await migrateSupplierProductLivePetIndex(
        mongoose.connection.db.collection('supplierproducts'), { apply: process.argv.includes('--apply') }
      );
      console.log(JSON.stringify(outcome));
    } finally { await mongoose.disconnect(); }
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { migrateSupplierProductLivePetIndex };
