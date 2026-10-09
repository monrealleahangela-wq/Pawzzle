const contract = require('../client/src/constants/serviceAdvisorQuestionnaire.json');
const {
  PET_SIZES,
  COAT_LENGTHS,
  COAT_TYPES,
  configured,
  evaluateHardEligibility,
  normalizeKnownValue,
  normalizePetSize,
  normalizePetType,
  toProfileSize
} = require('./serviceAdvisorPetContract');

const invalid = message => Object.assign(new Error(message), { statusCode: 400 });
const budgetByValue = new Map(contract.budgetBands.map(option => [option.value, option]));
const needByValue = new Map(contract.serviceNeeds.map(option => [option.value, option]));
const priorityValues = new Set(contract.priorities.map(option => option.value));
const ALLOWED_INPUT_FIELDS = new Set(['budget', 'petType', 'serviceNeed', 'priority', 'petProfileId', 'details']);
const ALLOWED_DETAIL_FIELDS = new Set(['size', 'coatLength', 'coatType']);

const assertPlainObject = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(`${label} must be an object.`);
};

const normalizeDetails = details => {
  if (details === undefined) return {};
  assertPlainObject(details, 'Pet details');
  const unexpected = Object.keys(details).filter(key => !ALLOWED_DETAIL_FIELDS.has(key));
  if (unexpected.length) throw invalid('Pet details contain unsupported fields.');
  const normalized = {};
  if (details.size !== undefined && details.size !== '') {
    const size = normalizePetSize(details.size);
    if (!size || size === 'unknown') throw invalid('Invalid pet size.');
    normalized.size = size;
  }
  if (details.coatLength !== undefined && details.coatLength !== '') {
    const coatLength = normalizeKnownValue(details.coatLength, COAT_LENGTHS);
    if (!coatLength || coatLength === 'unknown') throw invalid('Invalid coat length.');
    normalized.coatLength = coatLength;
  }
  if (details.coatType !== undefined && details.coatType !== '') {
    const coatType = normalizeKnownValue(details.coatType, COAT_TYPES);
    if (!coatType || coatType === 'unknown') throw invalid('Invalid coat type.');
    normalized.coatType = coatType;
  }
  return normalized;
};

const normalizeQuestionnaire = input => {
  assertPlainObject(input, 'Questionnaire');
  const unexpected = Object.keys(input).filter(key => !ALLOWED_INPUT_FIELDS.has(key));
  if (unexpected.length) throw invalid('Questionnaire contains unsupported fields.');
  if (!budgetByValue.has(input.budget)) throw invalid('Select a supported service budget.');
  const petType = normalizePetType(input.petType);
  if (!petType) throw invalid('Select a supported pet type.');
  if (!needByValue.has(input.serviceNeed)) throw invalid('Select a supported service need.');
  if (!priorityValues.has(input.priority)) throw invalid('Select a supported recommendation priority.');
  if (input.petProfileId !== undefined && input.petProfileId !== null
      && (typeof input.petProfileId !== 'string' || input.petProfileId.length > 64)) {
    throw invalid('Invalid pet profile identifier.');
  }
  return {
    budget: input.budget,
    petType,
    serviceNeed: input.serviceNeed,
    priority: input.priority,
    petProfileId: input.petProfileId || null,
    details: normalizeDetails(input.details)
  };
};

const normalizeRequirementsInput = input => {
  assertPlainObject(input, 'Requirements request');
  const unexpected = Object.keys(input).filter(key => !['petType', 'serviceNeed'].includes(key));
  if (unexpected.length) throw invalid('Requirements request contains unsupported fields.');
  const petType = normalizePetType(input.petType);
  if (!petType) throw invalid('Select a supported pet type.');
  if (!needByValue.has(input.serviceNeed)) throw invalid('Select a supported service need.');
  return { petType, serviceNeed: input.serviceNeed };
};

