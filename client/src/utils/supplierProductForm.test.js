import {
  prepareSupplierProductPayload,
  supplierProductNumberInputValue
} from './supplierProductForm';

const simpleProduct = overrides => ({
  productMode: 'simple',
  itemType: 'pet_supply',
  wholesalePrice: '125.50',
  availableStock: '20',
  minimumOrderQuantity: '2',
  deliveryLeadTimeDays: '3',
  variants: [],
  ...overrides
});

describe('supplier product numeric fields', () => {
  it('keeps an emptied controlled number input blank while the supplier types', () => {
    expect(supplierProductNumberInputValue('')).toBe('');
    expect(supplierProductNumberInputValue(undefined)).toBe('');
    expect(supplierProductNumberInputValue(0)).toBe(0);
  });

  it('converts valid simple-product input strings to API numbers', () => {
    const result = prepareSupplierProductPayload(simpleProduct());

    expect(result.error).toBeNull();
    expect(result.payload).toEqual(expect.objectContaining({
      wholesalePrice: 125.5,
      availableStock: 20,
      minimumOrderQuantity: 2,
      deliveryLeadTimeDays: 3
    }));
  });

  it.each([
    ['wholesalePrice', '', 'Enter the wholesale price.'],
    ['availableStock', '', 'Enter available stock.'],
    ['minimumOrderQuantity', '', 'Enter minimum order quantity.'],
    ['deliveryLeadTimeDays', '', 'Enter delivery lead time.']
  ])('rejects a blank %s instead of silently changing it to zero', (field, value, message) => {
    const result = prepareSupplierProductPayload(simpleProduct({ [field]: value }));

    expect(result.payload).toBeUndefined();
    expect(result.error).toBe(message);
  });

  it('normalizes every variant numeric field without changing optional blank weight', () => {
    const result = prepareSupplierProductPayload(simpleProduct({
      productMode: 'variant',
      variants: [{
        sku: 'FOOD-CHICKEN-1KG',
        attributes: [{ code: 'flavor', valueLabel: 'Chicken' }],
        wholesalePrice: '120.25',
        availableStock: '15',
        minimumOrderQuantity: '3',
        weight: ''
      }]
    }));

    expect(result.error).toBeNull();
    expect(result.payload.variants[0]).toEqual(expect.objectContaining({
      wholesalePrice: 120.25,
      availableStock: 15,
      minimumOrderQuantity: 3
    }));
    expect(result.payload.variants[0]).not.toHaveProperty('weight');
  });

  it('requires a live-pet age but keeps zero as a valid value', () => {
    const missing = prepareSupplierProductPayload(simpleProduct({
      itemType: 'live_pet',
      pet: { age: '' }
    }));
    const newborn = prepareSupplierProductPayload(simpleProduct({
      itemType: 'live_pet',
      pet: { age: '0' }
    }));

    expect(missing.error).toBe('Enter the pet age.');
    expect(newborn.error).toBeNull();
    expect(newborn.payload.pet.age).toBe(0);
    expect(newborn.payload.availableStock).toBe(1);
    expect(newborn.payload.minimumOrderQuantity).toBe(1);
  });
});
