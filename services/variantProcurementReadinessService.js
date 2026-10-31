const mongoose = require('mongoose');
const SupplierVariantMapping = require('../models/SupplierVariantMapping');
const { getSupplierVariantReadiness } = require('./supplierVariantReadinessService');
const { getVariantInventoryReadiness } = require('./variantInventoryReadinessService');

const REQUIRED_INDEXES = Object.freeze({
  SupplierVariantMapping: [{
    name: 'store_seller_supplier_variant_mapping_unique',
    key: { store: 1, sellerVariant: 1, supplierVariant: 1 },
    unique: true
  }]
});

const flagEnabled = name => String(process.env[name] || '').toLowerCase() === 'true';

const sameDocument = (left, right) => JSON.stringify(left || {}) === JSON.stringify(right || {});

const getVariantProcurementReadiness = async () => {
  const reasons = [];
  const requested = flagEnabled('SUPPLIER_VARIANT_PROCUREMENT_ENABLED');
  if (!requested) reasons.push('SUPPLIER_VARIANT_PROCUREMENT_ENABLED is not true.');

  const phase1 = await getSupplierVariantReadiness();
  if (!phase1.enabled) reasons.push('Phase 1A supplier variant readiness is not satisfied.');

  let mappingIndexesReady = false;
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    reasons.push('MongoDB is not connected.');
  } else {
    try {
      const indexes = await SupplierVariantMapping.collection.indexes();
      const present = new Map(indexes.map(index => [index.name, index]));
      mappingIndexesReady = REQUIRED_INDEXES.SupplierVariantMapping.every(required => {
        const actual = present.get(required.name);
        return actual && Boolean(actual.unique) === required.unique && sameDocument(actual.key, required.key);
      });
      if (!mappingIndexesReady) reasons.push('Supplier variant mapping indexes are missing or incompatible.');
    } catch (error) {
      reasons.push(`Variant procurement index inspection failed: ${error.message}`);
    }
  }

  const mappingWritesRequested = flagEnabled('SUPPLIER_VARIANT_MAPPING_ENABLED');
  const mappingWritesEnabled = mappingWritesRequested && phase1.enabled && mappingIndexesReady;
  const concurrencyVerified = flagEnabled('SUPPLIER_VARIANT_PROCUREMENT_CONCURRENCY_VERIFIED');
  const inventoryReadiness = await getVariantInventoryReadiness();
  const sellerVariantInventoryReady = inventoryReadiness.enabled;
  const receivingRequested = flagEnabled('SUPPLIER_VARIANT_RECEIVING_ENABLED');
  if (!mappingWritesRequested) reasons.push('SUPPLIER_VARIANT_MAPPING_ENABLED is not true.');
  if (!concurrencyVerified) reasons.push('Variant procurement concurrency verification has not been recorded.');
  if (!sellerVariantInventoryReady) reasons.push('Variant-aware seller inventory readiness is not satisfied.');
  if (!receivingRequested) reasons.push('SUPPLIER_VARIANT_RECEIVING_ENABLED is not true.');

  return {
    enabled: requested && mappingWritesEnabled && concurrencyVerified && sellerVariantInventoryReady,
    requested,
    phase1,
    mappingIndexesReady,
    mappingWritesRequested,
    mappingWritesEnabled,
    concurrencyVerified,
    sellerVariantInventoryReady,
    inventoryReadiness,
    receivingRequested,
    receivingStockApplicationEnabled: requested && mappingWritesEnabled && concurrencyVerified
      && sellerVariantInventoryReady && receivingRequested,
    reasons
  };
};

const assertVariantMappingWritesEnabled = async () => {
  const readiness = await getVariantProcurementReadiness();
  if (!readiness.mappingWritesEnabled) {
    const error = new Error('Variant mapping writes are not active until Phase 1A readiness and mapping indexes are verified.');
    error.statusCode = 503;
    error.code = 'VARIANT_MAPPING_NOT_READY';
    error.readiness = readiness;
    throw error;
  }
  return readiness;
};

const assertVariantProcurementEnabled = async () => {
  const readiness = await getVariantProcurementReadiness();
  if (!readiness.enabled) {
    const error = new Error('Variant procurement is not active until its indexes, transactional SKU protections, and safety checks are verified.');
    error.statusCode = 503;
    error.code = 'VARIANT_PROCUREMENT_NOT_READY';
    error.readiness = readiness;
    throw error;
  }
  return readiness;
};

const assertVariantReceivingStockApplicationEnabled = async () => {
  const readiness = await getVariantProcurementReadiness();
  if (!readiness.receivingStockApplicationEnabled) {
    const error = new Error('Variant receiving is disabled until variant inventory indexes, migration readiness, mappings, and concurrency checks are verified.');
    error.statusCode = 503;
    error.code = 'VARIANT_INVENTORY_DESTINATION_NOT_READY';
    error.readiness = readiness;
    throw error;
  }
  return readiness;
};

module.exports = {
  REQUIRED_INDEXES,
  assertVariantMappingWritesEnabled,
  assertVariantProcurementEnabled,
  assertVariantReceivingStockApplicationEnabled,
  getVariantProcurementReadiness
};
