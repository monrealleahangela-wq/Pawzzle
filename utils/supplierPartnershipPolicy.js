const crypto = require('crypto');
const mongoose = require('mongoose');

const STATUSES = ['requested', 'pending_supplier', 'revision_requested', 'pending_seller', 'active', 'rejected', 'expired', 'terminated'];
const TEXT_FIELDS = [
  'priceUpdateConditions', 'inventoryResponsibilities', 'deliveryArrangements',
  'paymentTerms', 'returnReplacementDamagePolicy', 'cancellationDisputeProcedure',
  'terminationConditions', 'otherTerms'
];

const error = (message, statusCode = 400, code = 'PARTNERSHIP_INVALID') =>
  Object.assign(new Error(message), { statusCode, code });

const normalizeTerms = input => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw error('Agreement terms are required.');
  const ids = input.coveredSupplierProducts;
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => !mongoose.isValidObjectId(id))) {
    throw error('Choose 1–100 valid supplier products covered by this agreement.');
  }
  const coveredSupplierProducts = [...new Set(ids.map(String))].sort();
  if (coveredSupplierProducts.length !== ids.length) throw error('Covered products must not be repeated.');
  if (input.pricingMethod !== 'catalog_at_order') {
    throw error('Only supplier catalog pricing at purchase-order submission is supported.');
  }
  const minimumOrderQuantity = Number(input.minimumOrderQuantity);
  const estimatedDeliveryDays = Number(input.estimatedDeliveryDays);
  const paymentDeadlineDays = Number(input.paymentDeadlineDays);
  if (![minimumOrderQuantity, estimatedDeliveryDays, paymentDeadlineDays].every(Number.isSafeInteger)
      || minimumOrderQuantity < 1 || minimumOrderQuantity > 100000
      || estimatedDeliveryDays < 0 || estimatedDeliveryDays > 365
      || paymentDeadlineDays < 0 || paymentDeadlineDays > 365) {
    throw error('Minimum quantity, delivery days, and payment deadline must be valid whole numbers.');
  }
  const effectiveFrom = new Date(input.effectiveFrom);
  const effectiveUntil = new Date(input.effectiveUntil);
  if (!Number.isFinite(effectiveFrom.getTime()) || !Number.isFinite(effectiveUntil.getTime())
      || effectiveUntil <= effectiveFrom) throw error('Choose valid agreement start and end dates.');
  const terms = {
    coveredSupplierProducts, pricingMethod: 'catalog_at_order',
    minimumOrderQuantity, estimatedDeliveryDays, paymentDeadlineDays,
    effectiveFrom: effectiveFrom.toISOString(), effectiveUntil: effectiveUntil.toISOString()
  };
  for (const field of TEXT_FIELDS) {
    const value = input[field];
    if (typeof value !== 'string' || value.trim().length < 3 || value.trim().length > 2000) {
      throw error(`${field} must contain 3–2000 characters.`);
    }
    terms[field] = value.trim();
  }
  return terms;
};

const hashTerms = terms => crypto.createHash('sha256').update(JSON.stringify(terms)).digest('hex');
const effectiveStatus = (agreement, now = new Date()) =>
  agreement.status === 'active' && new Date(agreement.versions[agreement.currentVersion - 1].terms.effectiveUntil) <= now
    ? 'expired' : agreement.status;

const activeVersionForProducts = (agreement, productIds, now = new Date()) => {
  if (!agreement || effectiveStatus(agreement, now) !== 'active') return null;
  const version = agreement.versions?.[agreement.currentVersion - 1];
  if (!version?.sellerAcceptance || !version?.supplierAcceptance
      || version.sellerAcceptance.hash !== version.hash
      || version.supplierAcceptance.hash !== version.hash
      || hashTerms(version.terms) !== version.hash
      || new Date(version.terms.effectiveFrom) > now
      || new Date(version.terms.effectiveUntil) <= now) return null;
  const coverage = new Set(version.terms.coveredSupplierProducts.map(String));
  return productIds.every(id => coverage.has(String(id))) ? version : null;
};

module.exports = { STATUSES, TEXT_FIELDS, error, normalizeTerms, hashTerms, effectiveStatus, activeVersionForProducts };
