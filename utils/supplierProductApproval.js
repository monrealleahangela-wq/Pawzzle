const APPROVAL_STATUSES = ['pending_review', 'approved', 'changes_requested', 'rejected'];

const FDA_REVIEW_CATEGORIES = Object.freeze([
  'pet_food',
  'pet_treats',
  'medical_supplies',
  'health_supplements'
]);

const REVIEWED_CONTENT_FIELDS = [
  'name', 'sku', 'description', 'category', 'images', 'wholesalePrice',
  'retailPrice', 'brand', 'specifications', 'weight', 'dimensions',
  'expirationDate', 'ingredients', 'nutritionalInformation',
  'intendedSpecies', 'safetyNotes', 'regulatoryDocuments',
  'fdaRegistrationNumber', 'fdaRegistrationExpiry', 'pet'
];

const requiresFdaComplianceReview = productOrCategory => {
  const category = typeof productOrCategory === 'string'
    ? productOrCategory
    : productOrCategory?.category;
  return FDA_REVIEW_CATEGORIES.includes(String(category || '').trim());
};

const buildSupplierProductApprovalState = ({ category, actor, at = new Date() }) => {
  if (!requiresFdaComplianceReview(category)) {
    return {
      requiresPlatformReview: false,
      approvalStatus: 'approved',
      submittedAt: undefined,
      reviewedAt: undefined,
      reviewedBy: undefined,
      reviewReason: '',
      publishedAt: at,
      reviewHistory: []
    };
  }

  return {
    requiresPlatformReview: true,
    approvalStatus: 'pending_review',
    submittedAt: at,
    reviewedAt: undefined,
    reviewedBy: undefined,
    reviewReason: '',
    publishedAt: undefined,
    reviewHistory: [{ status: 'pending_review', actor, reason: '', at }]
  };
};

// Non-regulated supplies bypass FDA compliance review. Records created before
// supply approval was introduced also remain published so the rollout does not
// silently remove established inventory or break existing purchase orders.
const publishedSupplierProductClause = {
  $or: [
    { category: { $nin: FDA_REVIEW_CATEGORIES } },
    { requiresPlatformReview: { $ne: true } },
    { approvalStatus: 'approved' }
  ]
};

const withPublishedSupplierProduct = filter => ({
  $and: [filter || {}, publishedSupplierProductClause]
});

const isSupplierProductPublished = product => Boolean(product)
  && (!requiresFdaComplianceReview(product)
    || product.requiresPlatformReview !== true
    || product.approvalStatus === 'approved');

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
  FDA_REVIEW_CATEGORIES,
  REVIEWED_CONTENT_FIELDS,
  requiresFdaComplianceReview,
  buildSupplierProductApprovalState,
  publishedSupplierProductClause,
  withPublishedSupplierProduct,
  isSupplierProductPublished,
  hasReviewedContentUpdate
};
