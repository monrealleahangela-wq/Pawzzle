import categoryContract from './productCategories.json';

export const PRODUCT_CATEGORIES = categoryContract;
export const PRODUCT_CATEGORY_VALUES = categoryContract.map(category => category.value);

export const normalizeProductCategory = value => {
  const candidate = String(value || '').trim().toLocaleLowerCase();
  if (!candidate) return '';
  const match = categoryContract.find(category => (
    category.value.toLocaleLowerCase() === candidate
    || (category.aliases || []).some(alias => alias.toLocaleLowerCase() === candidate)
  ));
  return match?.value || '';
};
