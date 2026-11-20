const { ageInMonths, rankProductsForPet } = require('./productRecommendationService');
const { normalizeProductCategory } = require('../utils/productCategories');
const { normalizePetType } = require('../utils/serviceAdvisorPetContract');

/* Legacy exports remain for callers and regression tests while the DSS now
 * ranks every supported product category. */
const SPECIES_ALIASES = new Map([
  ['dogs', 'dog'], ['cats', 'cat'], ['birds', 'bird'], ['fishes', 'fish'],
  ['rabbits', 'rabbit'], ['hamsters', 'hamster'], ['reptiles', 'reptile']
]);

const legacyNormalizeSpecies = value => {
  const normalized = normalizePetType(value) || String(value || '').trim().toLowerCase();
  return SPECIES_ALIASES.get(normalized) || normalized;
};

const ageInYears = (profile, now = new Date()) => {
  if (profile?.birthday) {
    const birthday = new Date(profile.birthday);
    if (!Number.isNaN(birthday.getTime()) && birthday <= now) {
      return Math.max(0, (now.getTime() - birthday.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    }
  }
  const rawValue = profile?.approximateAge?.value;
  if (rawValue === null || rawValue === undefined || rawValue === '') return null;
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 0) return null;
  return profile?.approximateAge?.unit === 'months' ? value / 12 : value;
};

const lifeStageForProfile = (profile, now = new Date()) => {
  const years = ageInYears(profile, now);
  if (years === null) return 'unknown';
  if (years < 1) return 'young';
  if (years >= 7) return 'senior';
  return 'adult';
};

const productText = product => [
  product?.name,
  product?.shortDescription,
  product?.description,
  product?.collectionGroup,
  ...(product?.tags || [])
].filter(Boolean).join(' ').toLowerCase();

const declaredLifeStages = product => {
  const text = productText(product);
  const stages = new Set();
  if (/\b(puppy|kitten|young|growth)\b/.test(text)) stages.add('young');
  if (/\b(adult)\b/.test(text)) stages.add('adult');
  if (/\b(senior|mature|ageing|aging)\b/.test(text)) stages.add('senior');
  return stages;
};

const suitableSpecies = product => (product?.suitableFor || [])
  .map(legacyNormalizeSpecies)
  .filter(Boolean);

const compareRankedItems = (left, right) => (
  right.score - left.score
  || Number(left.product.price || 0) - Number(right.product.price || 0)
  || Number(right.product.ratings?.average || 0) - Number(left.product.ratings?.average || 0)
  || String(left.product._id).localeCompare(String(right.product._id))
);

const rankPetFoodProducts = ({ products = [], petProfiles = [], budget, limit = 6, now = new Date() }) => {
  const maximumBudget = Number(budget);
  if (!Number.isFinite(maximumBudget) || maximumBudget <= 0) {
    throw Object.assign(new Error('Enter a valid product budget.'), { statusCode: 400 });
  }

  if (products.some(product => product.recommendationProfile)) {
    const result = rankProductsForPet({ products, petProfiles, budget, limit, now, category: 'food' });
    return { ...result, budgetAlternatives: result.suitableAlternatives };
  }
  const profiles = petProfiles.map(profile => ({
    ...profile,
    normalizedType: legacyNormalizeSpecies(profile.type || profile.species),
    lifeStage: lifeStageForProfile(profile, now)
  })).filter(profile => profile.normalizedType);

  if (!profiles.length) {
    return { status: 'no_pet_profiles', budget: maximumBudget, recommendations: [], budgetAlternatives: [] };
  }

  const compatible = [];
  for (const product of products) {
    if (normalizeProductCategory(product?.category) !== 'Pet Food') continue;
    const species = suitableSpecies(product);
    if (!species.length) continue;

    const matchedProfiles = profiles.filter(profile => species.includes('all') || species.includes(profile.normalizedType));
    if (!matchedProfiles.length) continue;

    const stages = declaredLifeStages(product);
    const stageMatches = matchedProfiles.filter(profile => stages.size === 0 || profile.lifeStage === 'unknown' || stages.has(profile.lifeStage));
    if (stages.size > 0 && !stageMatches.length) continue;
    const eligibleProfiles = stages.size > 0 ? stageMatches : matchedProfiles;

    const price = Number(product.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const withinBudget = price <= maximumBudget;
    const exactSpecies = eligibleProfiles.some(profile => species.includes(profile.normalizedType));
    const hasKnownStageMatch = stages.size > 0 && stageMatches.some(profile => profile.lifeStage !== 'unknown');
    const score = Math.min(100,
      (exactSpecies ? 65 : 55)
      + (withinBudget ? 25 : 0)
      + (hasKnownStageMatch ? 10 : stages.size === 0 ? 5 : 0)
    );
    const matchedPetNames = eligibleProfiles.map(profile => profile.name).filter(Boolean);
    const reasons = [
      exactSpecies
        ? `Suitable for ${[...new Set(eligibleProfiles.map(profile => profile.normalizedType))].join(' and ')}`
        : 'Suitable for all listed pet types',
      withinBudget ? `Within the ₱${maximumBudget.toLocaleString('en-PH')} budget` : `Above the ₱${maximumBudget.toLocaleString('en-PH')} budget`
    ];
    if (hasKnownStageMatch) {
      reasons.push(`Matches ${[...new Set(stageMatches.map(profile => profile.lifeStage).filter(stage => stage !== 'unknown'))].join(' or ')} life stage`);
    }
    if (matchedPetNames.length) reasons.push(`Matched to ${matchedPetNames.join(', ')}`);

    compatible.push({ product, score, withinBudget, matchedPetNames, reasons });
  }

  compatible.sort(compareRankedItems);
  const recommendations = compatible.filter(item => item.withinBudget).slice(0, limit);
  const budgetAlternatives = compatible.filter(item => !item.withinBudget).slice(0, 3);
  return {
    status: recommendations.length ? 'ready' : compatible.length ? 'budget_mismatch' : 'no_compatible_food',
    budget: maximumBudget,
    recommendations,
    budgetAlternatives
  };
};

module.exports = {
  ageInYears,
  declaredLifeStages,
  lifeStageForProfile,
  ageInMonths,
  normalizeSpecies: legacyNormalizeSpecies,
  rankPetFoodProducts
};
