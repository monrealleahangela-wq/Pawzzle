const mongoose = require('mongoose');
const ProductVariant = require('../models/ProductVariant');
const SupplierProductVariant = require('../models/SupplierProductVariant');

const resolutionError = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code });

const requireObjectId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) {
    throw resolutionError(`${label} is invalid.`, 400, 'INVALID_VARIANT_REFERENCE');
  }
};

const resolveOwnedVariant = async ({ Model, variantId, parentId, parentField, label, requireActive }) => {
  requireObjectId(variantId, `${label} ID`);
  requireObjectId(parentId, `Parent ${label.toLowerCase()} ID`);
  const variant = await Model.findById(variantId);
  if (!variant) throw resolutionError(`${label} was not found.`, 404, 'VARIANT_NOT_FOUND');
  if (String(variant[parentField]) !== String(parentId)) {
    throw resolutionError(`${label} does not belong to the requested parent.`, 400, 'VARIANT_PARENT_MISMATCH');
  }
  if (requireActive && (variant.isActive !== true || variant.isDiscontinued === true)) {
    throw resolutionError(`${label} is not active.`, 409, 'VARIANT_INACTIVE');
  }
  return variant;
};

const resolveProductVariant = ({ productId, variantId, requireActive = false }) => resolveOwnedVariant({
  Model: ProductVariant,
  variantId,
  parentId: productId,
  parentField: 'product',
  label: 'Product variant',
  requireActive
});

const resolveSupplierProductVariant = ({ supplierProductId, variantId, requireActive = false }) => resolveOwnedVariant({
  Model: SupplierProductVariant,
  variantId,
  parentId: supplierProductId,
  parentField: 'supplierProduct',
  label: 'Supplier product variant',
  requireActive
});

module.exports = {
  resolveProductVariant,
  resolveSupplierProductVariant
};
