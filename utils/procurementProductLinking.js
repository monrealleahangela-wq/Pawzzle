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

const getStoreProductCompatibilityIssue = ({ storeProduct, supplierProduct, storeId }) => {
  if (!storeProduct) return 'The selected Store product was not found.';
  if (idOf(storeProduct.store) !== idOf(storeId)) return 'The selected Store product belongs to another Store.';
  if (storeProduct.isDeleted || storeProduct.isActive === false) return 'The selected Store product is archived or inactive.';

  const linkedSupplierProduct = idOf(storeProduct.supplierProductRef);
  if (linkedSupplierProduct && linkedSupplierProduct !== idOf(supplierProduct)) {
    return 'The selected Store product is already linked to a different supplier item.';
  }

  const expectedCategory = mapSupplierCategoryToStoreCategory(supplierProduct?.category);
  const actualCategory = normalizeProductCategory(storeProduct.category);
  if (expectedCategory && actualCategory && expectedCategory !== actualCategory) {
    return `The selected Store product category is incompatible with supplier category "${supplierProduct.category}".`;
  }
  return null;
};

const assertStoreProductCompatible = context => {
  const issue = getStoreProductCompatibilityIssue(context);
  if (issue) throw invalid(issue, 409);
  return context.storeProduct;
};

const buildDraftStoreProduct = ({ supplierProduct, supplierId, storeId, userId, input = {} }) => {
  const name = cleanText(input.name);
  const description = cleanText(input.description);
  const shortDescription = cleanText(input.shortDescription);
  const sku = cleanText(input.sku);
  const category = normalizeProductCategory(input.category);
  const price = Number(input.price);
  const unit = cleanText(input.unit);

  if (!name) throw invalid('Product name is required.');
  if (!category) throw invalid('Select a valid Store product category.');
  if (!description) throw invalid('Product description is required.');
  if (!shortDescription) throw invalid('Short description is required.');
  if (!Number.isFinite(price) || price <= 0) throw invalid('Selling price must be greater than zero.');
  if (!sku) throw invalid('Enter a Store SKU. Supplier SKUs are not copied automatically.');
  if (!STORE_PRODUCT_UNITS.has(unit)) throw invalid('Select a valid Store selling unit.');

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

const getDraftProductSuggestions = supplierProduct => ({
  name: cleanText(supplierProduct?.name),
  category: mapSupplierCategoryToStoreCategory(supplierProduct?.category) || '',
  description: cleanText(supplierProduct?.description),
  supplierSku: cleanText(supplierProduct?.sku),
  supplierRetailPrice: Number(supplierProduct?.retailPrice) > 0 ? Number(supplierProduct.retailPrice) : null,
  unit: STORE_PRODUCT_UNITS.has(supplierProduct?.unitOfMeasure) ? supplierProduct.unitOfMeasure : '',
  supplierImageCount: Array.isArray(supplierProduct?.images) ? supplierProduct.images.length : 0
});

module.exports = {
  STORE_PRODUCT_UNITS,
  mapSupplierCategoryToStoreCategory,
  getStoreProductCompatibilityIssue,
  assertStoreProductCompatible,
  buildDraftStoreProduct,
  getDraftProductSuggestions
};
