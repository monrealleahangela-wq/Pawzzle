import {
  filterSupplierCatalogProducts,
  supplierCatalogProductIsAvailable
} from './supplierCatalogFilter';

const products = [
  {
    _id: 'food',
    name: 'Premium Dog Food',
    sku: 'DOG-FOOD',
    category: 'pet_food',
    availableStock: 12
  },
  {
    _id: 'tank',
    name: 'Round Fish Tank',
    sku: 'TANK-01',
    category: 'general_product',
    availableStock: 0
  },
  {
    _id: 'shampoo',
    name: 'Pet Shampoo',
    category: 'pet_care',
    productMode: 'variant',
    variants: [
      { sku: 'SH-LAV-250', isActive: true, availableStock: 0, attributes: [{ valueLabel: 'Lavender' }] },
      { sku: 'SH-UN-500', isActive: true, availableStock: 8, attributes: [{ valueLabel: 'Unscented' }] }
    ]
  }
];

describe('supplier catalog filtering', () => {
  test('searches product names, SKUs, and variant attributes', () => {
    expect(filterSupplierCatalogProducts(products, { search: 'tank-01' }).map(item => item._id)).toEqual(['tank']);
    expect(filterSupplierCatalogProducts(products, { search: 'unscented' }).map(item => item._id)).toEqual(['shampoo']);
  });

  test('filters by category and availability without merging conditions', () => {
    expect(filterSupplierCatalogProducts(products, { category: 'pet_food', availability: 'available' }).map(item => item._id)).toEqual(['food']);
    expect(filterSupplierCatalogProducts(products, { availability: 'unavailable' }).map(item => item._id)).toEqual(['tank']);
  });

  test('returns the full catalog when no filters are selected', () => {
    expect(filterSupplierCatalogProducts(products)).toEqual(products);
  });

  test('uses an active in-stock variant to determine parent availability', () => {
    expect(supplierCatalogProductIsAvailable(products[2])).toBe(true);
    expect(supplierCatalogProductIsAvailable({ productMode: 'variant', variants: [{ isActive: false, availableStock: 10 }] })).toBe(false);
  });
});
