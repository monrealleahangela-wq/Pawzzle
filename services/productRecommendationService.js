const { calculateDssReadiness, categoryGroup, list, normalizeRecommendationProfile } = require('../utils/productDss');
const { normalizePetType } = require('../utils/serviceAdvisorPetContract');

const normalizeSpecies = value => normalizePetType(value) || String(value || '').trim().toLowerCase().replace(/s$/, '');
const normalized = value => String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
const normalizeSize = value => normalized(value).replace('extra large', 'large');
const arrayFromText = value => list(value).filter(item => item !== 'none' && item !== 'not specified');

const ageInMonths = (profile, now = new Date()) => {
  if (profile?.birthday) {
    const birthday = new Date(profile.birthday);
    if (!Number.isNaN(birthday.getTime()) && birthday <= now) {
      return Math.max(0, (now.getTime() - birthday.getTime()) / (30.4375 * 24 * 60 * 60 * 1000));
    }
  }
  if (profile?.approximateAge?.value === undefined || profile?.approximateAge?.value === null || profile?.approximateAge?.value === '') return null;
  const value = Number(profile.approximateAge.value);
  if (!Number.isFinite(value) || value < 0) return null;
  return profile?.approximateAge?.unit === 'months' ? value : value * 12;
};

const lifeStageForProfile = (profile, now = new Date()) => {
  const months = ageInMonths(profile, now);
  if (months === null) return 'unknown';
  if (months < 12) return 'young';
  if (months >= 84) return 'senior';
  return 'adult';
};

const weightKg = profile => {
  if (profile?.weight === undefined || profile?.weight === null || profile?.weight === '') return null;
  const weight = Number(profile?.weight);
  if (!Number.isFinite(weight) || weight <= 0) return null;
  return profile?.weightUnit === 'lb' ? weight * 0.45359237 : weight;
};

const profileFacts = (profile, now) => ({
  ...profile,
  species: normalizeSpecies(profile.type || profile.species),
  breed: normalized(profile.breed),
  lifeStage: lifeStageForProfile(profile, now),
  ageMonths: ageInMonths(profile, now),
  weightKg: weightKg(profile),
  size: normalizeSize(profile.size),
  activityLevel: normalized(profile.activityLevel),
  coatType: normalized(profile.coat?.type || profile.coatType),
  skinType: normalized(profile.skinType),
  allergies: [...arrayFromText(profile.allergies), ...list(profile.foodSensitivities)],
  dietaryPreferences: list(profile.dietaryPreferences),
  healthConcerns: [...list(profile.healthConcerns), ...arrayFromText(profile.medicalConditions)],
  groomingPreferences: arrayFromText(profile.groomingPreferences),
  measurements: profile.bodyMeasurements || {}
});

const intersects = (left, right) => left.some(value => right.includes(value));
const hasNumber = value => value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value));
const hasRange = (minimum, maximum) => hasNumber(minimum) || hasNumber(maximum);
const within = (value, min, max) => value === null || ((!hasNumber(min) || value >= Number(min)) && (!hasNumber(max) || value <= Number(max)));
const activePrice = product => Number(product.price ?? product.retailPrice ?? product.wholesalePrice);

