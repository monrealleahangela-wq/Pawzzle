const idOf = value => String(value?._id || value || '');

// Only categories with the same meaning in both catalogs are comparable.
const SUPPLY_CATEGORIES = Object.freeze([
  'grooming_supplies', 'medical_supplies', 'cleaning_products', 'accessories',
  'consumables', 'equipment', 'other'
]);

const getSupplyOfferMatchType = ({ serviceSupply, supplierProduct }) => {
  const reviewed = (serviceSupply?.supplierOffers || []).find(offer =>
    idOf(offer.supplierProduct) === idOf(supplierProduct));
  // Legacy singular references are provenance, not proof of an authorized
  // exact-match review for a new procurement order.
  return reviewed?.matchType || null;
};

const getSupplyOfferIssue = ({ serviceSupply, supplierProduct, storeId, matchType }) => {
  if (!serviceSupply || idOf(serviceSupply.store) !== idOf(storeId)
      || serviceSupply.isDeleted || serviceSupply.isActive === false) {
    return 'The service supply is unavailable or belongs to another Store.';
  }
  if (!supplierProduct || supplierProduct.itemType === 'live_pet') return 'Live pets cannot be supply offers.';
  if (!SUPPLY_CATEGORIES.includes(serviceSupply.category)
      || serviceSupply.category !== supplierProduct.category) {
    return 'Service supply and supplier offer categories must match.';
  }
  if (serviceSupply.unitOfMeasure !== supplierProduct.unitOfMeasure) {
    return 'Service supply and supplier offer units must match.';
  }
  if (matchType && !['exact', 'equivalent'].includes(matchType)) return 'Select exact or equivalent match.';
  const existing = getSupplyOfferMatchType({ serviceSupply, supplierProduct });
  if (!matchType && !existing) return 'Review this supplier offer before selecting it.';
  return null;
};

module.exports = { SUPPLY_CATEGORIES, getSupplyOfferMatchType, getSupplyOfferIssue };
