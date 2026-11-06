const SupplierProduct = require('../models/SupplierProduct');
const { requiresFdaComplianceReview } = require('../utils/supplierProductApproval');
const { normalizeProductCategory } = require('../utils/productCategories');

const FDA_REVIEWED_RETAIL_CATEGORIES = new Set(['Pet Food', 'Pet Health Care']);

const FDA_BADGE = Object.freeze({
  authority: 'FDA',
  status: 'approved',
  label: 'FDA Approved',
  detail: 'FDA registration evidence verified by Pawzzle'
});

const validDate = value => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isFdaReviewedRetailCategory = value => requiresFdaComplianceReview(value)
  || FDA_REVIEWED_RETAIL_CATEGORIES.has(
    normalizeProductCategory(value) || String(value || '').trim()
  );

const buildPublicFdaVerification = ({ product, supplierProduct, now = new Date() }) => {
  if (!product || !supplierProduct || product.productMode === 'variant') return null;
  if (!product.supplierProductRef
      || String(product.supplierProductRef) !== String(supplierProduct._id)) return null;
  if (product.supplierRef
      && String(product.supplierRef) !== String(supplierProduct.supplier)) return null;
  if (!isFdaReviewedRetailCategory(product.category)
      || !requiresFdaComplianceReview(supplierProduct)) return null;
  if (supplierProduct.requiresPlatformReview !== true
      || supplierProduct.approvalStatus !== 'approved'
      || supplierProduct.isDeleted === true
      || supplierProduct.isActive === false
      || !validDate(supplierProduct.reviewedAt)) return null;

  const expiry = validDate(supplierProduct.fdaRegistrationExpiry);
  if (supplierProduct.fdaRegistrationExpiry && !expiry) return null;
  if (expiry && expiry.getTime() < now.getTime()) return null;

  return { ...FDA_BADGE };
};

const getPublicProductRegulatoryVerification = async product => {
  if (!product || product.productMode === 'variant'
      || !product.supplierProductRef || !isFdaReviewedRetailCategory(product.category)) return null;

  const filter = {
    _id: product.supplierProductRef,
    isDeleted: false,
    isActive: true
  };
  if (product.supplierRef) filter.supplier = product.supplierRef;

  const supplierProduct = await SupplierProduct.findOne(filter)
    .select('supplier category requiresPlatformReview approvalStatus reviewedAt isActive isDeleted +fdaRegistrationExpiry')
    .lean();

  return buildPublicFdaVerification({ product, supplierProduct });
};

module.exports = {
  FDA_BADGE,
  buildPublicFdaVerification,
  getPublicProductRegulatoryVerification,
  isFdaReviewedRetailCategory
};
