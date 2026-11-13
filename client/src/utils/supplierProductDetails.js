export const normalizeSupplierPackageWeight = value => {
  if (value === '' || value === null || value === undefined) return undefined;
  const grams = Number(value);
  return Number.isFinite(grams) && grams > 0 ? grams : undefined;
};

export const formatSupplierPackageWeight = value => {
  const grams = normalizeSupplierPackageWeight(value);
  if (grams === undefined) return 'Not specified';
  if (grams >= 1000) return `${Number((grams / 1000).toFixed(3))} kg`;
  return `${Number(grams.toFixed(2))} g`;
};
