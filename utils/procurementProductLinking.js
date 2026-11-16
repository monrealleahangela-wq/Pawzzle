const { normalizeProductCategory } = require('./productCategories');

const STORE_PRODUCT_UNITS = new Set(['piece', 'pack', 'box', 'bottle', 'bag', 'kg']);

const SUPPLIER_CATEGORY_MAP = Object.freeze({
  pet_food: 'Pet Food',
  pet_treats: 'Pet Food',
  grooming_supplies: 'Pet Accessories',
  accessories: 'Pet Accessories',
  toys: 'Pet Accessories',
  cages_habitats: 'Pet Accessories',
  leashes_collars: 'Pet Accessories',
  medical_supplies: 'Pet Health Care',
  health_supplements: 'Pet Health Care',
  cleaning_products: 'Others',
  raw_materials: 'Others',
  general_product: 'Others',
  other: 'Others'
});

const invalid = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const idOf = value => String(value?._id || value || '');
const cleanText = value => String(value || '').trim();

const mapSupplierCategoryToStoreCategory = value => (
  normalizeProductCategory(value) || SUPPLIER_CATEGORY_MAP[cleanText(value).toLowerCase()] || null
);

const getStoreProductCompatibilityIssue = ({ storeProduct, supplierProduct, storeId, orderedUnit }) => {
  if (!storeProduct) return 'The selected Store product was not found.';
  if (idOf(storeProduct.store) !== idOf(storeId)) return 'The selected Store product belongs to another Store.';
  if (storeProduct.isDeleted || storeProduct.isActive === false) return 'The selected Store product is archived or inactive.';

  const linkedSupplierProduct = idOf(storeProduct.supplierProductRef);
  const reviewedOffer = (storeProduct.procurementOffers || []).find(offer =>
    idOf(offer.supplierProduct) === idOf(supplierProduct));
  if (linkedSupplierProduct && linkedSupplierProduct !== idOf(supplierProduct) && !reviewedOffer) {
    return 'The selected Store product is already linked to a different supplier item.';
  }

  const expectedCategory = mapSupplierCategoryToStoreCategory(supplierProduct?.category);
  const actualCategory = normalizeProductCategory(storeProduct.category);
  if (expectedCategory && actualCategory && expectedCategory !== actualCategory) {
    return `The selected Store product category is incompatible with supplier category "${supplierProduct.category}".`;
  }
  const expectedUnit = cleanText(orderedUnit || supplierProduct?.unitOfMeasure);
  if (STORE_PRODUCT_UNITS.has(expectedUnit) && storeProduct.unit !== expectedUnit) {
    return `The ordered unit "${expectedUnit}" does not match the Store product unit "${storeProduct.unit}".`;
  }
  return null;
};

const getOfferMatchType = ({ storeProduct, supplierProduct }) => {
  const reviewedOffer = (storeProduct?.procurementOffers || []).find(offer =>
    idOf(offer.supplierProduct) === idOf(supplierProduct));
  if (reviewedOffer) return reviewedOffer.matchType;
  return idOf(storeProduct?.supplierProductRef) === idOf(supplierProduct) ? 'exact' : null;
};

const getOfferReviewIssue = ({ storeProduct, supplierProduct, storeId, matchType }) => {
  if (!['exact', 'equivalent'].includes(matchType)) return 'Select exact or equivalent match.';
  if (supplierProduct?.itemType === 'live_pet') return 'Individual live pets cannot be treated as interchangeable supplier offers.';
  if (!storeProduct || idOf(storeProduct.store) !== idOf(storeId) || storeProduct.isDeleted || storeProduct.isActive === false) {
    return 'The Store product is unavailable or belongs to another Store.';
  }
  if (storeProduct.unit !== supplierProduct?.unitOfMeasure) return 'Supplier and Store product units must match before comparison.';
  const expectedCategory = mapSupplierCategoryToStoreCategory(supplierProduct?.category);
  if (expectedCategory && expectedCategory !== normalizeProductCategory(storeProduct.category)) {
    return 'Supplier and Store product categories are incompatible.';
  }
  return null;
};

