const contract = require('../client/src/constants/serviceAdvisorPetContract.json');

const normalizeToken = value => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
const values = options => options.map(option => option.value);
const makeAliasMap = options => new Map(options.flatMap(option => (
  (option.aliases || [option.value]).map(alias => [normalizeToken(alias), option.value])
)));

const PET_TYPES = values(contract.petTypes);
const PET_SIZES = values(contract.sizes);
const PET_PROFILE_SIZES = contract.sizes.map(option => option.profileValue);
const COAT_LENGTHS = values(contract.coatLengths);
const COAT_TYPES = values(contract.coatTypes);
const SERVICE_NEEDS = values(contract.serviceNeeds);
const PET_TYPE_ALIASES = makeAliasMap(contract.petTypes);

const normalizePetType = value => PET_TYPE_ALIASES.get(normalizeToken(value)) || null;
const normalizePetSize = value => {
  const normalized = normalizeToken(value);
  return PET_SIZES.includes(normalized) ? normalized : null;
};
const toProfileSize = value => contract.sizes.find(option => option.value === normalizePetSize(value))?.profileValue || null;
const normalizeKnownValue = (value, allowed) => {
  const normalized = normalizeToken(value);
  return allowed.includes(normalized) ? normalized : null;
};

const configured = list => Array.isArray(list) && list.length > 0 && !list.includes('any');

const evaluateHardEligibility = (pet = {}, criteria = {}) => {
  const petType = normalizePetType(pet.type);
  const size = normalizePetSize(pet.size);
  const coatLength = normalizeKnownValue(pet.coat?.length, COAT_LENGTHS);
  const coatType = normalizeKnownValue(pet.coat?.type, COAT_TYPES);
  const missingFields = [];

  const evaluate = (field, label, petValue, accepted) => {
    if (!configured(accepted)) return true;
    if (!petValue || petValue === 'unknown') {
      missingFields.push({ field, label });
      return false;
    }
    return accepted.includes(petValue);
  };

  const checks = [
    evaluate('type', 'species', petType, criteria.applicablePetTypes),
    evaluate('size', 'size', size, criteria.applicableSizes),
    evaluate('coat.length', 'coat length', coatLength, criteria.coatLengths),
    evaluate('coat.type', 'coat type', coatType, criteria.coatTypes)
  ];
  const eligible = checks.every(Boolean);

  return { eligible, missingFields, normalized: { petType, size, coatLength, coatType } };
};

const profileCompleteness = (pet, services = []) => {
  const missing = new Map();
  const blocking = new Map();
  let blockedServiceCount = 0;
  const normalizedPetType = normalizePetType(pet?.type);
  const normalizedSize = normalizePetSize(pet?.size);
  const normalizedCoatLength = normalizeKnownValue(pet?.coat?.length, COAT_LENGTHS);
  const normalizedCoatType = normalizeKnownValue(pet?.coat?.type, COAT_TYPES);
  const knownNeeds = (pet?.serviceNeeds || []).filter(value => value !== 'not_sure' && SERVICE_NEEDS.includes(value));
  const preferredServiceType = String(pet?.servicePreferences?.preferredServiceType || '').trim();
  if (!normalizedPetType) missing.set('type', { field: 'type', label: 'species' });
  for (const service of services) {
    const criteria = service.recommendationCriteria || {};
    const assessment = evaluateHardEligibility(pet, criteria);
    if (assessment.missingFields.length) blockedServiceCount += 1;
    assessment.missingFields.forEach(item => {
      missing.set(item.field, item);
      blocking.set(item.field, item);
    });
    if (criteria.applicableSizes?.length && (!normalizedSize || normalizedSize === 'unknown')) missing.set('size', { field: 'size', label: 'size' });
    if (criteria.coatLengths?.length && (!normalizedCoatLength || normalizedCoatLength === 'unknown')) missing.set('coat.length', { field: 'coat.length', label: 'coat length' });
    if (criteria.coatTypes?.length && (!normalizedCoatType || normalizedCoatType === 'unknown')) missing.set('coat.type', { field: 'coat.type', label: 'coat type' });
    if (criteria.relevantNeeds?.length && !knownNeeds.length) missing.set('serviceNeeds', { field: 'serviceNeeds', label: 'current service needs' });
    if (criteria.preferenceTags?.length && !preferredServiceType) missing.set('servicePreferences.preferredServiceType', { field: 'servicePreferences.preferredServiceType', label: 'service preference' });
  }
  return {
    complete: missing.size === 0,
    missingFields: [...missing.values()],
    blockingFields: [...blocking.values()],
    blockedServiceCount,
    evaluatedServiceCount: services.length
  };
};

const invalid = message => Object.assign(new Error(message), { statusCode: 400 });
const normalizeList = (input, field, allowed, { universal = false, normalizeValue = normalizeToken } = {}) => {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) throw invalid(`${field} must be a list.`);
  const normalized = [...new Set(input.map(normalizeValue).filter(Boolean))];
  if (normalized.some(value => !allowed.includes(value))) throw invalid(`Invalid ${field} value.`);
  if (universal && (!normalized.length || normalized.includes('any'))) return ['any'];
  return normalized;
};

const normalizeRecommendationCriteria = input => {
  if (input === undefined) return undefined;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Recommendation criteria must be an object.');
  const normalized = {
    enabled: input.enabled === true,
    applicablePetTypes: normalizeList(input.applicablePetTypes, 'pet type', ['any', ...PET_TYPES], {
      universal: true,
      normalizeValue: value => normalizeToken(value) === 'any' ? 'any' : (normalizePetType(value) || normalizeToken(value))
    }) || ['any'],
    applicableSizes: normalizeList(input.applicableSizes, 'pet size', ['any', ...PET_SIZES.filter(value => value !== 'unknown')], { universal: true }) || ['any'],
    coatLengths: normalizeList(input.coatLengths, 'coat length', ['any', ...COAT_LENGTHS.filter(value => value !== 'unknown')], { universal: true }) || ['any'],
    coatTypes: normalizeList(input.coatTypes, 'coat type', ['any', ...COAT_TYPES.filter(value => value !== 'unknown')], { universal: true }) || ['any'],
    relevantNeeds: normalizeList(input.relevantNeeds, 'service need', SERVICE_NEEDS) || [],
    preferenceTags: Array.isArray(input.preferenceTags)
      ? [...new Set(input.preferenceTags.map(value => String(value || '').trim().toLowerCase()).filter(Boolean))]
      : [],
    useCompletedHistory: input.useCompletedHistory === true
  };
  if (normalized.preferenceTags.some(value => value.length > 80)) throw invalid('Preference tags must be 80 characters or fewer.');
  return normalized;
};

module.exports = {
  contract,
  PET_TYPES,
  PET_SIZES,
  PET_PROFILE_SIZES,
  COAT_LENGTHS,
  COAT_TYPES,
  SERVICE_NEEDS,
  configured,
  normalizePetType,
  normalizePetSize,
  toProfileSize,
  normalizeKnownValue,
  evaluateHardEligibility,
  profileCompleteness,
  normalizeRecommendationCriteria
};
