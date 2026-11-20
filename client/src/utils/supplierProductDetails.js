export const SUPPLIER_PACKAGE_WEIGHT_UNITS = Object.freeze(['g', 'kg']);

export const normalizeSupplierPackageWeight = (value, unit = 'g') => {
  if (value === '' || value === null || value === undefined) return undefined;
  if (!SUPPLIER_PACKAGE_WEIGHT_UNITS.includes(unit)) return undefined;
  const weight = Number(value);
  return Number.isFinite(weight) && weight > 0 ? weight : undefined;
};

export const formatSupplierPackageWeight = (value, unit) => {
  const selectedUnit = unit || 'g';
  const weight = normalizeSupplierPackageWeight(value, selectedUnit);
  if (weight === undefined) return 'Not specified';
  // Calls without a unit are legacy gram values, so keep their previous
  // friendly display while explicit supplier selections remain unchanged.
  if (unit === undefined && weight >= 1000) return `${Number((weight / 1000).toFixed(3))} kg`;
  return `${Number(weight.toFixed(3))} ${selectedUnit}`;
};
