const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const InventoryLot = require('../models/InventoryLot');
const InventoryTransaction = require('../models/InventoryTransaction');
const ProductVariant = require('../models/ProductVariant');
const SkuClaim = require('../models/SkuClaim');
const { getSellerVariantReadiness } = require('./sellerVariantReadinessService');

const REQUIRED_INDEXES = Object.freeze({
  Inventory: [
    { name: 'inventory_balance_identity_unique', key: { store: 1, product: 1, productVariant: 1 }, unique: true }
  ],
  InventoryLot: [
    { name: 'inventory_lot_identity_unique', key: { store: 1, product: 1, productVariant: 1, lotNumber: 1 }, unique: true }
  ],
  InventoryTransaction: [
    { name: 'idempotencyKey_1', key: { idempotencyKey: 1 }, unique: true }
  ],
  ProductVariant: [
    { name: 'product_variant_combination_unique', key: { product: 1, combinationKey: 1 }, unique: true },
    { name: 'store_product_variant_sku_unique', key: { store: 1, normalizedSku: 1 }, unique: true }
  ],
  SkuClaim: [
    { name: 'sku_claim_active_namespace_unique', key: { activeKey: 1 }, unique: true }
  ]
});

const LEGACY_CONFLICTING_INDEX_NAMES = Object.freeze([
  'store_1_product_1',
  'inventory_simple_balance_unique',
  'inventory_variant_balance_unique',
  'inventory_lot_simple_unique',
  'inventory_lot_variant_unique'
]);
const flagEnabled = name => String(process.env[name] || '').toLowerCase() === 'true';
const sameKey = (left, right) => JSON.stringify(left || {}) === JSON.stringify(right || {});

const inspectIndexes = async (Model, requirements) => {
  const indexes = await Model.collection.indexes();
  const byName = new Map(indexes.map(index => [index.name, index]));
  return requirements.map(required => {
    const actual = byName.get(required.name);
    return {
      ...required,
      ready: Boolean(actual && Boolean(actual.unique) === required.unique && sameKey(actual.key, required.key)
        && (!required.partialFilterExpression || sameKey(actual.partialFilterExpression, required.partialFilterExpression))),
      actual: actual || null
    };
  });
};

const dryRunVariantInventoryMigration = async () => {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return { connected: false, safe: false, collisions: [], legacyIndexes: [], reasons: ['MongoDB is not connected.'] };
  }
  const [balanceDuplicates, simpleBalanceDuplicates, lotDuplicates, simpleLotDuplicates,
    invalidBalanceIdentities, invalidLotIdentities, inventoryIndexes, lotIndexes] = await Promise.all([
    Inventory.aggregate([
      { $match: { productVariant: { $type: 'objectId' } } },
      { $group: { _id: { store: '$store', product: '$product', productVariant: '$productVariant' }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } }
    ]),
    Inventory.aggregate([
      { $match: { productVariant: { $exists: false } } },
      { $group: { _id: { store: '$store', product: '$product' }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } }
    ]),
    InventoryLot.aggregate([
      { $match: { productVariant: { $type: 'objectId' } } },
      { $group: { _id: { store: '$store', product: '$product', productVariant: '$productVariant', lotNumber: '$lotNumber' }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } }
    ]),
    InventoryLot.aggregate([
      { $match: { productVariant: { $exists: false } } },
      { $group: { _id: { store: '$store', product: '$product', lotNumber: '$lotNumber' }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } }
    ]),
    Inventory.aggregate([
      { $match: { productVariant: { $exists: true } } },
      { $match: { $expr: { $ne: [{ $type: '$productVariant' }, 'objectId'] } } },
      { $project: { _id: 1, store: 1, product: 1, productVariant: 1 } }
    ]),
    InventoryLot.aggregate([
      { $match: { productVariant: { $exists: true } } },
      { $match: { $expr: { $ne: [{ $type: '$productVariant' }, 'objectId'] } } },
      { $project: { _id: 1, store: 1, product: 1, productVariant: 1, lotNumber: 1 } }
    ]),
    Inventory.collection.indexes(),
    InventoryLot.collection.indexes()
  ]);
  const legacyIndexes = [
    ...inventoryIndexes.map(index => ({ collection: 'Inventory', ...index })),
    ...lotIndexes.map(index => ({ collection: 'InventoryLot', ...index }))
  ].filter(index => LEGACY_CONFLICTING_INDEX_NAMES.includes(index.name));
  const collisions = [
    ...balanceDuplicates.map(row => ({ type: 'balance', ...row })),
    ...simpleBalanceDuplicates.map(row => ({ type: 'simple_balance', ...row })),
    ...lotDuplicates.map(row => ({ type: 'lot', ...row })),
    ...simpleLotDuplicates.map(row => ({ type: 'simple_lot', ...row }))
  ];
  const invalidIdentities = [
    ...invalidBalanceIdentities.map(row => ({ type: 'balance_variant_identity', ...row })),
    ...invalidLotIdentities.map(row => ({ type: 'lot_variant_identity', ...row }))
  ];
  const reasons = [];
  if (collisions.length) reasons.push('Duplicate variant balances or lots must be resolved before index migration.');
  if (invalidIdentities.length) reasons.push('Inventory rows with null or invalid productVariant identities must be resolved before index migration.');
  if (legacyIndexes.length) reasons.push('The legacy store/product unique index must be replaced in a controlled migration.');
  return { connected: true, safe: collisions.length === 0 && invalidIdentities.length === 0, collisions, invalidIdentities, legacyIndexes, reasons };
};

