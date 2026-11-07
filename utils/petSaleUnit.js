const PET_SALE_UNITS = Object.freeze(['single', 'pair', 'group']);
const MAX_ANIMALS_PER_SALE_UNIT = 1000;

const saleUnitError = message => Object.assign(new Error(message), { statusCode: 400 });

const normalizePetSaleUnit = (input = {}, fallback = {}) => {
  const saleUnit = input.saleUnit ?? fallback.saleUnit ?? 'single';
  if (!PET_SALE_UNITS.includes(saleUnit)) {
    throw saleUnitError('Selling method must be single animal, pair, or group.');
  }

  let animalsPerUnit;
  if (saleUnit === 'single') animalsPerUnit = 1;
  else if (saleUnit === 'pair') animalsPerUnit = 2;
  else {
    const rawCount = input.animalsPerUnit ?? fallback.animalsPerUnit;
    animalsPerUnit = Number(rawCount);
    if (!Number.isInteger(animalsPerUnit) || animalsPerUnit < 3 || animalsPerUnit > MAX_ANIMALS_PER_SALE_UNIT) {
      throw saleUnitError(`A group must contain between 3 and ${MAX_ANIMALS_PER_SALE_UNIT} animals.`);
    }
  }

  return { saleUnit, animalsPerUnit };
};

const describePetSaleUnit = (pet = {}) => {
  const { saleUnit, animalsPerUnit } = normalizePetSaleUnit(pet);
  if (saleUnit === 'pair') return 'Pair (2 animals)';
  if (saleUnit === 'group') return `Group (${animalsPerUnit} animals)`;
  return 'Single animal';
};

const getPetSaleUnitSnapshot = (pet = {}) => {
  const { saleUnit, animalsPerUnit } = normalizePetSaleUnit(pet);
  return {
    saleUnit,
    animalsPerUnit,
    label: describePetSaleUnit({ saleUnit, animalsPerUnit }),
    price: Number(pet.price),
    capturedAt: new Date()
  };
};

module.exports = {
  MAX_ANIMALS_PER_SALE_UNIT,
  PET_SALE_UNITS,
  describePetSaleUnit,
  getPetSaleUnitSnapshot,
  normalizePetSaleUnit
};
