const CATEGORY_CONTRACT = require('../client/src/constants/productCategories.json');

const PRODUCT_CATEGORY_VALUES = CATEGORY_CONTRACT.map(category => category.value);

const invalid = message => Object.assign(new Error(message), { statusCode: 400 });
const escapeRegex = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const categoryEntry = value => {
  const candidate = String(value || '').trim().toLocaleLowerCase();
  if (!candidate) return null;
  return CATEGORY_CONTRACT.find(category => (
    category.value.toLocaleLowerCase() === candidate
    || (category.aliases || []).some(alias => alias.toLocaleLowerCase() === candidate)
  )) || null;
};

const normalizeProductCategory = value => categoryEntry(value)?.value || null;

const requireProductCategory = value => {
  const canonical = normalizeProductCategory(value);
  if (!canonical) throw invalid('Invalid product category.');
  return canonical;
};

const buildProductCategoryFilter = value => {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const entry = categoryEntry(value);
  if (!entry) throw invalid('Invalid product category filter.');
  const acceptedValues = [entry.value, ...(entry.aliases || [])].map(escapeRegex);
  return { $regex: `^\\s*(?:${acceptedValues.join('|')})\\s*$`, $options: 'i' };
};

module.exports = {
  CATEGORY_CONTRACT,
  PRODUCT_CATEGORY_VALUES,
  buildProductCategoryFilter,
  normalizeProductCategory,
  requireProductCategory
};
