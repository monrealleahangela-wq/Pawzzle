const normalize = value => String(value || '').trim().toLowerCase();

export const supplierCatalogCategory = product => (
  product?.category || product?.itemType || 'uncategorized'
);

export const supplierCatalogProductIsAvailable = product => {
  if (product?.productMode === 'variant') {
    return (product.variants || []).some(variant => (
      variant?.isActive !== false
      && !variant?.isDiscontinued
      && Number(variant?.availableStock || 0) > 0
    ));
  }

  return Number(product?.availableStock || 0) > 0;
};

export const filterSupplierCatalogProducts = (products = [], filters = {}) => {
  const search = normalize(filters.search);
  const category = normalize(filters.category);
  const availability = normalize(filters.availability);

  return products.filter(product => {
    const variants = product?.variants || [];
    const searchableText = [
      product?.name,
      product?.sku,
      product?.category,
      product?.itemType,
      product?.description,
      ...variants.flatMap(variant => [
        variant?.sku,
        ...(variant?.attributes || []).flatMap(attribute => [
          attribute?.name,
          attribute?.nameLabel,
          attribute?.value,
          attribute?.valueLabel
        ])
      ])
    ].map(normalize).join(' ');

    if (search && !searchableText.includes(search)) return false;
    if (category && category !== 'all' && normalize(supplierCatalogCategory(product)) !== category) return false;

    const available = supplierCatalogProductIsAvailable(product);
    if (availability === 'available' && !available) return false;
    if (availability === 'unavailable' && available) return false;

    return true;
  });
};