const assertStoreProductCompatible = context => {
  const issue = getStoreProductCompatibilityIssue(context);
  if (issue) throw invalid(issue, 409);
  return context.storeProduct;
};

const resolveOrderedUnit = ({ supplierProduct, orderedUnit }) => {
  const unit = cleanText(orderedUnit || supplierProduct?.unitOfMeasure);
  if (!STORE_PRODUCT_UNITS.has(unit)) {
    throw invalid('The purchase order does not contain a supported selling unit. Place a new order with a valid unit before receiving this item.', 409);
  }
  return unit;
};

const buildDraftStoreProduct = ({ supplierProduct, supplierId, storeId, userId, orderedUnit, input = {} }) => {
  const name = cleanText(input.name);
  const description = cleanText(input.description);
  const shortDescription = cleanText(input.shortDescription);
  const sku = cleanText(input.sku);
  const category = normalizeProductCategory(input.category);
  const price = Number(input.price);
  const unit = resolveOrderedUnit({ supplierProduct, orderedUnit });

  if (!name) throw invalid('Product name is required.');
  if (!category) throw invalid('Select a valid Store product category.');
  if (!description) throw invalid('Product description is required.');
  if (!shortDescription) throw invalid('Short description is required.');
  if (!Number.isFinite(price) || price <= 0) throw invalid('Selling price must be greater than zero.');
  if (!sku) throw invalid('Enter a Store SKU. Supplier SKUs are not copied automatically.');
  if (input.unit && cleanText(input.unit) !== unit) {
    throw invalid(`The selling unit is fixed as "${unit}" by this purchase order. Place a new order to use a different unit.`, 409);
  }

  const product = {
    name,
    category,
    description,
    shortDescription,
    price,
    sku,
    unit,
    stockQuantity: 0,
    stockStatus: 'out_of_stock',
    images: Array.isArray(supplierProduct?.images)
      ? supplierProduct.images.filter(image => typeof image === 'string' && image.trim())
      : [],
    brand: cleanText(input.brand) || cleanText(supplierProduct?.brand) || undefined,
    visibility: 'draft',
    fulfillmentType: 'pickup_only',
    isActive: true,
    addedBy: userId,
    store: storeId,
    supplierRef: supplierId,
    supplierProductRef: supplierProduct._id
  };
  if (product.images.length) product.coverImage = product.images[0];

  if (input.weight !== undefined && input.weight !== null && input.weight !== '') {
    const weight = Number(input.weight);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 10000) {
      throw invalid('Package weight must be greater than zero and no more than 10000.');
    }
    if (!['g', 'kg'].includes(input.weightUnit)) throw invalid('Package weight unit must be g or kg.');
    product.weight = weight;
    product.weightUnit = input.weightUnit;
  }

  return product;
};

const getDraftProductSuggestions = (supplierProduct, orderedUnit) => ({
  name: cleanText(supplierProduct?.name),
  category: mapSupplierCategoryToStoreCategory(supplierProduct?.category) || '',
  description: cleanText(supplierProduct?.description),
  supplierSku: cleanText(supplierProduct?.sku),
  supplierRetailPrice: Number(supplierProduct?.retailPrice) > 0 ? Number(supplierProduct.retailPrice) : null,
  unit: STORE_PRODUCT_UNITS.has(cleanText(orderedUnit || supplierProduct?.unitOfMeasure))
    ? cleanText(orderedUnit || supplierProduct.unitOfMeasure) : '',
  supplierImageCount: Array.isArray(supplierProduct?.images) ? supplierProduct.images.length : 0
});

module.exports = {
  STORE_PRODUCT_UNITS,
  mapSupplierCategoryToStoreCategory,
  getStoreProductCompatibilityIssue,
  getOfferMatchType,
  getOfferReviewIssue,
  assertStoreProductCompatible,
  resolveOrderedUnit,
  buildDraftStoreProduct,
  getDraftProductSuggestions
};