const serviceCategoriesForNeed = serviceNeed => needByValue.get(serviceNeed)?.categories || [];
const serviceNeedLabel = serviceNeed => needByValue.get(serviceNeed)?.label || serviceNeed;
const budgetLabel = budget => budgetByValue.get(budget)?.label || budget;

const valueInBudgetBand = (value, budget) => {
  const band = budgetByValue.get(budget);
  if (!band || !Number.isFinite(value)) return false;
  if (band.flexible) return true;
  if (band.minInclusive !== undefined && value < band.minInclusive) return false;
  if (band.minExclusive !== undefined && value <= band.minExclusive) return false;
  if (band.maxInclusive !== undefined && value > band.maxInclusive) return false;
  if (band.maxExclusive !== undefined && value >= band.maxExclusive) return false;
  return true;
};

const numericValues = values => values.map(Number).filter(Number.isFinite);
const adjustmentRange = values => {
  const safe = numericValues([0, ...values]);
  return { min: Math.min(...safe), max: Math.max(...safe) };
};

const addRange = (price, range) => ({
  minPrice: price.minPrice + range.min,
  maxPrice: price.maxPrice + range.max,
  variable: price.variable || range.min !== range.max
});
const addExact = (price, adjustment) => {
  const value = Number(adjustment);
  const safe = Number.isFinite(value) ? value : 0;
  return { minPrice: price.minPrice + safe, maxPrice: price.maxPrice + safe, variable: price.variable };
};

const resolveAdvisorPrice = (service, pet = {}) => {
  if (service?.price === null || service?.price === undefined || service?.price === '') {
    return { status: 'unknown', basePrice: null, minPrice: null, maxPrice: null, comparablePrice: null };
  }
  const basePrice = Number(service?.price);
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    return { status: 'unknown', basePrice: null, minPrice: null, maxPrice: null, comparablePrice: null };
  }
  let price = { minPrice: basePrice, maxPrice: basePrice, variable: false };
  const rules = service.pricingRules || {};
  const canonicalSize = normalizePetSize(pet.size);
  const profileSize = toProfileSize(canonicalSize);

  if (rules.petSize?.enabled) {
    const sizeMap = {
      Small: Number(rules.petSize.small || 0),
      Medium: Number(rules.petSize.medium || 0),
      Large: Number(rules.petSize.large || 0),
      'Extra Large': Number(rules.petSize.extraLarge || 0)
    };
    price = canonicalSize && canonicalSize !== 'unknown' && profileSize
      ? addExact(price, sizeMap[profileSize])
      : addRange(price, adjustmentRange(Object.values(sizeMap)));
  }

  if (rules.petWeight?.enabled && Array.isArray(rules.petWeight.ranges) && rules.petWeight.ranges.length) {
    let weightKg = Number(pet.weight);
    if (Number.isFinite(weightKg) && pet.weightUnit === 'lb') weightKg *= 0.45359237;
    const range = Number.isFinite(weightKg)
      ? rules.petWeight.ranges.find(item => weightKg >= Number(item.minWeight) && weightKg <= Number(item.maxWeight))
      : null;
    price = Number.isFinite(weightKg)
      ? addExact(price, range?.adjustment || 0)
      : addRange(price, adjustmentRange(rules.petWeight.ranges.map(item => item.adjustment)));
  }

  if (rules.breed?.enabled && Array.isArray(rules.breed.breeds) && rules.breed.breeds.length) {
    const breed = String(pet.breed || '').trim().toLowerCase();
    const match = breed ? rules.breed.breeds.find(item => String(item.breed || '').trim().toLowerCase() === breed) : null;
    price = breed
      ? addExact(price, match?.adjustment || 0)
      : addRange(price, adjustmentRange(rules.breed.breeds.map(item => item.adjustment)));
  }

  if (rules.condition?.enabled && Array.isArray(rules.condition.conditions) && rules.condition.conditions.length) {
    const maximum = numericValues(rules.condition.conditions.map(item => item.fee)).reduce((sum, fee) => sum + Math.max(0, fee), 0);
    price = addRange(price, { min: 0, max: maximum });
  }

  if (rules.timeBased?.enabled) {
    const dayRates = numericValues([rules.timeBased.weekdayRate, rules.timeBased.weekendRate, rules.timeBased.holidayRate]);
    const dayRange = adjustmentRange(dayRates);
    const peak = Math.max(0, Number(rules.timeBased.peakHoursRate) || 0);
    price = addRange(price, { min: dayRange.min, max: dayRange.max + peak });
  }

  return {
    status: price.variable ? 'range' : 'fixed',
    basePrice,
    minPrice: Math.max(0, price.minPrice),
    maxPrice: Math.max(0, price.maxPrice),
    comparablePrice: price.variable ? null : Math.max(0, price.minPrice)
  };
};

