const { migrateSupplierProductLivePetIndex } = require('../scripts/migrateSupplierProductLivePetIndex');

const requiredProductIndexes = [
  { key: { itemType: 1 } },
  { key: { pet: 1 } },
  { key: { supplier: 1, sku: 1 }, unique: true },
  { key: { category: 1 } },
  { key: { supplier: 1, isActive: 1 } }
];
const requiredPartnershipIndexes = [
  { key: { store: 1, supplier: 1 }, unique: true },
  { key: { supplier: 1, status: 1 } },
  { key: { status: 1, 'versions.terms.effectiveUntil': 1 } }
];

const migrationRequired = detail => {
  const error = new Error(`Supplier index migration is required: ${detail}.`);
  error.code = 'SUPPLIER_INDEX_MIGRATION_REQUIRED';
  return error;
};

const matchesRequiredIndex = (actual, expected) => {
  const actualKey = Object.entries(actual.key || {});
  const expectedKey = Object.entries(expected.key);
  return actualKey.length === expectedKey.length
    && actualKey.every(([field, direction], index) =>
      field === expectedKey[index][0] && direction === expectedKey[index][1])
    && Boolean(actual.unique) === Boolean(expected.unique)
    && actual.sparse !== true && !actual.partialFilterExpression
    && !actual.collation && actual.hidden !== true;
};

const requireIndexes = (actual, required, collectionName) => {
  for (const expected of required) {
    if (!actual.some(index => matchesRequiredIndex(index, expected))) {
      throw migrationRequired(`${collectionName} index ${Object.keys(expected.key).join('_')} is missing or incompatible`);
    }
  }
};

// Read-only startup gate. Schema-level production autoIndex/autoCreate are off
// for both models, so no Supplier index or collection is created before this check.
const assertSupplierIndexesReady = async db => {
  const products = db.collection('supplierproducts');
  const state = await migrateSupplierProductLivePetIndex(products);
  if (state.legacyPresent || !state.replacementPresent) {
    throw migrationRequired('the legacy SupplierProduct index must be replaced');
  }
  requireIndexes(await products.indexes(), requiredProductIndexes, 'SupplierProduct');
  requireIndexes(await db.collection('supplierpartnerships').indexes(),
    requiredPartnershipIndexes, 'SupplierPartnership');
  return { supplierProductReady: true, supplierPartnershipReady: true };
};

module.exports = { assertSupplierIndexesReady };