const getVariantInventoryReadiness = async () => {
  const reasons = [];
  const requested = flagEnabled('SELLER_VARIANT_INVENTORY_ENABLED');
  const concurrencyVerified = flagEnabled('SELLER_VARIANT_INVENTORY_CONCURRENCY_VERIFIED');
  if (!requested) reasons.push('SELLER_VARIANT_INVENTORY_ENABLED is not true.');
  if (!concurrencyVerified) reasons.push('Variant inventory concurrency verification has not been recorded.');
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    reasons.push('MongoDB is not connected.');
    return { enabled: false, requested, concurrencyVerified, indexesReady: false, migrationReady: false, checks: {}, reasons };
  }

  const models = { Inventory, InventoryLot, InventoryTransaction, ProductVariant, SkuClaim };
  const checks = {};
  try {
    for (const [name, requirements] of Object.entries(REQUIRED_INDEXES)) {
      checks[name] = await inspectIndexes(models[name], requirements);
    }
  } catch (error) {
    reasons.push(`Variant inventory index inspection failed: ${error.message}`);
  }
  const indexesReady = Object.values(checks).length === Object.keys(REQUIRED_INDEXES).length
    && Object.values(checks).every(rows => rows.every(row => row.ready));
  if (!indexesReady) reasons.push('Required variant inventory indexes are missing or incompatible.');

  const sellerVariantReadiness = await getSellerVariantReadiness();
  if (!sellerVariantReadiness.enabled) reasons.push('Phase 1A seller variant readiness is not enabled.');

  const migration = await dryRunVariantInventoryMigration();
  const migrationReady = migration.connected && migration.safe && migration.legacyIndexes.length === 0;
  if (!migrationReady) reasons.push(...migration.reasons);
  return {
    enabled: requested && concurrencyVerified && sellerVariantReadiness.enabled && indexesReady && migrationReady && reasons.length === 0,
    requested,
    concurrencyVerified,
    indexesReady,
    migrationReady,
    checks,
    sellerVariantReadiness,
    migration,
    reasons: [...new Set(reasons)]
  };
};

const assertVariantInventoryEnabled = async () => {
  const readiness = await getVariantInventoryReadiness();
  if (!readiness.enabled) {
    const error = new Error('Variant inventory is disabled until its physical indexes, migration dry run, and concurrency checks are verified.');
    error.statusCode = 503;
    error.code = 'VARIANT_INVENTORY_NOT_READY';
    error.readiness = readiness;
    throw error;
  }
  return readiness;
};

module.exports = {
  LEGACY_CONFLICTING_INDEX_NAMES,
  REQUIRED_INDEXES,
  assertVariantInventoryEnabled,
  dryRunVariantInventoryMigration,
  getVariantInventoryReadiness,
  inspectIndexes
};
