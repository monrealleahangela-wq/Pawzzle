const APPROVAL_STATUSES = ['pending_review', 'approved', 'changes_requested', 'rejected'];

const REVIEWED_CONTENT_FIELDS = [
  'name', 'sku', 'description', 'category', 'images', 'wholesalePrice',
  'retailPrice', 'brand', 'specifications', 'weight', 'dimensions',
  'expirationDate', 'ingredients', 'nutritionalInformation',
  'intendedSpecies', 'safetyNotes', 'regulatoryDocuments', 'pet'
];

// Records created before supply approval was introduced have no
// requiresPlatformReview flag. They remain published so the rollout does not
// silently remove established inventory or break existing purchase orders.
const publishedSupplierProductClause = {
  $or: [
    { requiresPlatformReview: { $ne: true } },
    { approvalStatus: 'approved' }
  ]
};

const withPublishedSupplierProduct = filter => ({
  $and: [filter || {}, publishedSupplierProductClause]
});

const isSupplierProductPublished = product => Boolean(product)
  && (product.requiresPlatformReview !== true || product.approvalStatus === 'approved');

const comparable = value => {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toObject === 'function') return comparable(value.toObject());
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !['_id', '__v', 'uploadedAt'].includes(key))
      .map(([key, item]) => [key, comparable(item)]));
  }
  return value === undefined || value === null ? '' : value;
};

const hasReviewedContentUpdate = (body, current) => REVIEWED_CONTENT_FIELDS.some(field => {
  if (!Object.prototype.hasOwnProperty.call(body || {}, field)) return false;
  if (!current) return true;
  return JSON.stringify(comparable(body[field])) !== JSON.stringify(comparable(current[field]));
});

module.exports = {
  APPROVAL_STATUSES,
  REVIEWED_CONTENT_FIELDS,
  publishedSupplierProductClause,
  withPublishedSupplierProduct,
  isSupplierProductPublished,
  hasReviewedContentUpdate
};
