import { formatSupplierPackageWeight, normalizeSupplierPackageWeight } from './supplierProductDetails';

test('normalizes valid supplier package weights without turning an empty field into zero', () => {
  expect(normalizeSupplierPackageWeight('750')).toBe(750);
  expect(normalizeSupplierPackageWeight('')).toBeUndefined();
  expect(normalizeSupplierPackageWeight(0)).toBeUndefined();
  expect(normalizeSupplierPackageWeight(-1)).toBeUndefined();
});

test('formats supplier package weight clearly for product details', () => {
  expect(formatSupplierPackageWeight(750)).toBe('750 g');
  expect(formatSupplierPackageWeight(1500)).toBe('1.5 kg');
  expect(formatSupplierPackageWeight(undefined)).toBe('Not specified');
});
