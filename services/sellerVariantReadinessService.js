const mongoose = require('mongoose');
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const SkuClaim = require('../models/SkuClaim');
const { makeActiveKey } = require('./skuClaimService');
const { normalizeVariantSku } = require('../utils/variantIdentity');

const flagEnabled = name => String(process.env[name] || '').toLowerCase() === 'true';
const sameKey = (left, right) => JSON.stringify(left || {}) === JSON.stringify(right || {});

const buildSellerSkuCoverageReport = async () => {
  const [parents, variants, claims] = await Promise.all([
    Product.find({ isDeleted: { $ne: true } }).select('_id store sku').lean(),
    ProductVariant.find({}).select('+store +normalizedSku product').lean(),
    SkuClaim.find({ namespaceType: 'store', isActive: true }).select('+activeKey owner normalizedSku entityType entity').lean()
  ]);
  const claimByKey = new Map(claims.map(claim => [claim.activeKey, claim]));
  const seen = new Map();
  const collisions = [];
  const missingClaims = [];
  const invalidLegacySkus = [];
  const inspect = ({ owner, sku, entityType, entity }) => {
    if (!owner || !sku) return;
    let normalizedSku;
    try { normalizedSku = normalizeVariantSku(sku); } catch (error) {
      invalidLegacySkus.push({ entityType, entity: String(entity), sku, reason: error.message });
      return;
    }
    const key = makeActiveKey({ namespaceType: 'store', owner, normalizedSku });
    const prior = seen.get(key);
    if (prior && String(prior.entity) !== String(entity)) collisions.push({ key, entities: [prior, { entityType, entity: String(entity) }] });
    else seen.set(key, { entityType, entity: String(entity) });
    const claim = claimByKey.get(key);
    if (!claim || claim.entityType !== entityType || String(claim.entity) !== String(entity)) {
      missingClaims.push({ key, entityType, entity: String(entity) });
    }
  };
  parents.forEach(parent => inspect({ owner: parent.store, sku: parent.sku, entityType: 'product', entity: parent._id }));
  variants.forEach(variant => inspect({ owner: variant.store, sku: variant.normalizedSku, entityType: 'product_variant', entity: variant._id }));
  return {
    parentCount: parents.length,
    variantCount: variants.length,
    activeClaimCount: claims.length,
    collisions,
    missingClaims,
    invalidLegacySkus,
    ready: collisions.length === 0 && missingClaims.length === 0 && invalidLegacySkus.length === 0
  };
};

const getSellerVariantReadiness = async () => {
  const reasons = [];
  const requested = flagEnabled('SELLER_VARIANTS_ENABLED');
  const concurrencyVerified = flagEnabled('SELLER_VARIANTS_CONCURRENCY_VERIFIED');
  const authorizationVerified = flagEnabled('SELLER_VARIANTS_AUTHORIZATION_VERIFIED');
  if (!requested) reasons.push('SELLER_VARIANTS_ENABLED is not true.');
  if (!concurrencyVerified) reasons.push('Seller variant concurrency verification has not been recorded.');
  if (!authorizationVerified) reasons.push('Seller variant authorization verification has not been recorded.');
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return { enabled: false, requested, concurrencyVerified, authorizationVerified, coverage: null, reasons: [...reasons, 'MongoDB is not connected.'] };
  }
  let coverage = null;
  try {
    coverage = await buildSellerSkuCoverageReport();
    if (!coverage.ready) reasons.push('The seller SKU claim registry is not fully backfilled or contains collisions.');
    const [variantIndexes, claimIndexes] = await Promise.all([
      ProductVariant.collection.indexes(),
      SkuClaim.collection.indexes()
    ]);
    if (!variantIndexes.some(index => index.name === 'product_variant_combination_unique' && index.unique
      && sameKey(index.key, { product: 1, combinationKey: 1 }))) {
      reasons.push('ProductVariant combination uniqueness index is missing.');
    }
    if (!variantIndexes.some(index => index.name === 'store_product_variant_sku_unique' && index.unique
      && sameKey(index.key, { store: 1, normalizedSku: 1 }))) {
      reasons.push('ProductVariant Store SKU uniqueness index is missing.');
    }
    if (!claimIndexes.some(index => index.name === 'sku_claim_active_namespace_unique' && index.unique)) {
      reasons.push('SKU claim uniqueness index is missing.');
    }
  } catch (error) {
    reasons.push(`Seller variant readiness inspection failed: ${error.message}`);
  }
  return {
    enabled: requested && concurrencyVerified && authorizationVerified && reasons.length === 0,
    requested,
    concurrencyVerified,
    authorizationVerified,
    coverage,
    reasons
  };
};

const assertSellerVariantWritesEnabled = async () => {
  const readiness = await getSellerVariantReadiness();
  if (!readiness.enabled) {
    const error = new Error('Seller variant management is disabled until SKU claims and physical indexes are verified.');
    error.statusCode = 503;
    error.code = 'SELLER_VARIANTS_NOT_READY';
    error.readiness = readiness;
    throw error;
  }
  return readiness;
};

module.exports = { assertSellerVariantWritesEnabled, buildSellerSkuCoverageReport, getSellerVariantReadiness };
