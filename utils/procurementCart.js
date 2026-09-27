const validateProcurementQuantity = ({ quantity, minimumOrderQuantity, availableStock }) => {
  const value = Number(quantity);
  if (!Number.isInteger(value) || value <= 0) return { valid: false, reason: 'positive_whole_number' };
  if (value < Number(minimumOrderQuantity)) return { valid: false, reason: 'below_minimum' };
  if (value > Number(availableStock)) return { valid: false, reason: 'insufficient_stock' };
  return { valid: true, quantity: value };
};

const groupProcurementItemsBySupplier = items => {
  const groups = new Map();
  for (const item of items) {
    const supplierId = String(item.supplier?._id || item.supplier);
    if (!groups.has(supplierId)) groups.set(supplierId, { supplier: item.supplier, items: [] });
    groups.get(supplierId).items.push(item.orderItem);
  }
  return groups;
};

module.exports = { validateProcurementQuantity, groupProcurementItemsBySupplier };
