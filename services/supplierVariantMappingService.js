const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const SupplierProduct = require('../models/SupplierProduct');
const SupplierProductVariant = require('../models/SupplierProductVariant');
const SupplierVariantMapping = require('../models/SupplierVariantMapping');
const { requiresFdaComplianceReview } = require('../utils/supplierProductApproval');

const conflict = message => Object.assign(new Error(message), { statusCode: 409 });

const isVariantRegulatorilyEligible = ({ parent, variant }) => {
  if (!requiresFdaComplianceReview(parent)) return true;
  return parent.requiresPlatformReview === true
    && parent.approvalStatus === 'approved'
    && variant.regulatoryReview?.status === 'approved';
};

const assertSupplierVariantAvailable = ({ parent, variant, supplierId }) => {
  if (!parent || parent.productMode !== 'variant' || parent.isDeleted || !parent.isActive) {
    throw conflict('The supplier variant parent is not available for procurement.');
  }
  if (!variant || String(variant.supplierProduct) !== String(parent._id)
      || String(variant.supplier) !== String(supplierId || parent.supplier)) {
    throw conflict('The supplier variant does not belong to the selected supplier product.');
  }
  if (!variant.isActive || variant.isDiscontinued) throw conflict('The supplier variant is inactive or discontinued.');
  if (!isVariantRegulatorilyEligible({ parent, variant })) {
    throw conflict('The regulated supplier variant is not approved for procurement.');
  }
  return variant;
};

const validateMappingReferences = async ({ storeId, sellerVariantId, supplierVariantId, session, requireActive = true }) => {
  const variantQuery = ProductVariant.findById(sellerVariantId).select('+store');
  const supplierVariantQuery = SupplierProductVariant.findById(supplierVariantId).select('+supplier');
  if (session) {
    variantQuery.session(session);
    supplierVariantQuery.session(session);
  }
  const [sellerVariant, supplierVariant] = await Promise.all([variantQuery, supplierVariantQuery]);
  if (!sellerVariant || String(sellerVariant.store) !== String(storeId)) {
    throw conflict('The seller variant does not belong to the authorized store.');
  }
  const productQuery = Product.findOne({
    _id: sellerVariant.product,
    store: storeId,
    ...(requireActive ? { isDeleted: { $ne: true } } : {})
  });
  const supplierProductQuery = SupplierProduct.findOne({
    _id: supplierVariant?.supplierProduct,
    ...(requireActive ? { isDeleted: false } : {})
  });
  if (session) {
    productQuery.session(session);
    supplierProductQuery.session(session);
  }
  const [sellerProduct, supplierProduct] = await Promise.all([productQuery, supplierProductQuery]);
  if (!sellerProduct || sellerProduct.productMode !== 'variant') throw conflict('The seller parent product is not a variant product.');
  if (!supplierVariant || !supplierProduct) throw conflict('The supplier variant is unavailable.');
  if (requireActive) {
    assertSupplierVariantAvailable({ parent: supplierProduct, variant: supplierVariant, supplierId: supplierProduct.supplier });
  }
  return { sellerVariant, sellerProduct, supplierVariant, supplierProduct };
};

const resolveConfirmedVariantMapping = async ({ storeId, supplierVariantId, mappingId, session }) => {
  const query = SupplierVariantMapping.findOne({
    _id: mappingId,
    store: storeId,
    supplierVariant: supplierVariantId,
    status: 'confirmed'
  });
  if (session) query.session(session);
  const mapping = await query;
  if (!mapping) throw conflict('A confirmed supplier-to-seller variant mapping is required.');
  const references = await validateMappingReferences({
    storeId,
    sellerVariantId: mapping.sellerVariant,
    supplierVariantId,
    session
  });
  if (String(mapping.sellerProduct) !== String(references.sellerProduct._id)
      || String(mapping.supplierProduct) !== String(references.supplierProduct._id)
      || String(mapping.supplier) !== String(references.supplierProduct.supplier)) {
    throw conflict('The supplier-to-seller variant mapping no longer matches its parent records.');
  }
  return { mapping, ...references };
};

const resolveHistoricalVariantMapping = async ({ storeId, supplierVariantId, mappingId, session }) => {
  const query = SupplierVariantMapping.findOne({ _id: mappingId, store: storeId, supplierVariant: supplierVariantId });
  if (session) query.session(session);
  const mapping = await query;
  if (!mapping) throw conflict('The purchase-order variant mapping record is unavailable.');
  const references = await validateMappingReferences({
    storeId,
    sellerVariantId: mapping.sellerVariant,
    supplierVariantId,
    session,
    requireActive: false
  });
  if (String(mapping.sellerProduct) !== String(references.sellerProduct._id)
      || String(mapping.supplierProduct) !== String(references.supplierProduct._id)
      || String(mapping.supplier) !== String(references.supplierProduct.supplier)) {
    throw conflict('The historical variant mapping does not match its parent records.');
  }
  return { mapping, ...references };
};

module.exports = {
  assertSupplierVariantAvailable,
  isVariantRegulatorilyEligible,
  resolveConfirmedVariantMapping,
  resolveHistoricalVariantMapping,
  validateMappingReferences
};
