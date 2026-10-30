const SkuClaim = require('../models/SkuClaim');
const { normalizeVariantSku, variantError } = require('../utils/variantIdentity');

const makeActiveKey = ({ namespaceType, owner, normalizedSku }) => (
  `${namespaceType}:${String(owner)}:${normalizedSku}`
);

const duplicateSkuError = () => {
  const error = variantError(
    'This SKU is already used by another product or variant in this supplier namespace.',
    'DUPLICATE_SKU_NAMESPACE_CLAIM'
  );
  error.statusCode = 409;
  return error;
};

const claimSku = async ({
  namespaceType,
  owner,
  sku,
  entityType,
  entity,
  session
}) => {
  const normalizedSku = normalizeVariantSku(sku);
  const activeKey = makeActiveKey({ namespaceType, owner, normalizedSku });
  try {
    const [claim] = await SkuClaim.create([{
      namespaceType,
      owner,
      normalizedSku,
      entityType,
      entity,
      activeKey,
      isActive: true
    }], { session });
    return claim;
  } catch (error) {
    if (error?.code === 11000) throw duplicateSkuError();
    throw error;
  }
};

const releaseSku = async ({ entityType, entity, normalizedSku, reason, session }) => {
  const filter = { entityType, entity, isActive: true };
  if (normalizedSku) filter.normalizedSku = normalizedSku;
  return SkuClaim.findOneAndUpdate(filter, {
    $set: {
      isActive: false,
      releasedAt: new Date(),
      releaseReason: reason || 'SKU changed'
    },
    $unset: { activeKey: 1 }
  }, { new: true, session });
};

const replaceSkuClaim = async ({
  namespaceType,
  owner,
  previousSku,
  nextSku,
  entityType,
  entity,
  session
}) => {
  const previousNormalized = normalizeVariantSku(previousSku);
  const nextNormalized = normalizeVariantSku(nextSku);
  if (previousNormalized === nextNormalized) return null;
  const claim = await claimSku({ namespaceType, owner, sku: nextSku, entityType, entity, session });
  await releaseSku({
    entityType,
    entity,
    normalizedSku: previousNormalized,
    reason: `Replaced by ${nextNormalized}`,
    session
  });
  return claim;
};

module.exports = {
  claimSku,
  duplicateSkuError,
  makeActiveKey,
  releaseSku,
  replaceSkuClaim
};
