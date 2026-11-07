export const normalizePetSaleUnit = pet => {
  const saleUnit = ['single', 'pair', 'group'].includes(pet?.saleUnit) ? pet.saleUnit : 'single';
  const animalsPerUnit = saleUnit === 'single'
    ? 1
    : saleUnit === 'pair'
      ? 2
      : Math.max(3, Number(pet?.animalsPerUnit) || 3);
  return { saleUnit, animalsPerUnit };
};

export const getPetSaleUnitLabel = pet => {
  const { saleUnit, animalsPerUnit } = normalizePetSaleUnit(pet);
  if (saleUnit === 'pair') return 'Pair · 2 animals';
  if (saleUnit === 'group') return `Group · ${animalsPerUnit} animals`;
  return 'Single animal';
};

export const getPetPriceLabel = pet => {
  const { saleUnit, animalsPerUnit } = normalizePetSaleUnit(pet);
  if (saleUnit === 'pair') return 'Price for the pair';
  if (saleUnit === 'group') return `Price for all ${animalsPerUnit} animals`;
  return pet?.listingType === 'adoption' ? 'Adoption fee' : 'Price';
};

export const getPetSaleUnitSubject = pet => {
  const { saleUnit } = normalizePetSaleUnit(pet);
  if (saleUnit === 'pair') return 'this pair';
  if (saleUnit === 'group') return 'this group';
  return 'this animal';
};
