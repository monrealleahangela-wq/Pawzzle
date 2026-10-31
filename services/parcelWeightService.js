const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');

const WEIGHT_UNITS = ['g', 'kg'];
const ASSIGNABLE_WEIGHT_STATUSES = ['complete', 'product_weight_only'];
const MAX_WEIGHT_MILLIGRAMS = 10_000_000_000; // 10,000 kg

const invalid = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

const toMilligrams = (value, unit) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || !WEIGHT_UNITS.includes(unit)) return null;
  const milligrams = Math.round(numeric * (unit === 'kg' ? 1_000_000 : 1_000));
  return Number.isSafeInteger(milligrams) && milligrams > 0 && milligrams <= MAX_WEIGHT_MILLIGRAMS
    ? milligrams
    : null;
};

const milligramsToKg = milligrams => Number((Number(milligrams || 0) / 1_000_000).toFixed(6));

const resolveVariant = (product, variantId) => {
  if (!variantId) return null;
  const variants = product?.variants || [];
  return variants.find(variant => String(variant?._id) === String(variantId)) || null;
};

const snapshotProductWeight = (product, { variantId, normalizedVariant, capturedAt = new Date() } = {}) => {
  if (!product) return null;
  const variant = normalizedVariant || resolveVariant(product, variantId);
  if (variantId && !variant) throw invalid('The selected product variant is unavailable.');

  const weightOwner = variant && toMilligrams(variant.weight, variant.weightUnit) ? variant : product;
  const productWeightMilligrams = toMilligrams(weightOwner?.weight, weightOwner?.weightUnit);
  if (!productWeightMilligrams) return null;

  // Existing Pawzzle weights were explicitly labelled "Package Weight". An
  // absent flag therefore means packaging is already included, which prevents
  // legacy records from being double-counted.
  const includesPackaging = weightOwner?.weightIncludesPackaging !== false;
  const packagingWeightMilligrams = includesPackaging
    ? 0
    : (toMilligrams(weightOwner?.packagingWeight, weightOwner?.packagingWeightUnit) || 0);

  return {
    productWeightMilligrams,
    packagingWeightMilligrams,
    includesPackaging,
    packagingKnown: includesPackaging || packagingWeightMilligrams > 0,
    source: weightOwner === normalizedVariant ? 'normalized_variant' : (weightOwner === variant ? 'variant' : 'product'),
    status: weightOwner?.weightStatus || 'seller_provided',
    capturedAt,
    catalogUpdatedAt: product.updatedAt || capturedAt
  };
};

const itemSnapshot = item => {
  if (item?.weightSnapshot?.productWeightMilligrams > 0) return item.weightSnapshot;
  const legacyKg = Number(item?.unitWeightKg);
  if (!Number.isFinite(legacyKg) || legacyKg <= 0) return null;
  return {
    productWeightMilligrams: Math.round(legacyKg * 1_000_000),
    packagingWeightMilligrams: 0,
    includesPackaging: true,
    packagingKnown: true,
    source: 'legacy_product_snapshot',
    status: 'seller_provided',
    capturedAt: item?.createdAt
  };
};

const calculateParcelWeight = (items, { parcelCount = 1, calculatedAt = new Date() } = {}) => {
  const count = Number(parcelCount);
  if (!Number.isInteger(count) || count < 1 || count > 10000) {
    throw invalid('Parcel count must be a whole number greater than zero.');
  }

  let totalProductWeightMilligrams = 0;
  let additionalPackagingWeightMilligrams = 0;
  let packagingComplete = true;
  const missingItems = [];

  for (const item of items || []) {
    if (item.itemType !== 'product') continue;
    const quantity = Number(item.quantity);
    const snapshot = itemSnapshot(item);
    if (!Number.isInteger(quantity) || quantity < 1 || !snapshot) {
      missingItems.push({ itemId: item.itemId, variantId: item.variantId, name: item.name || 'Product' });
      continue;
    }
    const lineProductWeight = Number(snapshot.productWeightMilligrams) * quantity;
    const linePackagingWeight = Number(snapshot.packagingWeightMilligrams || 0) * quantity;
    if (!Number.isSafeInteger(lineProductWeight) || !Number.isSafeInteger(linePackagingWeight)
      || !Number.isSafeInteger(totalProductWeightMilligrams + lineProductWeight)
      || !Number.isSafeInteger(additionalPackagingWeightMilligrams + linePackagingWeight)) {
      throw invalid('The calculated parcel weight exceeds the supported precision range.');
    }
    totalProductWeightMilligrams += lineProductWeight;
    additionalPackagingWeightMilligrams += linePackagingWeight;
    if (snapshot.packagingKnown !== true && snapshot.includesPackaging !== true) packagingComplete = false;
  }

  const status = missingItems.length
    ? 'missing_product_weight'
    : (packagingComplete ? 'complete' : 'product_weight_only');
  const estimatedParcelWeightMilligrams = missingItems.length
    ? undefined
    : totalProductWeightMilligrams + additionalPackagingWeightMilligrams;

  return {
    calculationVersion: 1,
    totalProductWeightMilligrams,
    additionalPackagingWeightMilligrams,
    estimatedParcelWeightMilligrams,
    ...(estimatedParcelWeightMilligrams ? { weightKg: milligramsToKg(estimatedParcelWeightMilligrams) } : {}),
    parcelCount: count,
    status,
    source: 'order_item_weight_snapshots',
    missingItems,
    calculatedAt
  };
};

