const Inventory = require('../models/Inventory');

const buildCustomerProductStockFilter = async ({ storeIds = [], variantBrowsingEnabled = false } = {}) => {
  const availability = [
    { productMode: { $ne: 'variant' }, stockQuantity: { $gt: 0 } }
  ];

  if (variantBrowsingEnabled && storeIds.length) {
    const stockedVariantProductIds = await Inventory.distinct('product', {
      store: { $in: storeIds },
      productVariant: { $type: 'objectId' },
      isActive: true,
      $expr: {
        $gt: [
          { $ifNull: ['$quantity', 0] },
          { $ifNull: ['$reservedQuantity', 0] }
        ]
      }
    });
    availability.push({ productMode: 'variant', _id: { $in: stockedVariantProductIds } });
  }

  return { $or: availability };
};

const hasCustomerAvailableStock = (product, variants = []) => {
  if (product?.productMode === 'variant') {
    return variants.some(variant => variant?.inStock && Number(variant.availableQuantity || 0) > 0);
  }
  return Number(product?.stockQuantity || 0) > 0;
};

module.exports = { buildCustomerProductStockFilter, hasCustomerAvailableStock };