const classifyBudget = (pricing, budget) => {
  const band = budgetByValue.get(budget);
  if (!band || pricing.status === 'unknown') return 'unknown';
  if (band.flexible) return 'within_budget';
  if (valueInBudgetBand(pricing.minPrice, budget) && valueInBudgetBand(pricing.maxPrice, budget)) return 'within_budget';
  const upper = band.maxInclusive ?? band.maxExclusive;
  if (upper !== undefined && (band.maxExclusive !== undefined ? pricing.minPrice >= upper : pricing.minPrice > upper)) return 'over_budget';
  return 'outside_budget';
};

const matchedRestrictionCount = (service, pet) => {
  const criteria = service.recommendationCriteria || {};
  return [
    configured(criteria.applicablePetTypes) && criteria.applicablePetTypes.includes(pet.type),
    configured(criteria.applicableSizes) && criteria.applicableSizes.includes(pet.size),
    configured(criteria.coatLengths) && criteria.coatLengths.includes(pet.coat?.length),
    configured(criteria.coatTypes) && criteria.coatTypes.includes(pet.coat?.type)
  ].filter(Boolean).length;
};

const safeServiceResult = (service, pricing, budgetCompatibility, restrictionMatchCount, pet, questionnaire) => {
  const criteria = service.recommendationCriteria || {};
  const explanations = [questionnaire.serviceNeed === 'explore'
    ? 'Matches an eligible Pawzzle service category from your explore request.'
    : `Matches your selected ${serviceNeedLabel(questionnaire.serviceNeed)} service.`];
  if (configured(criteria.applicablePetTypes)) explanations.push(`Supports ${pet.type}s.`);
  else explanations.push('No pet-type restriction is configured.');
  if (configured(criteria.applicableSizes)) explanations.push(`Supports ${String(pet.size).replace(/_/g, ' ')} pets.`);
  if (configured(criteria.coatLengths)) explanations.push(`Supports ${pet.coat.length} coats.`);
  if (configured(criteria.coatTypes)) explanations.push(`Supports ${String(pet.coat.type).replace(/_/g, ' ')} coat types.`);
  if (budgetCompatibility === 'within_budget' && questionnaire.budget !== 'flexible') {
    explanations.push(`Its comparable price fits your ${budgetLabel(questionnaire.budget)} budget.`);
  }
  return {
    service: {
      _id: service._id,
      name: service.name,
      description: service.description,
      category: service.category,
      subCategory: service.subCategory,
      duration: service.duration,
      images: service.images || [],
      store: service.store ? { _id: service.store._id, name: service.store.name, slug: service.store.slug, logo: service.store.logo } : null
    },
    pricing,
    budgetCompatibility,
    restrictionMatchCount,
    explanations
  };
};

