const crypto = require('node:crypto');

const PRODUCT_MODES = Object.freeze(['simple', 'variant']);
const MAX_VARIANT_ATTRIBUTES = 12;
const VARIANT_CODE_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

const variantError = (message, code = 'INVALID_VARIANT') => {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  return error;
};

const normalizeDisplayText = (value, label, maxLength = 120) => {
  if (typeof value !== 'string') throw variantError(`${label} is required.`);
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!normalized) throw variantError(`${label} is required.`);
  if (normalized.length > maxLength) throw variantError(`${label} must be ${maxLength} characters or fewer.`);
  return normalized;
};

const normalizeIdentityCode = (value, label) => {
  const normalized = normalizeDisplayText(value, label, 80)
    .toLocaleLowerCase('en-US')
    .replace(/\s+/g, '_');
  if (!VARIANT_CODE_PATTERN.test(normalized)) {
    throw variantError(`${label} may contain only letters, numbers, periods, underscores, and hyphens.`);
  }
  return normalized;
};

const normalizeVariantAttributes = attributes => {
  if (!Array.isArray(attributes) || attributes.length === 0) {
    throw variantError('At least one variant attribute is required.');
  }
  if (attributes.length > MAX_VARIANT_ATTRIBUTES) {
    throw variantError(`A variant can have at most ${MAX_VARIANT_ATTRIBUTES} attributes.`);
  }

  const normalized = attributes.map((attribute, index) => {
    if (!attribute || typeof attribute !== 'object' || Array.isArray(attribute)) {
      throw variantError(`Variant attribute ${index + 1} must be an object.`);
    }
    return {
      code: normalizeIdentityCode(attribute.code, `Attribute ${index + 1} code`),
      label: normalizeDisplayText(attribute.label, `Attribute ${index + 1} label`, 80),
      valueCode: normalizeIdentityCode(attribute.valueCode, `Attribute ${index + 1} value code`),
      valueLabel: normalizeDisplayText(attribute.valueLabel, `Attribute ${index + 1} value label`, 120)
    };
  });

  const seenCodes = new Set();
  for (const attribute of normalized) {
    if (seenCodes.has(attribute.code)) {
      throw variantError(`Variant attribute code "${attribute.code}" is duplicated.`, 'DUPLICATE_VARIANT_ATTRIBUTE');
    }
    seenCodes.add(attribute.code);
  }

  return normalized.sort((left, right) => (
    left.code < right.code ? -1 : left.code > right.code ? 1 : 0
  ));
};

const buildVariantCombinationKey = attributes => {
  const normalizedAttributes = normalizeVariantAttributes(attributes);
  const canonicalPayload = JSON.stringify(
    normalizedAttributes.map(({ code, valueCode }) => [code, valueCode])
  );
  const digest = crypto.createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');
  return {
    attributes: normalizedAttributes,
    combinationKey: `v1:${digest}`
  };
};

const normalizeVariantSku = sku => {
  const normalized = normalizeDisplayText(sku, 'Variant SKU', 100).toLocaleUpperCase('en-US');
  if (!/^[A-Z0-9][A-Z0-9._/-]*$/.test(normalized)) {
    throw variantError('Variant SKU may contain only letters, numbers, periods, underscores, slashes, and hyphens.');
  }
  return normalized;
};

const getProductMode = value => PRODUCT_MODES.includes(value) ? value : 'simple';

const assertVariantIdentityAvailable = async ({
  Model,
  parentField,
  parentId,
  ownerField,
  ownerId,
  combinationKey,
  normalizedSku,
  excludeId,
  session
}) => {
  if (!Model || typeof Model.exists !== 'function') throw new TypeError('A variant model is required.');
  const excludingCurrent = excludeId ? { _id: { $ne: excludeId } } : {};
  const combinationQuery = Model.exists({ [parentField]: parentId, combinationKey, ...excludingCurrent });
  const skuQuery = Model.exists({ [ownerField]: ownerId, normalizedSku, ...excludingCurrent });
  if (session) {
    combinationQuery.session(session);
    skuQuery.session(session);
  }
  const [combinationExists, skuExists] = await Promise.all([combinationQuery, skuQuery]);
  if (combinationExists) {
    throw variantError('This attribute combination already exists for the parent product.', 'DUPLICATE_VARIANT_COMBINATION');
  }
  if (skuExists) {
    throw variantError('This variant SKU is already used in the same owner scope.', 'DUPLICATE_VARIANT_SKU');
  }
};

module.exports = {
  MAX_VARIANT_ATTRIBUTES,
  PRODUCT_MODES,
  assertVariantIdentityAvailable,
  buildVariantCombinationKey,
  getProductMode,
  normalizeIdentityCode,
  normalizeVariantAttributes,
  normalizeVariantSku,
  variantError
};
