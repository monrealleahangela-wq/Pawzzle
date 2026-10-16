const duplicateIndexName = error => {
  if (error?.index) return String(error.index);
  const match = String(error?.message || '').match(/index:\s+([^\s]+)\s+dup key/i);
  return match?.[1] || '';
};

const hasKeys = (error, expected) => {
  const keys = Object.keys(error?.keyPattern || error?.keyValue || {}).sort();
  return keys.length === expected.length
    && expected.slice().sort().every((key, index) => keys[index] === key);
};

const supplierProductDuplicateResponse = (error, { itemType } = {}) => {
  if (Number(error?.code) !== 11000) return null;

  const index = duplicateIndexName(error);
  if (index === 'supplier_1_sku_1' || hasKeys(error, ['supplier', 'sku'])) {
    return {
      status: 409,
      code: 'SUPPLIER_SKU_EXISTS',
      message: 'A product with this SKU already exists in your supplier catalog.'
    };
  }

  if (index === 'supplier_1_pet_1' || index === 'supplier_live_pet_unique'
      || hasKeys(error, ['supplier', 'pet'])) {
    const actualPetReference = itemType === 'live_pet'
      || (error?.keyValue?.pet !== undefined && error.keyValue.pet !== null);
    if (actualPetReference) {
      return {
        status: 409,
        code: 'SUPPLIER_LIVE_PET_EXISTS',
        message: 'This live pet already has a supplier catalog listing.'
      };
    }
    return {
      status: 503,
      code: 'SUPPLIER_PRODUCT_INDEX_MIGRATION_REQUIRED',
      message: 'Supplier catalog maintenance is required before another product can be added. Please contact the administrator.'
    };
  }

  return {
    status: 409,
    code: 'SUPPLIER_PRODUCT_DUPLICATE',
    message: 'A supplier catalog record with the same unique identifiers already exists.'
  };
};

module.exports = { supplierProductDuplicateResponse };