const sortResults = (results, priority) => [...results].sort((left, right) => {
  if (priority === 'compatibility' && left.restrictionMatchCount !== right.restrictionMatchCount) {
    return right.restrictionMatchCount - left.restrictionMatchCount;
  }
  if (priority === 'lowest_price') {
    const leftPrice = left.pricing.minPrice ?? Number.POSITIVE_INFINITY;
    const rightPrice = right.pricing.minPrice ?? Number.POSITIVE_INFINITY;
    if (leftPrice !== rightPrice) return leftPrice - rightPrice;
  }
  return String(left.service.name).localeCompare(String(right.service.name))
    || String(left.service._id).localeCompare(String(right.service._id));
});
const omitInternalRanking = results => results.map(({ restrictionMatchCount, ...result }) => result);

const evaluateQuestionnaireServices = ({ services = [], questionnaire, pet }) => {
  const missing = new Map();
  const compatible = [];
  let incompatibleCount = 0;
  for (const service of services) {
    if (service.isActive === false || service.isDeleted === true || service.recommendationCriteria?.enabled !== true) continue;
    const eligibility = evaluateHardEligibility(pet, service.recommendationCriteria || {});
    if (!eligibility.eligible) {
      if (eligibility.missingFields.length) eligibility.missingFields.forEach(item => {
        const field = item.field === 'coat.length' ? 'coatLength' : item.field === 'coat.type' ? 'coatType' : item.field;
        missing.set(field, { ...item, field });
      });
      else incompatibleCount += 1;
      continue;
    }
    const pricing = resolveAdvisorPrice(service, pet);
    const budgetCompatibility = classifyBudget(pricing, questionnaire.budget);
    compatible.push(safeServiceResult(
      service,
      pricing,
      budgetCompatibility,
      matchedRestrictionCount(service, pet),
      pet,
      questionnaire
    ));
  }

  const rankedRecommendations = sortResults(compatible.filter(item => item.budgetCompatibility === 'within_budget'), questionnaire.priority);
  const rankedBudgetAlternatives = sortResults(compatible.filter(item => ['over_budget', 'outside_budget'].includes(item.budgetCompatibility)), questionnaire.priority);
  const rankedPricingUnknown = sortResults(compatible.filter(item => item.budgetCompatibility === 'unknown'), questionnaire.priority);
  let status = 'matches';
  if (!rankedRecommendations.length) {
    if (missing.size) status = 'missing_information';
    else if (rankedPricingUnknown.length) status = 'pricing_unavailable';
    else if (compatible.length) status = 'budget_mismatch';
    else status = 'no_compatible_services';
  }
  return {
    status,
    recommendations: omitInternalRanking(rankedRecommendations),
    budgetAlternatives: omitInternalRanking(rankedBudgetAlternatives),
    pricingUnknown: omitInternalRanking(rankedPricingUnknown),
    missingFields: [...missing.values()],
    summary: { evaluated: services.length, compatible: compatible.length, incompatible: incompatibleCount }
  };
};

const requirementFieldsForServices = (services, petType) => {
  const fields = new Map();
  for (const service of services) {
    const criteria = service.recommendationCriteria || {};
    if (configured(criteria.applicablePetTypes) && !criteria.applicablePetTypes.includes(petType)) continue;
    if (configured(criteria.applicableSizes) || service.pricingRules?.petSize?.enabled === true) {
      fields.set('size', { field: 'size', label: 'Pet size', options: PET_SIZES.filter(value => value !== 'unknown') });
    }
    if (configured(criteria.coatLengths)) fields.set('coatLength', { field: 'coatLength', label: 'Coat length', options: COAT_LENGTHS.filter(value => value !== 'unknown') });
    if (configured(criteria.coatTypes)) fields.set('coatType', { field: 'coatType', label: 'Coat type', options: COAT_TYPES.filter(value => value !== 'unknown') });
  }
  return [...fields.values()];
};

module.exports = {
  contract,
  budgetLabel,
  classifyBudget,
  evaluateQuestionnaireServices,
  normalizeQuestionnaire,
  normalizeRequirementsInput,
  requirementFieldsForServices,
  resolveAdvisorPrice,
  serviceCategoriesForNeed,
  serviceNeedLabel,
  valueInBudgetBand
};