const evaluateProduct = ({ product, pet, budget, now }) => {
  const profile = normalizeRecommendationProfile(product.recommendationProfile || {}, product);
  const readiness = calculateDssReadiness(product.category, profile, product.productEvidence);
  const excluded = [];
  const warnings = [...list(profile.warnings), ...list(profile.safetyRestrictions)];
  const species = list(profile.suitableSpecies).map(normalizeSpecies);
  if (!species.length || (!species.includes('all') && !species.includes(pet.species))) excluded.push('Species suitability is not declared for this pet.');
  if (readiness.status !== 'dss_ready') excluded.push('Product information is incomplete for reliable matching.');
  if (profile.lifeStages?.length && pet.lifeStage === 'unknown') excluded.push('Pet age is needed to confirm life-stage suitability.');
  else if (profile.lifeStages?.length && !list(profile.lifeStages).includes(pet.lifeStage)) excluded.push(`Not intended for the ${pet.lifeStage} life stage.`);
  if (hasRange(profile.minAgeMonths, profile.maxAgeMonths) && pet.ageMonths === null) excluded.push('Pet age is needed to confirm the product age limits.');
  if (!within(pet.ageMonths, profile.minAgeMonths, profile.maxAgeMonths)) excluded.push('Pet age is outside the product limits.');
  if (hasRange(profile.minWeightKg, profile.maxWeightKg) && pet.weightKg === null) excluded.push('Pet weight is needed to confirm the product weight limits.');
  if (!within(pet.weightKg, profile.minWeightKg, profile.maxWeightKg)) excluded.push('Pet weight is outside the product limits.');
  if (profile.petSizes?.length && (!pet.size || pet.size === 'unknown')) excluded.push('Pet size is needed to confirm product fit.');
  else if (profile.petSizes?.length && !list(profile.petSizes).map(normalizeSize).includes(pet.size)) excluded.push('Pet size is outside the declared product sizes.');
  if (!profile.allBreeds && profile.suitableBreeds?.length && !pet.breed) excluded.push('Pet breed is needed to confirm product suitability.');
  else if (!profile.allBreeds && profile.suitableBreeds?.length && !list(profile.suitableBreeds).includes(pet.breed)) excluded.push('Breed is not included in the declared suitability.');
  const group = categoryGroup(product.category, profile.subcategory);
  const measurementRules = [
    ['neckCm', profile.neckMinCm, profile.neckMaxCm, 'neck measurement'],
    ['chestCm', profile.chestMinCm, profile.chestMaxCm, 'chest measurement'],
    ['backLengthCm', profile.backLengthMinCm, profile.backLengthMaxCm, 'back length']
  ];
  if (group === 'accessories') {
    measurementRules.forEach(([field, minimum, maximum, label]) => {
      const petValue = pet.measurements?.[field];
      if (hasRange(minimum, maximum) && !hasNumber(petValue)) excluded.push(`Pet ${label} is needed to confirm product fit.`);
      else if (hasNumber(petValue) && !within(Number(petValue), minimum, maximum)) excluded.push(`Pet ${label} is outside the product fit range.`);
    });
    if (hasNumber(profile.weightCapacityKg) && pet.weightKg === null) excluded.push('Pet weight is needed to confirm product capacity.');
    else if (hasNumber(profile.weightCapacityKg) && pet.weightKg > Number(profile.weightCapacityKg)) {
      excluded.push('Pet weight exceeds the product capacity.');
    }
  }
  const allergens = list(profile.allergens).filter(value => value !== 'none');
  const allergenMatches = pet.allergies.filter(allergy => allergens.some(item => item.includes(allergy) || allergy.includes(item)));
  if (allergenMatches.length) excluded.push(`Contains a declared allergen: ${allergenMatches.join(', ')}.`);
  const contraindications = list(profile.contraindications);
  const contraindicationMatches = pet.healthConcerns.filter(concern => contraindications.some(item => item.includes(concern) || concern.includes(item)));
  if (contraindicationMatches.length) excluded.push('A declared contraindication matches this pet profile.');
  const expiry = product.expiryDate || product.expirationDate;
  if (expiry && new Date(expiry) <= now) excluded.push('Product is expired.');
  const price = activePrice(product);
  if (!Number.isFinite(price) || price <= 0) excluded.push('Product price is unavailable.');
  const withinBudget = price <= budget;

  if (excluded.length) return { eligible: false, excluded, withinBudget };

  let score = 25;
  const reasons = [`Declared suitable for ${pet.species}`];
  if (profile.allBreeds || (pet.breed && list(profile.suitableBreeds).includes(pet.breed))) { score += 10; reasons.push(profile.allBreeds ? 'Suitable for all breeds' : `Matches ${pet.breed}`); }
  if (pet.lifeStage !== 'unknown' && list(profile.lifeStages).includes(pet.lifeStage)) { score += 15; reasons.push(`Matches ${pet.lifeStage} life stage`); }
  if (pet.size !== 'unknown' && list(profile.petSizes).map(normalizeSize).includes(pet.size)) { score += 10; reasons.push(`Matches ${pet.size} size`); }
  if (pet.weightKg !== null && within(pet.weightKg, profile.minWeightKg, profile.maxWeightKg) && (hasNumber(profile.minWeightKg) || hasNumber(profile.maxWeightKg))) { score += 5; reasons.push('Within the declared weight range'); }
  if (pet.activityLevel !== 'unknown' && list(profile.activityLevels).includes(pet.activityLevel)) { score += 8; reasons.push(`Matches ${pet.activityLevel} activity level`); }
  if (pet.coatType !== 'unknown' && list(profile.coatTypes).includes(pet.coatType)) { score += 7; reasons.push(`Matches ${pet.coatType.replace('_', ' ')} coat`); }
  if (pet.skinType !== 'unknown' && list(profile.skinTypes).includes(pet.skinType)) { score += 5; reasons.push(`Matches ${pet.skinType} skin type`); }
  const dietaryMatches = pet.dietaryPreferences.filter(item => list(profile.dietaryCharacteristics).includes(item));
  if (dietaryMatches.length) { score += 8; reasons.push(`Matches ${dietaryMatches.join(', ')} preference`); }
  const benefitMatches = pet.healthConcerns.filter(concern => list(profile.benefits).some(benefit => benefit.includes(concern) || concern.includes(benefit)));
  if (benefitMatches.length) { score += 7; reasons.push(`Relevant declared benefit for ${benefitMatches.join(', ')}`); }
  if (group === 'grooming') {
    const groomingMatches = pet.groomingPreferences.filter(preference => list(profile.groomingPurposes).some(purpose => purpose.includes(preference) || preference.includes(purpose)));
    if (groomingMatches.length) { score += 5; reasons.push(`Matches ${groomingMatches.join(', ')} grooming preference`); }
  }
  if (group === 'accessories') {
    const matchedMeasurements = measurementRules.filter(([field, minimum, maximum]) => (
      hasNumber(pet.measurements?.[field]) && (hasNumber(minimum) || hasNumber(maximum))
        && within(Number(pet.measurements[field]), minimum, maximum)
    ));
    if (matchedMeasurements.length) { score += Math.min(10, matchedMeasurements.length * 4); reasons.push('Matches saved body measurements'); }
  }
  if (group === 'wellness' || profile.requiresVeterinaryGuidance) {
    warnings.push('Health and wellness products are not treatments. Ask a veterinarian before use.');
  }
  return {
    eligible: true,
    withinBudget,
    score: Math.min(100, score),
    reasons,
    warnings: [...new Set(warnings)],
    benefits: list(profile.benefits),
    restrictions: [...new Set([...list(profile.safetyRestrictions), ...list(profile.contraindications)])]
  };
};

