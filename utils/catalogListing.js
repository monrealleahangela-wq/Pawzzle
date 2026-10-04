const {
  PET_SPECIES,
  PET_SIZES
} = require('./petListingAttributes');

const MAX_CATALOG_IMAGES = 10;
const PRODUCT_WEIGHT_UNITS = ['g', 'kg'];

const invalid = message => Object.assign(new Error(message), { statusCode: 400 });

const escapeRegex = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isCatalogImageReference = value => {
  if (typeof value !== 'string') return false;
  const reference = value.trim();
  if (!reference || reference.length > 2048 || /^data:/i.test(reference) || /^javascript:/i.test(reference)) return false;
  return /^https?:\/\//i.test(reference) || /^\/?[a-z0-9][a-z0-9_./?&=%+#:@~-]*$/i.test(reference);
};

const normalizeCatalogImages = (images, { required = false } = {}) => {
  if (images === undefined) {
    if (required) throw invalid('At least one image is required.');
    return undefined;
  }
  if (!Array.isArray(images)) throw invalid('Images must be provided as a list.');
  const normalized = [...new Set(images.map(value => typeof value === 'string' ? value.trim() : value))];
  if (required && normalized.length === 0) throw invalid('At least one image is required.');
  if (normalized.length > MAX_CATALOG_IMAGES) throw invalid(`A maximum of ${MAX_CATALOG_IMAGES} images is allowed.`);
  if (normalized.some(value => !isCatalogImageReference(value))) throw invalid('Each image must be a valid uploaded image reference.');
  return normalized;
};

const normalizeProductWeight = (weight, weightUnit) => {
  if (weight === undefined || weight === null || weight === '') {
    return { weight: undefined, weightUnit: undefined };
  }
  const parsed = Number(weight);
  const unit = weightUnit || 'kg';
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10000) {
    throw invalid('Package weight must be greater than zero and no more than 10,000 kg/g.');
  }
  if (!PRODUCT_WEIGHT_UNITS.includes(unit)) throw invalid('Package weight unit must be g or kg.');
  return { weight: parsed, weightUnit: unit };
};

const parseOptionalNumber = (value, label, { min = 0 } = {}) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) throw invalid(`${label} is invalid.`);
  return parsed;
};

const publicPetContextClause = {
  $or: [
    { listingContext: 'marketplace' },
    { listingContext: { $exists: false } },
    { listingContext: null }
  ]
};

const publicPetSaleClause = {
  $or: [
    { listingType: 'sale' },
    { listingType: { $exists: false } },
    { listingType: null }
  ]
};

const individualPetClause = {
  $or: [{ quantity: { $exists: false } }, { quantity: null }, { quantity: 1 }]
};

const buildPublicPetFilter = (query = {}, storeIds = [], options = {}) => {
  const conditions = [
    { isDeleted: { $ne: true } },
    options.ownership || { store: { $in: storeIds } },
    publicPetContextClause,
    publicPetSaleClause,
    individualPetClause
  ];

  if (query.isAvailable === true || query.isAvailable === 'true') {
    conditions.push({ isAvailable: true }, { status: 'available' });
  } else if (query.isAvailable === false || query.isAvailable === 'false') {
    conditions.push({ $or: [{ isAvailable: false }, { status: { $ne: 'available' } }] });
  }

  if (query.species) {
    if (!PET_SPECIES.includes(query.species)) throw invalid('Invalid species filter.');
    conditions.push({ species: query.species });
  }
  if (query.size) {
    if (!PET_SIZES.includes(query.size)) throw invalid('Invalid size filter.');
    conditions.push({ size: query.size });
  }
  if (query.gender) {
    if (!['male', 'female'].includes(query.gender)) throw invalid('Invalid gender filter.');
    conditions.push({ gender: query.gender });
  }
  if (query.breed) conditions.push({ breed: { $regex: escapeRegex(query.breed), $options: 'i' } });

  const minPrice = parseOptionalNumber(query.minPrice, 'Minimum price');
  const maxPrice = parseOptionalNumber(query.maxPrice, 'Maximum price');
  if (minPrice !== undefined || maxPrice !== undefined) {
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) throw invalid('Minimum price cannot exceed maximum price.');
    conditions.push({ price: {
      ...(minPrice !== undefined ? { $gte: minPrice } : {}),
      ...(maxPrice !== undefined ? { $lte: maxPrice } : {})
    } });
  }

  const minAge = parseOptionalNumber(query.minAge, 'Minimum age');
  const maxAge = parseOptionalNumber(query.maxAge, 'Maximum age');
  if (minAge !== undefined || maxAge !== undefined) {
    if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) throw invalid('Minimum age cannot exceed maximum age.');
    const ageInYears = {
      $cond: [{ $eq: ['$ageUnit', 'months'] }, { $divide: ['$age', 12] }, '$age']
    };
    conditions.push({ $expr: {
      $and: [
        ...(minAge !== undefined ? [{ $gte: [ageInYears, minAge] }] : []),
        ...(maxAge !== undefined ? [{ $lte: [ageInYears, maxAge] }] : [])
      ]
    } });
  }

  const search = String(query.search || '').trim();
  if (search) {
    if (search.length > 100) throw invalid('Search text is too long.');
    const pattern = escapeRegex(search);
    conditions.push({ $or: [
      { name: { $regex: pattern, $options: 'i' } },
      { breed: { $regex: pattern, $options: 'i' } },
      { description: { $regex: pattern, $options: 'i' } }
    ] });
  }

  return { $and: conditions };
};

const isMarketplacePet = pet => (
  (!pet?.listingContext || pet.listingContext === 'marketplace')
  && (!pet?.listingType || pet.listingType === 'sale')
  && (pet?.quantity === undefined || pet?.quantity === null || pet?.quantity === 1)
  && pet?.isDeleted !== true
);

const toRadians = value => value * Math.PI / 180;
const distanceKm = (origin, destination) => {
  const lat1 = Number(origin?.lat);
  const lng1 = Number(origin?.lng);
  const lat2 = Number(destination?.lat);
  const lng2 = Number(destination?.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

const filterStoresByDistance = (stores, origin, radiusKm = 5) => stores.filter(store => (
  distanceKm(origin, store?.contactInfo?.address?.coordinates) <= radiusKm
));

module.exports = {
  MAX_CATALOG_IMAGES,
  PRODUCT_WEIGHT_UNITS,
  buildPublicPetFilter,
  distanceKm,
  escapeRegex,
  filterStoresByDistance,
  individualPetClause,
  isCatalogImageReference,
  isMarketplacePet,
  normalizeCatalogImages,
  normalizeProductWeight,
  publicPetContextClause,
  publicPetSaleClause
};
