const isSupplierManagedProduct = product => Boolean(product?.supplierProductRef);

const getDirectStockEditIssue = ({ product, requestedQuantity }) => {
  if (Number(requestedQuantity) === Number(product?.stockQuantity || 0)) return null;

  if (isSupplierManagedProduct(product)) {
    return {
      code: 'PURCHASE_ORDER_RECEIVING_REQUIRED',
      message: 'Supplier-sourced stock cannot be edited manually. Repurchase this item and complete receiving inspection to update its stock.'
    };
  }

  if (product?.productMode === 'variant') {
    return {
      code: 'VARIANT_LEDGER_ADJUSTMENT_REQUIRED',
      message: 'Variant stock is managed per exact variant through the inventory ledger.'
    };
  }

  return null;
};

module.exports = {
  isSupplierManagedProduct,
  getDirectStockEditIssue
};