const rankProductsForPet = ({ products = [], petProfiles = [], budget, category, limit = 12, now = new Date() }) => {
  const maximumBudget = Number(budget);
  if (!Number.isFinite(maximumBudget) || maximumBudget <= 0) throw Object.assign(new Error('Enter a valid product budget.'), { statusCode: 400 });
  const pet = petProfiles[0] ? profileFacts(petProfiles[0], now) : null;
  if (!pet?.species) return { status: 'no_pet_profiles', budget: maximumBudget, recommendations: [], suitableAlternatives: [] };

  const eligible = [];
  const exclusionSummary = {};
  for (const product of products) {
    if (category && category !== 'all' && categoryGroup(product.category, product.recommendationProfile?.subcategory) !== category && normalized(product.category) !== normalized(category)) continue;
    const result = evaluateProduct({ product, pet, budget: maximumBudget, now });
    if (!result.eligible) {
      result.excluded.forEach(reason => { exclusionSummary[reason] = (exclusionSummary[reason] || 0) + 1; });
      continue;
    }
    eligible.push({ product, ...result });
  }
  eligible.sort((a, b) => b.score - a.score || activePrice(a.product) - activePrice(b.product) || String(a.product._id).localeCompare(String(b.product._id)));
  const recommendations = eligible.filter(item => item.withinBudget).slice(0, limit);
  const suitableAlternatives = eligible.filter(item => !item.withinBudget).slice(0, 4);
  return {
    status: recommendations.length ? 'ready' : eligible.length ? 'budget_mismatch' : 'no_compatible_products',
    budget: maximumBudget,
    selectedPet: { _id: pet._id, name: pet.name, species: pet.species, breed: pet.breed, lifeStage: pet.lifeStage },
    recommendations,
    suitableAlternatives,
    exclusionSummary
  };
};

module.exports = { ageInMonths, evaluateProduct, lifeStageForProfile, normalizeSpecies, rankProductsForPet };