const refreshOrderWeightSnapshots = async (order, { session, parcelCount, calculatedAt = new Date() } = {}) => {
  const productIds = [...new Set((order.items || [])
    .filter(item => item.itemType === 'product')
    .map(item => String(item.itemId)))];
  const query = Product.find({ _id: { $in: productIds }, isDeleted: { $ne: true } });
  if (session) query.session(session);
  const products = await query;
  const byId = new Map(products.map(product => [String(product._id), product]));
  const variantIds = [...new Set((order.items || [])
    .filter(item => item.itemType === 'product' && item.variantId)
    .map(item => String(item.variantId)))];
  const variantQuery = ProductVariant.find({ _id: { $in: variantIds } });
  if (session) variantQuery.session(session);
  const variants = variantIds.length ? await variantQuery : [];
  const variantsById = new Map(variants.map(variant => [String(variant._id), variant]));

  for (const item of order.items || []) {
    if (item.itemType !== 'product') continue;
    const snapshot = snapshotProductWeight(byId.get(String(item.itemId)), {
      variantId: item.variantId,
      normalizedVariant: item.variantId ? variantsById.get(String(item.variantId)) : null,
      capturedAt: calculatedAt
    });
    item.weightSnapshot = snapshot || undefined;
    item.unitWeightKg = snapshot ? milligramsToKg(snapshot.productWeightMilligrams) : undefined;
    item.weightSource = snapshot ? 'product_snapshot' : undefined;
  }

  order.parcelEstimate = calculateParcelWeight(order.items, {
    parcelCount: parcelCount || order.parcelEstimate?.parcelCount || 1,
    calculatedAt
  });
  return order.parcelEstimate;
};

const documentedManualEstimate = input => {
  const weightKg = Number(input?.weightKg);
  const parcelCount = Number(input?.parcelCount || 1);
  const reason = String(input?.manualExceptionReason || '').trim();
  if (input?.manualException !== true || input?.confirmed !== true) {
    throw invalid('Missing product weights must be corrected or replaced by an explicitly confirmed documented estimate.');
  }
  if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 10000) {
    throw invalid('Enter a valid documented parcel-weight estimate in kilograms.');
  }
  if (!Number.isInteger(parcelCount) || parcelCount < 1 || parcelCount > 10000) {
    throw invalid('Parcel count must be a whole number greater than zero.');
  }
  if (reason.length < 10 || reason.length > 500) {
    throw invalid('A documented weight-estimate reason between 10 and 500 characters is required.');
  }
  return {
    weightKg: Number(weightKg.toFixed(6)),
    weightMilligrams: Math.round(weightKg * 1_000_000),
    parcelCount,
    measurementSource: 'documented_manual_estimate',
    manualExceptionReason: reason,
    weightStatus: 'manual_exception'
  };
};

const parcelFromEstimate = (estimate, input = {}) => {
  if (!estimate || !ASSIGNABLE_WEIGHT_STATUSES.includes(estimate.status) || !(estimate.estimatedParcelWeightMilligrams > 0)) {
    return documentedManualEstimate(input);
  }
  const parcelCount = Number(input.parcelCount || estimate.parcelCount || 1);
  if (!Number.isInteger(parcelCount) || parcelCount < 1 || parcelCount > 10000) {
    throw invalid('Parcel count must be a whole number greater than zero.');
  }
  return {
    weightKg: milligramsToKg(estimate.estimatedParcelWeightMilligrams),
    weightMilligrams: estimate.estimatedParcelWeightMilligrams,
    productWeightMilligrams: estimate.totalProductWeightMilligrams,
    packagingWeightMilligrams: estimate.additionalPackagingWeightMilligrams,
    parcelCount,
    measurementSource: estimate.status === 'complete' ? 'catalog_estimate' : 'product_weight_only_estimate',
    weightStatus: estimate.status
  };
};

module.exports = {
  ASSIGNABLE_WEIGHT_STATUSES,
  calculateParcelWeight,
  documentedManualEstimate,
  milligramsToKg,
  parcelFromEstimate,
  refreshOrderWeightSnapshots,
  snapshotProductWeight,
  toMilligrams
};
