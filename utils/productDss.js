const { normalizeProductCategory } = require('./productCategories');

const list = value => (Array.isArray(value) ? value : String(value || '').split(','))
  .map(item => String(item || '').trim().toLowerCase()).filter(Boolean);
const unique = value => [...new Set(list(value))];
const declared = value => list(value).filter(item => !['not specified', 'unknown', 'n/a'].includes(item));

const normalizeRecommendationProfile = (value = {}, legacy = {}) => ({
  ...value,
  suitableSpecies: unique(value.suitableSpecies?.length ? value.suitableSpecies : (legacy.suitableFor || legacy.intendedSpecies)),
  suitableBreeds: unique(value.suitableBreeds),
  lifeStages: unique(value.lifeStages),
  petSizes: unique(value.petSizes),
  activityLevels: unique(value.activityLevels),
  coatTypes: unique(value.coatTypes),
  skinTypes: unique(value.skinTypes),
  benefits: unique(value.benefits),
  safetyRestrictions: unique(value.safetyRestrictions),
  warnings: unique(value.warnings),
  allergens: unique(value.allergens),
  proteinSources: unique(value.proteinSources),
  dietaryCharacteristics: unique(value.dietaryCharacteristics),
  groomingPurposes: unique(value.groomingPurposes),
  chewingStrengths: unique(value.chewingStrengths),
  activeIngredients: unique(value.activeIngredients),
  intendedPurposes: unique(value.intendedPurposes),
  contraindications: unique(value.contraindications),
  physicalCompatibility: unique(value.physicalCompatibility),
  ingredients: String(value.ingredients || legacy.ingredients || '').trim(),
  nutritionalInformation: String(value.nutritionalInformation || legacy.nutritionalInformation || '').trim(),
  usageInstructions: String(value.usageInstructions || legacy.usageInstructions || '').trim()
});

const categoryGroup = (category, subcategory = '') => {
  const normalized = `${normalizeProductCategory(category) || category || ''} ${subcategory || ''}`.toLowerCase();
  if (/food|treat/.test(normalized)) return 'food';
  if (/groom/.test(normalized)) return 'grooming';
  if (/toy/.test(normalized)) return 'toys';
  if (/accessor|clothing|collar|leash/.test(normalized)) return 'accessories';
  if (/health|medical|supplement|wellness/.test(normalized)) return 'wellness';
  return 'essentials';
};

const calculateDssReadiness = (category, profile = {}, evidence = []) => {
  const issues = [];
  const corrections = [];
  const invalidRange = (minimum, maximum, label) => {
    const hasMinimum = minimum !== undefined && minimum !== null && minimum !== '';
    const hasMaximum = maximum !== undefined && maximum !== null && maximum !== '';
    if (hasMinimum && hasMaximum && Number(minimum) > Number(maximum)) corrections.push(`${label} minimum cannot exceed its maximum.`);
  };
  invalidRange(profile.minAgeMonths, profile.maxAgeMonths, 'Age');
  invalidRange(profile.minWeightKg, profile.maxWeightKg, 'Weight');
  invalidRange(profile.neckMinCm, profile.neckMaxCm, 'Neck measurement');
  invalidRange(profile.chestMinCm, profile.chestMaxCm, 'Chest measurement');
  invalidRange(profile.backLengthMinCm, profile.backLengthMaxCm, 'Back length');
  if (evidence.some(item => item?.reviewStatus === 'needs_correction')) corrections.push('Correct the flagged packaging or nutrition label information.');
  if (evidence.some(item => item?.reviewStatus === 'seller_review_required')) issues.push('Review and confirm the information read from uploaded labels.');
  if (!declared(profile.suitableSpecies).length) issues.push('Add at least one suitable species.');
  if (!profile.allBreeds && !declared(profile.suitableBreeds).length) issues.push('Choose All Breeds or list suitable breeds.');
  if (!list(profile.lifeStages).length) issues.push('Choose at least one life stage.');
  const group = categoryGroup(category, profile.subcategory);
  if (group === 'food') {
    if (!String(profile.ingredients || '').trim()) issues.push('Add ingredients.');
    if (!list(profile.allergens).length) issues.push('Declare allergens or select none.');
  }
  if (group === 'grooming' && !list(profile.coatTypes).length) issues.push('Choose suitable coat types.');
  if (group === 'toys' && !list(profile.petSizes).length) issues.push('Choose suitable pet sizes.');
  if (group === 'accessories' && !list(profile.petSizes).length && !profile.adjustableSizing) issues.push('Add sizes or mark the item adjustable.');
  if (group === 'wellness' && !list(profile.intendedPurposes).length) issues.push('Add the intended purpose.');
  return {
    status: corrections.length ? 'needs_correction' : issues.length ? 'incomplete_information' : 'dss_ready',
    completeness: Math.max(0, Math.round(100 - (issues.length * 15) - (corrections.length * 20))),
    issues: [...corrections, ...issues]
  };
};

module.exports = { calculateDssReadiness, categoryGroup, list, normalizeRecommendationProfile };
