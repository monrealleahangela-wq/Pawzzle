const mongoose = require('mongoose');
const SupplierProduct = require('../models/SupplierProduct');
const SupplierProductVariant = require('../models/SupplierProductVariant');
const SkuClaim = require('../models/SkuClaim');
const { makeActiveKey } = require('./skuClaimService');
const { normalizeVariantSku } = require('../utils/variantIdentity');

const REQUIRED_INDEXES = Object.freeze({
  SupplierProductVariant: [
    { name: 'supplier_product_variant_combination_unique', key: { supplierProduct: 1, combinationKey: 1 }, unique: true },
    { name: 'supplier_product_variant_sku_unique', key: { supplier: 1, normalizedSku: 1 }, unique: true }
  ],
  SkuClaim: [{
    name: 'sku_claim_active_namespace_unique',
    key: { activeKey: 1 },
    unique: true,
    partialFilterExpression: { activeKey: { $type: 'string' }, isActive: true }
  }]
});

const featureRequested = () => String(process.env.SUPPLIER_VARIANTS_ENABLED || '').toLowerCase() === 'true';

const inspectIndexes = async Model => {
  const indexes = await Model.collection.indexes();
  return new Map(indexes.map(index => [index.name, index]));
};

const sameDocument = (left, right) => JSON.stringify(left || {}) === JSON.stringify(right || {});

const indexMatches = (actual, required) => Boolean(actual)
  && sameDocument(actual.key, required.key)
  && Boolean(actual.unique) === Boolean(required.unique)
  && (!required.partialFilterExpression
    || sameDocument(actual.partialFilterExpression, required.partialFilterExpression));

const inspectReplicaSet = async () => {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  return Boolean(hello.setName && (hello.isWritablePrimary || hello.secondary));
};

const buildCoverageReport = async () => {
  const [parents, variants, claims] = await Promise.all([
    SupplierProduct.find({ isDeleted: { $ne: true } }).select('_id supplier sku').lean(),
    SupplierProductVariant.find({}).select('+supplier +normalizedSku supplierProduct').lean(),
    SkuClaim.find({ namespaceType: 'supplier', isActive: true }).select('+activeKey owner normalizedSku entityType entity').lean()
  ]);
  const activeKeys = new Map(claims.map(claim => [claim.activeKey, claim]));
  const missingClaims = [];
  const invalidLegacySkus = [];
  const seen = new Map();
  const collisions = [];

  const inspect = ({ owner, sku, entityType, entity }) => {
    let normalizedSku;
    try {
      normalizedSku = normalizeVariantSku(sku);
    } catch (error) {
      invalidLegacySkus.push({ entityType, entity: String(entity), sku, reason: error.message });
      return;
    }
    const key = makeActiveKey({ namespaceType: 'supplier', owner, normalizedSku });
    const previous = seen.get(key);
    if (previous && String(previous.entity) !== String(entity)) {
      collisions.push({ key, entities: [previous, { entityType, entity: String(entity) }] });
    } else {
      seen.set(key, { entityType, entity: String(entity) });
    }
    const claim = activeKeys.get(key);
    if (!claim || claim.entityType !== entityType || String(claim.entity) !== String(entity)) {
      missingClaims.push({ key, entityType, entity: String(entity) });
    }
  };

  parents.forEach(parent => inspect({
    owner: parent.supplier,
    sku: parent.sku,
    entityType: 'supplier_product',
    entity: parent._id
  }));
  variants.forEach(variant => inspect({
    owner: variant.supplier,
    sku: variant.normalizedSku,
    entityType: 'supplier_product_variant',
    entity: variant._id
  }));

  return {
    parentCount: parents.length,
    variantCount: variants.length,
    activeClaimCount: claims.length,
    missingClaims,
    invalidLegacySkus,
    collisions,
    ready: missingClaims.length === 0 && invalidLegacySkus.length === 0 && collisions.length === 0
  };
};

const getSupplierVariantReadiness = async ({ auditWhenDisabled = false } = {}) => {
  const reasons = [];
  if (!featureRequested()) reasons.push('SUPPLIER_VARIANTS_ENABLED is not true.');
  if (!featureRequested() && !auditWhenDisabled) {
    return { enabled: false, requested: false, reasons };
  }
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return { enabled: false, requested: featureRequested(), reasons: [...reasons, 'MongoDB is not connected.'] };
  }

  let replicaSetReady = false;
  let indexStatus = {};
  let coverage = null;
  try {
    replicaSetReady = await inspectReplicaSet();
    if (!replicaSetReady) reasons.push('MongoDB is not a writable replica set; transactional SKU claims are unavailable.');
    for (const [modelName, definitions] of Object.entries(REQUIRED_INDEXES)) {
      const Model = modelName === 'SkuClaim' ? SkuClaim : SupplierProductVariant;
      const present = await inspectIndexes(Model);
      const missing = definitions.filter(definition => !present.has(definition.name)).map(definition => definition.name);
      const invalid = definitions.filter(definition => present.has(definition.name)
        && !indexMatches(present.get(definition.name), definition)).map(definition => definition.name);
      indexStatus[modelName] = { required: definitions.map(definition => definition.name), missing, invalid };
      if (missing.length) reasons.push(`${modelName} is missing indexes: ${missing.join(', ')}.`);
      if (invalid.length) reasons.push(`${modelName} has incompatible indexes: ${invalid.join(', ')}.`);
    }
    coverage = await buildCoverageReport();
    if (!coverage.ready) reasons.push('The supplier SKU claim registry is not fully backfilled or contains collisions.');
  } catch (error) {
    reasons.push(`Readiness inspection failed: ${error.message}`);
  }

  return {
    enabled: featureRequested() && reasons.length === 0,
    requested: featureRequested(),
    replicaSetReady,
    indexStatus,
    coverage,
    reasons
  };
};

const assertSupplierVariantWritesEnabled = async () => {
  const readiness = await getSupplierVariantReadiness();
  if (!readiness.enabled) {
    const error = new Error('Supplier variant management is not active until its database indexes, transactional SKU registry, and legacy SKU coverage are verified.');
    error.statusCode = 503;
    error.code = 'SUPPLIER_VARIANTS_NOT_READY';
    error.readiness = readiness;
    throw error;
  }
  return readiness;
};

module.exports = {
  REQUIRED_INDEXES,
  assertSupplierVariantWritesEnabled,
  buildCoverageReport,
  featureRequested,
  getSupplierVariantReadiness,
  indexMatches
};
