const Order = require('../models/Order');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');
const DSSRecommendation = require('../models/DSSRecommendation');
const { getActiveSupplierFilter } = require('../utils/supplierLifecycle');

const DAY_MS = 86400000;
const round = (value, places = 2) => Number(Number(value || 0).toFixed(places));
const clamp = (value, minimum = 0, maximum = 100) => Math.min(maximum, Math.max(minimum, Number(value || 0)));
const confidenceLabel = confidence => confidence >= 0.75 ? 'high' : confidence >= 0.45 ? 'moderate' : 'limited';

// Seller demand compares adjacent 30-day periods. Six demand events are
// required before a direction is stated, and a 20% change must be exceeded to
// leave the stable band. This prevents isolated activity becoming a trend.
const SELLER_DEMAND_POLICY = Object.freeze({
  periodDays: 30,
  minimumObservations: 6,
  changeThresholdPercent: 20
});

const entityId = value => String(value?._id || value?.id || value || '');
const eventDate = value => new Date(value?.createdAt || value?.bookingDate || 0);
const classifyDemandTrend = ({ current = 0, previous = 0, observations = 0 } = {}, policy = SELLER_DEMAND_POLICY) => {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);
  const sampleSize = Number(observations || 0);
  const sufficient = sampleSize >= policy.minimumObservations;
  const changePercent = previousValue > 0
    ? round(((currentValue - previousValue) / previousValue) * 100, 1)
    : currentValue > 0 ? 100 : 0;
  let classification = 'insufficient_data';
  if (sufficient) {
    if (previousValue === 0 && currentValue > 0) classification = 'increasing';
    else if (changePercent >= policy.changeThresholdPercent) classification = 'increasing';
    else if (changePercent <= -policy.changeThresholdPercent) classification = 'declining';
    else classification = 'stable';
  }
  const confidence = sufficient
    ? round(Math.min(0.95, 0.4 + sampleSize / 50), 2)
    : round(Math.min(0.39, sampleSize / policy.minimumObservations * 0.39), 2);
  return {
    classification,
    current: round(currentValue),
    previous: round(previousValue),
    changePercent,
    observations: sampleSize,
    sufficient,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    why: sufficient
      ? `${round(currentValue)} recorded demand units/events in the latest ${policy.periodDays} days versus ${round(previousValue)} in the preceding ${policy.periodDays} days.`
      : `Only ${sampleSize} recorded demand event${sampleSize === 1 ? '' : 's'} are available; at least ${policy.minimumObservations} are required to classify a trend.`
  };
};

// Direct customer constraints (purchase budget, space, and companion style)
// receive the greatest weight. Housing permission remains material, while
// activity, care, household, and optional pet preferences refine the result.
// Unknown dimensions are excluded from the denominator and surfaced through
// evidence coverage instead of being assigned invented neutral values.
const PET_MATCH_WEIGHTS = Object.freeze({
  purchaseBudget: 20,
  space: 20,
  housing: 15,
  lifestyle: 20,
  activity: 10,
  care: 5,
  household: 5,
  petPreference: 5
});
const PET_MATCH_OPTIONS = Object.freeze({
  monthlyBudget: ['under_1000', '1000_3000', '3000_5000', '5000_10000', 'above_10000', 'not_sure'],
  purchaseBudget: ['under_5000', '5000_10000', '10000_25000', 'above_25000', 'not_sure'],
  space: ['limited_room', 'apartment', 'small_house', 'medium_house', 'large_house', 'outdoor_space', 'not_sure'],
  homeOwnership: ['own', 'rent', 'family', 'other'],
  livingArrangement: ['alone', 'family', 'shared', 'other'],
  housingType: ['house', 'apartment', 'other'],
  petRestrictions: ['allowed', 'restricted', 'not_sure', 'not_allowed'],
  existingPets: ['none', 'dogs', 'cats', 'other', 'multiple'],
  lifestyle: ['calm', 'energetic', 'affectionate', 'independent', 'social', 'outdoor', 'low_maintenance', 'grooming', 'training', 'interactive'],
  species: ['dog', 'cat', 'bird', 'fish', 'rabbit', 'hamster', 'reptile', 'other'],
  sizes: ['small', 'medium', 'large', 'extra_large']
});
const PURCHASE_BUDGET_MAX = Object.freeze({ under_5000: 5000, '5000_10000': 10000, '10000_25000': 25000, above_25000: Infinity });
const TEMPERAMENT_EVIDENCE = Object.freeze({
  calm: ['calm', 'quiet', 'gentle', 'relaxed'],
  energetic: ['playful', 'energetic', 'active', 'lively'],
  affectionate: ['affectionate', 'cuddly', 'loving'],
  independent: ['independent', 'self-reliant'],
  social: ['social', 'outgoing', 'friendly'],
  outdoor: ['outdoor', 'active', 'energetic'],
  interactive: ['interactive', 'engaging', 'social', 'playful']
});

const normalizeChoice = value => String(value || '').trim().toLowerCase();
const uniqueAllowed = (values, allowed) => [...new Set((Array.isArray(values) ? values : []).map(normalizeChoice).filter(value => allowed.includes(value)))];
const includesEvidence = (text, words) => words.some(word => text.includes(word));
const petMatchPart = (criterion, label, weight, evaluated, ratio, explanation) => ({
  criterion,
  label,
  weight,
  evaluated: Boolean(evaluated),
  score: evaluated ? round(clamp(ratio, 0, 1) * 100, 0) : null,
  contribution: evaluated ? round(weight * clamp(ratio, 0, 1), 2) : 0,
  explanation
});

const validatePetMatchPreferences = input => {
  const source = input && typeof input === 'object' ? input : {};
  const value = {
    monthlyBudget: normalizeChoice(source.monthlyBudget),
    purchaseBudget: normalizeChoice(source.purchaseBudget),
    space: normalizeChoice(source.space),
    homeOwnership: normalizeChoice(source.homeOwnership),
    livingArrangement: normalizeChoice(source.livingArrangement),
    housingType: normalizeChoice(source.housingType),
    petRestrictions: normalizeChoice(source.petRestrictions),
    existingPets: normalizeChoice(source.existingPets),
    lifestyle: uniqueAllowed(source.lifestyle, PET_MATCH_OPTIONS.lifestyle),
    preferredSpecies: uniqueAllowed(source.preferredSpecies, PET_MATCH_OPTIONS.species),
    preferredSizes: uniqueAllowed(source.preferredSizes, PET_MATCH_OPTIONS.sizes)
  };
  const errors = [];
  for (const key of ['monthlyBudget', 'purchaseBudget', 'space', 'homeOwnership', 'livingArrangement', 'housingType', 'petRestrictions', 'existingPets']) {
    if (!PET_MATCH_OPTIONS[key].includes(value[key])) errors.push(`${key} is invalid.`);
  }
  for (const [key, allowed] of [['lifestyle', PET_MATCH_OPTIONS.lifestyle], ['preferredSpecies', PET_MATCH_OPTIONS.species], ['preferredSizes', PET_MATCH_OPTIONS.sizes]]) {
    if (source[key] !== undefined && (!Array.isArray(source[key]) || source[key].some(item => !allowed.includes(normalizeChoice(item))))) {
      errors.push(`${key} contains an invalid selection.`);
    }
  }
  if (!value.lifestyle.length) errors.push('Select at least one lifestyle preference.');
  if (Array.isArray(source.lifestyle) && source.lifestyle.length > 10) errors.push('Select no more than ten lifestyle preferences.');
  return { value, errors };
};

const listingCompatibility = (pet, preferences, householdPets = []) => {
  const parts = [];
  const reasons = [];
  const considerations = [];
  const unknowns = [];
  const temperament = normalizeChoice(pet.temperament);
  const temperamentTraits = uniqueAllowed(pet.temperamentTraits, PET_MATCH_OPTIONS.lifestyle);
  const activityLevel = normalizeChoice(pet.activityLevel);
  const size = normalizeChoice(pet.size);
  const price = Number(pet.price);
  const hasStructuredTemperament = temperamentTraits.length > 0;
  const hasKnownActivity = ['low', 'moderate', 'high'].includes(activityLevel);
  const hasTemperamentEvidence = hasStructuredTemperament || Boolean(temperament);
  const matchesTemperament = key => hasStructuredTemperament
    ? temperamentTraits.includes(key)
    : includesEvidence(temperament, TEMPERAMENT_EVIDENCE[key] || []);

  const purchaseMaximum = PURCHASE_BUDGET_MAX[preferences.purchaseBudget];
  const budgetEvaluated = Number.isFinite(price) && purchaseMaximum !== undefined;
  const budgetMatched = budgetEvaluated && price <= purchaseMaximum;
  parts.push(petMatchPart('purchaseBudget', 'Listing price compatibility', PET_MATCH_WEIGHTS.purchaseBudget, budgetEvaluated, budgetMatched ? 1 : 0,
    budgetEvaluated
      ? budgetMatched ? 'The listed purchase price is within your selected maximum listing-price band.' : 'The listed purchase price exceeds your selected maximum listing-price band.'
      : 'Listing-price compatibility could not be evaluated from the selected preference and available listing data.'));
  if (budgetMatched) reasons.push('The listed purchase price is within your selected range.');
  if (!budgetEvaluated) unknowns.push('Monthly care cost is not stored for this listing; Pawzzle does not estimate or invent it.');
  else unknowns.push('The budget comparison covers the one-time listing price only; monthly ownership cost is unavailable.');

  const limitedSpace = ['limited_room', 'apartment'].includes(preferences.space);
  const generousSpace = ['medium_house', 'large_house', 'outdoor_space'].includes(preferences.space);
  const calmEvidence = matchesTemperament('calm') || (hasKnownActivity && activityLevel === 'low');
  const activeEvidence = matchesTemperament('energetic') || matchesTemperament('outdoor')
    || (hasKnownActivity && activityLevel === 'high');
  const spaceEvaluated = Boolean(size && (hasKnownActivity || hasTemperamentEvidence) && preferences.space !== 'not_sure');
  let spaceRatio = 0.5;
  if (spaceEvaluated) {
    if (limitedSpace && ['small', 'medium'].includes(size) && calmEvidence) spaceRatio = 1;
    else if (limitedSpace && (['large', 'extra_large'].includes(size) || activeEvidence)) spaceRatio = 0;
    else if (preferences.space === 'small_house' && ['small', 'medium'].includes(size) && activityLevel !== 'high') spaceRatio = 1;
    else if (preferences.space === 'small_house' && (size === 'extra_large' || activityLevel === 'high')) spaceRatio = 0;
    else if (generousSpace) spaceRatio = 1;
  }
  parts.push(petMatchPart('space', 'Space compatibility', PET_MATCH_WEIGHTS.space, spaceEvaluated, spaceRatio,
    spaceEvaluated
      ? spaceRatio === 1 ? 'The listing’s recorded size and activity information support your selected space.' : spaceRatio === 0 ? 'The listing’s recorded size or activity information may conflict with your selected space.' : 'The recorded size and activity information provide mixed space evidence.'
      : 'Space compatibility needs recorded size plus activity or temperament information; Pawzzle does not infer it from breed.'));
  if (spaceEvaluated && spaceRatio === 1) reasons.push('Recorded size and activity information fit your available space.');
  if (spaceEvaluated && spaceRatio === 0) considerations.push('Recorded size or activity information may not fit the selected living space.');
  if (!spaceEvaluated) unknowns.push('Space compatibility has limited evidence because size and temperament data are incomplete or space is uncertain.');

  const restrictions = preferences.petRestrictions;
  const housingEvaluated = restrictions !== 'not_sure';
  const housingRatio = restrictions === 'allowed' ? 1 : restrictions === 'restricted' ? 0.4 : restrictions === 'not_allowed' ? 0 : null;
  parts.push(petMatchPart('housing', 'Housing permission', PET_MATCH_WEIGHTS.housing, housingEvaluated, housingRatio,
    restrictions === 'allowed' ? 'You indicated pets are allowed in your current home.'
      : restrictions === 'restricted' ? 'Your housing may impose pet restrictions that must be confirmed before purchase.'
        : restrictions === 'not_allowed' ? 'You indicated pets are not currently allowed in your housing.'
          : 'Housing permission is unknown and must be confirmed.'));
  if (restrictions === 'allowed') reasons.push('Your current housing permits pets.');
  if (restrictions === 'restricted') considerations.push('Confirm landlord, condominium, or household pet restrictions before deciding.');
  if (restrictions === 'not_allowed') considerations.push('Pets are not currently allowed in your housing; this is a conditional result, not an unconditional recommendation.');
  if (!housingEvaluated) unknowns.push('Housing permission could not be evaluated because it is uncertain.');
  unknowns.push('Home ownership, housing type, and living-arrangement compatibility are recorded context but are not scored because listings do not contain authoritative household-suitability evidence.');

  const lifestyleKeys = preferences.lifestyle.filter(key => ['affectionate', 'independent', 'social', 'interactive'].includes(key));
  const lifestyleEvaluated = Boolean(hasTemperamentEvidence && lifestyleKeys.length);
  const lifestyleMatches = lifestyleEvaluated ? lifestyleKeys.filter(matchesTemperament) : [];
  parts.push(petMatchPart('lifestyle', 'Companion preference', PET_MATCH_WEIGHTS.lifestyle, lifestyleEvaluated, lifestyleMatches.length / Math.max(lifestyleKeys.length, 1),
    lifestyleEvaluated
      ? lifestyleMatches.length ? `Recorded temperament traits match: ${lifestyleMatches.join(', ')}.` : 'The recorded temperament does not contain the selected companion preference evidence.'
      : 'Lifestyle compatibility could not be evaluated because the listing has no applicable temperament information.'));
  if (lifestyleMatches.length) reasons.push(`Recorded temperament matches your ${lifestyleMatches.join(' and ')} preference${lifestyleMatches.length === 1 ? '' : 's'}.`);
  if (!lifestyleEvaluated && lifestyleKeys.length) unknowns.push('Companion-style compatibility is unknown because temperament information is incomplete.');

  const activityKeys = preferences.lifestyle.filter(key => ['calm', 'energetic', 'outdoor'].includes(key));
  const activityEvaluated = Boolean((hasKnownActivity || hasTemperamentEvidence) && activityKeys.length);
  const activityMatches = activityEvaluated ? activityKeys.filter(key => {
    if (matchesTemperament(key)) return true;
    if (!hasKnownActivity) return false;
    if (key === 'calm') return activityLevel === 'low';
    return ['energetic', 'outdoor'].includes(key) && activityLevel === 'high';
  }) : [];
  parts.push(petMatchPart('activity', 'Activity preference', PET_MATCH_WEIGHTS.activity, activityEvaluated, activityMatches.length / Math.max(activityKeys.length, 1),
    activityEvaluated
      ? activityMatches.length ? `Recorded activity information matches: ${activityMatches.join(', ')}.` : 'The listing’s recorded activity information does not match the selected activity preference.'
      : 'Activity compatibility could not be evaluated from the available listing information.'));
  if (activityMatches.length) reasons.push(`Recorded activity wording matches your ${activityMatches.join(' and ')} preference${activityMatches.length === 1 ? '' : 's'}.`);
  if (!activityEvaluated && activityKeys.length) unknowns.push('Activity compatibility is unknown because activity/temperament information is incomplete.');

  const careKeys = preferences.lifestyle.filter(key => ['low_maintenance', 'grooming', 'training'].includes(key));
  const careNeeds = pet.careNeeds || {};
  const careScores = careKeys.flatMap(key => {
    const field = key === 'low_maintenance' ? 'maintenance' : key;
    const level = normalizeChoice(careNeeds[field]);
    if (!['low', 'moderate', 'high'].includes(level)) return [];
    if (key === 'low_maintenance') return [level === 'low' ? 1 : level === 'moderate' ? 0.5 : 0];
    return [1];
  });
  const careEvaluated = careScores.length > 0;
  const careRatio = careEvaluated ? careScores.reduce((sum, value) => sum + value, 0) / careScores.length : 0;
  parts.push(petMatchPart('care', 'Care and grooming preference', PET_MATCH_WEIGHTS.care, careEvaluated, careRatio,
    careEvaluated
      ? 'Compared the listing’s structured maintenance, grooming, and training needs with your selected care preferences.'
      : careKeys.length ? 'Care compatibility could not be evaluated because the relevant listing needs are unknown.' : 'No care or grooming preference was selected.'));
  if (careEvaluated && careRatio === 1) reasons.push('Recorded care needs fit the care preferences you selected.');
  if (careEvaluated && careRatio < 0.5) considerations.push('The recorded maintenance needs may exceed your selected preference.');
  if (careKeys.length && !careEvaluated) unknowns.push('Care, grooming, or training compatibility has limited evidence because the relevant listing fields are unknown.');

  const householdKinds = new Set();
  const addHouseholdKind = value => {
    const normalized = normalizeChoice(value);
    if (normalized === 'dog' || normalized === 'dogs') householdKinds.add('dogs');
    else if (normalized === 'cat' || normalized === 'cats') householdKinds.add('cats');
    else if (normalized && normalized !== 'none' && normalized !== 'multiple') householdKinds.add('otherPets');
  };
  if (preferences.existingPets !== 'multiple') addHouseholdKind(preferences.existingPets);
  householdPets.forEach(existingPet => addHouseholdKind(existingPet.type || existingPet.species));
  const householdEvidence = [...householdKinds].flatMap(kind => {
    const value = normalizeChoice(pet.petCompatibility?.[kind]);
    return ['compatible', 'not_compatible'].includes(value) ? [{ kind, value }] : [];
  });
  const householdEvaluated = householdEvidence.length > 0;
  const householdRatio = householdEvaluated
    ? householdEvidence.filter(item => item.value === 'compatible').length / householdEvidence.length
    : 0;
  parts.push(petMatchPart('household', 'Existing-pet compatibility', PET_MATCH_WEIGHTS.household, householdEvaluated, householdRatio,
    householdEvaluated
      ? 'Compared the listing’s recorded compatibility with the pet types in your household.'
      : preferences.existingPets === 'none' && !householdPets.length
        ? 'You reported no existing pets, so this factor is not needed.'
        : 'The listing has no known compatibility evidence for the pet types in your household.'));
  if (householdEvaluated && householdRatio === 1) reasons.push('Recorded compatibility supports the existing pets in your household.');
  if (householdEvaluated && householdRatio < 1) considerations.push('The listing reports a possible conflict with one or more existing pet types.');
  if ((preferences.existingPets !== 'none' || householdPets.length) && !householdEvaluated) unknowns.push('Compatibility with existing pets is unknown for the relevant pet type.');

  const speciesEvaluated = preferences.preferredSpecies.length > 0;
  const sizePreferenceEvaluated = preferences.preferredSizes.length > 0 && Boolean(size);
  const preferenceChecks = [
    ...(speciesEvaluated ? [preferences.preferredSpecies.includes(normalizeChoice(pet.species))] : []),
    ...(sizePreferenceEvaluated ? [preferences.preferredSizes.includes(size)] : [])
  ];
  parts.push(petMatchPart('petPreference', 'Pet preferences', PET_MATCH_WEIGHTS.petPreference, preferenceChecks.length > 0,
    preferenceChecks.filter(Boolean).length / Math.max(preferenceChecks.length, 1),
    preferenceChecks.length ? 'Compared the listing’s recorded species and size with your selected pet preferences.' : 'No evaluable species or size preference was selected.'));
  if (preferenceChecks.length && preferenceChecks.every(Boolean)) reasons.push('The listing’s recorded species and size match your selected pet preferences.');

  const evaluatedWeight = parts.filter(part => part.evaluated).reduce((sum, part) => sum + part.weight, 0);
  const earnedWeight = parts.reduce((sum, part) => sum + part.contribution, 0);
  const score = evaluatedWeight ? Math.round((earnedWeight / evaluatedWeight) * 100) : null;
  const evidenceCoverage = Math.round((evaluatedWeight / Object.values(PET_MATCH_WEIGHTS).reduce((sum, weight) => sum + weight, 0)) * 100);
  const conditional = ['restricted', 'not_allowed'].includes(restrictions);
  const matchLevel = conditional ? 'Conditional Match'
    : evidenceCoverage < 40 ? 'Limited Evidence'
      : score >= 85 ? 'Best Match' : score >= 70 ? 'Strong Match' : score >= 55 ? 'Good Match' : 'Alternative';

  return {
    score,
    matchLevel,
    evidenceCoverage,
    eligibility: { status: conditional ? 'conditional' : 'eligible', reasons: conditional ? considerations.slice(0, 1) : [] },
    reasons,
    considerations,
    unknowns: [...new Set(unknowns)],
    calculation: parts,
    scoreSummary: { evaluatedWeight, earnedWeight: round(earnedWeight, 2), totalConfiguredWeight: 100 },
    methodology: 'Deterministic weighted scoring from customer selections and explicitly stored listing attributes only.'
  };
};

const dateKey = (date) => new Date(date).toISOString().slice(0, 10);

const buildDailySeries = (events, start, days) => {
  const totals = new Map();
  events.forEach(({ date, quantity }) => {
    const key = dateKey(date);
    totals.set(key, (totals.get(key) || 0) + Number(quantity || 0));
  });
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start.getTime() + i * DAY_MS);
    return { date, value: totals.get(dateKey(date)) || 0 };
  });
};

const movingAverageForecast = (values, horizon, window = 7) => {
  const history = [...values];
  const forecast = [];
  for (let i = 0; i < horizon; i += 1) {
    const sample = history.slice(-Math.min(window, history.length));
    const next = sample.length ? sample.reduce((a, b) => a + b, 0) / sample.length : 0;
    forecast.push(next);
    history.push(next);
  }
  return forecast;
};

const seasonalNaiveForecast = (values, horizon, season = 7) =>
  Array.from({ length: horizon }, (_, i) => values[values.length - season + (i % season)] || 0);

const crostonForecast = (values, horizon, alpha = 0.2) => {
  let demand = 0;
  let interval = 1;
  let gap = 1;
  let initialized = false;
  values.forEach((value) => {
    if (value > 0) {
      if (!initialized) {
        demand = value;
        interval = gap;
        initialized = true;
      } else {
        demand += alpha * (value - demand);
        interval += alpha * (gap - interval);
      }
      gap = 1;
    } else {
      gap += 1;
    }
  });
  const estimate = initialized ? (1 - alpha / 2) * demand / Math.max(interval, 1) : 0;
  return Array(horizon).fill(estimate);
};

const wape = (actual, forecast) => {
  const denominator = actual.reduce((sum, value) => sum + Math.abs(value), 0);
  if (denominator === 0) return null;
  return actual.reduce((sum, value, i) => sum + Math.abs(value - forecast[i]), 0) / denominator;
};

const backtest = (values, method) => {
  const holdout = Math.min(14, Math.max(3, Math.floor(values.length * 0.2)));
  if (values.length < 14) return { error: null, holdout: 0 };
  const train = values.slice(0, -holdout);
  const actual = values.slice(-holdout);
  return { error: wape(actual, method(train, holdout)), holdout };
};

const selectForecast = (values, horizon) => {
  const nonZeroRatio = values.filter((value) => value > 0).length / Math.max(values.length, 1);
  const candidates = nonZeroRatio < 0.3
    ? [{ name: 'croston-sba', run: crostonForecast }]
    : [
      { name: 'moving-average-7', run: (v, h) => movingAverageForecast(v, h, 7) },
      { name: 'seasonal-naive-7', run: seasonalNaiveForecast }
    ];
  const tested = candidates.map((candidate) => ({
    ...candidate,
    ...backtest(values, candidate.run)
  })).sort((a, b) => (a.error ?? Infinity) - (b.error ?? Infinity));
  const selected = tested[0];
  const forecast = selected.run(values, horizon);
  const mean = forecast.reduce((a, b) => a + b, 0) / Math.max(forecast.length, 1);
  const residualError = selected.error ?? 0.5;
  return {
    model: selected.name,
    forecast,
    wape: selected.error,
    holdout: selected.holdout,
    lowerDaily: Math.max(0, mean * (1 - residualError)),
    upperDaily: mean * (1 + residualError),
    confidence: selected.error === null
      ? Math.min(0.45, values.length / 60)
      : Math.max(0.1, Math.min(0.95, 1 - selected.error))
  };
};

class DecisionSupportService {
  static classifyDemandTrend(input, policy) {
    return classifyDemandTrend(input, policy);
  }

  static sellerDemandOverview({ orders = [], bookings = [], products = [], pets = [], services = [], inventories = [], now = new Date() } = {}) {
    const currentStart = new Date(now.getTime() - SELLER_DEMAND_POLICY.periodDays * DAY_MS);
    const previousStart = new Date(now.getTime() - SELLER_DEMAND_POLICY.periodDays * 2 * DAY_MS);
    const windowFor = date => date >= currentStart && date <= now ? 'current' : date >= previousStart && date < currentStart ? 'previous' : null;
    const validOrders = orders.filter(order => order.paymentStatus === 'paid'
      && !['cancelled', 'refunded', 'returned', 'payment_failed'].includes(order.status)
      && windowFor(eventDate(order)));
    const validBookings = bookings.filter(booking => !['cancelled', 'rejected', 'no_show', 'confirmation_expired'].includes(booking.status)
      && windowFor(eventDate(booking)));
    const productById = new Map(products.map(row => [entityId(row), row]));
    const petById = new Map(pets.map(row => [entityId(row), row]));
    const serviceById = new Map(services.map(row => [entityId(row), row]));
    const inventoryByProduct = new Map(inventories.filter(row => row.product).map(row => [entityId(row.product), row]));
    const productGroups = new Map();
    const petGroups = new Map();
    const serviceGroups = new Map();

    validOrders.forEach(order => {
      const period = windowFor(eventDate(order));
      (order.items || []).forEach(item => {
        if (!['product', 'pet'].includes(item.itemType)) return;
        const source = item.itemType === 'product' ? productById.get(entityId(item.itemId)) : petById.get(entityId(item.itemId));
        if (item.itemType === 'product') {
          const id = entityId(item.itemId);
          const group = productGroups.get(id) || { id, name: item.name || source?.name || 'Product', category: source?.category || 'other', current: 0, previous: 0, observations: 0 };
          group[period] += Number(item.quantity || 0);
          group.observations += 1;
          productGroups.set(id, group);
        } else {
          // Pets remain unique listings. Only actual paid pet purchases are
          // aggregated by recorded species; no inventory-unit math is applied.
          const category = source?.species || 'unknown';
          const group = petGroups.get(category) || { id: category, name: category === 'unknown' ? 'Unclassified pet listings' : category, current: 0, previous: 0, observations: 0 };
          group[period] += 1;
          group.observations += 1;
          petGroups.set(category, group);
        }
      });
    });

    validBookings.forEach(booking => {
      const id = entityId(booking.service);
      const source = serviceById.get(id);
      const period = windowFor(eventDate(booking));
      const group = serviceGroups.get(id) || {
        id,
        name: source?.name || booking.service?.name || 'Service',
        category: source?.category || 'other',
        current: 0,
        previous: 0,
        observations: 0,
        completed: 0,
        upcoming: 0
      };
      group[period] += 1;
      group.observations += 1;
      if (['completed', 'finished'].includes(booking.status)) group.completed += 1;
      serviceGroups.set(id, group);
    });

    const productTrends = [...productGroups.values()].map(group => {
      const trend = classifyDemandTrend(group);
      const product = productById.get(group.id);
      const inventory = inventoryByProduct.get(group.id);
      const position = DecisionSupportService.explainInventoryPosition({
        product,
        inventory,
        unitsLast30: group.current,
        unitsPrevious30: group.previous,
        observations: group.observations
      });
      return {
        ...group,
        ...trend,
        inventory: position.inventoryPosition,
        projectedDaysRemaining: position.inventoryPosition.daysRemaining,
        recommendation: trend.classification === 'increasing' && position.decision.shouldReorder
          ? 'Demand is increasing while inventory needs attention. Review replenishment and supplier lead time.'
          : position.decision.shouldReorder ? position.recommendedAction
            : trend.classification === 'declining' ? 'Demand is declining. Review merchandising before increasing stock.'
              : trend.sufficient ? 'Continue monitoring demand and inventory.' : 'Collect more completed sales before acting on a trend.'
      };
    }).sort((a, b) => b.current - a.current || a.name.localeCompare(b.name));

    const availableBySpecies = pets.filter(pet => pet.status === 'available' && pet.isAvailable !== false && pet.isDeleted !== true)
      .reduce((map, pet) => map.set(pet.species || 'unknown', (map.get(pet.species || 'unknown') || 0) + 1), new Map());
    const petTrends = [...new Set([...petGroups.keys(), ...availableBySpecies.keys()])].map(category => {
      const group = petGroups.get(category) || { id: category, name: category, current: 0, previous: 0, observations: 0 };
      const trend = classifyDemandTrend(group);
      const availableListings = availableBySpecies.get(category) || 0;
      return {
        ...group,
        ...trend,
        availableListings,
        evidenceType: 'completed paid pet purchases',
        recommendation: trend.classification === 'increasing' && availableListings <= group.current
          ? 'Recorded purchases increased while available listings are limited. Review listing availability.'
          : trend.sufficient ? 'Review category demand alongside current unique listings.' : 'There is insufficient paid purchase history for a reliable pet-category trend.'
      };
    }).sort((a, b) => b.current - a.current || a.name.localeCompare(b.name));

    const futureLimit = new Date(now.getTime() + 14 * DAY_MS);
    bookings.forEach(booking => {
      const id = entityId(booking.service);
      const date = new Date(booking.bookingDate || booking.createdAt);
      if (date <= now || date > futureLimit || ['cancelled', 'rejected', 'no_show', 'confirmation_expired'].includes(booking.status)) return;
      const existing = serviceGroups.get(id);
      if (existing) existing.upcoming += 1;
    });
    const serviceTrends = [...serviceGroups.values()].map(group => {
      const trend = classifyDemandTrend(group);
      const source = serviceById.get(group.id);
      const maxDailyBookings = Number(source?.bookingRules?.maxDailyBookings || 0);
      const configuredCapacity = maxDailyBookings > 0 ? maxDailyBookings * 14 : null;
      const capacityPressure = configuredCapacity === null ? 'unavailable' : group.upcoming > configuredCapacity * 0.8 ? 'high' : 'normal';
      return {
        ...group,
        ...trend,
        upcoming14Days: group.upcoming,
        capacity: { configured14DayCapacity: configuredCapacity, pressure: capacityPressure },
        recommendation: capacityPressure === 'high'
          ? 'Upcoming bookings are near configured capacity. Review specialist schedules and available slots.'
          : trend.classification === 'increasing' ? 'Booking demand is increasing. Review staffing and schedule availability.'
            : trend.sufficient ? 'Continue monitoring booking demand and completion.' : 'Collect more booking history before acting on a service trend.'
      };
    }).sort((a, b) => b.current - a.current || a.name.localeCompare(b.name));

    const servicePatternHistory = bookings.filter(booking => {
      const date = new Date(booking.bookingDate || booking.createdAt);
      return date <= now
        && date >= new Date(now.getTime() - 90 * DAY_MS)
        && !['cancelled', 'rejected', 'no_show', 'confirmation_expired'].includes(booking.status);
    });
    const weekendBookings = servicePatternHistory.filter(booking => [0, 6].includes(new Date(booking.bookingDate || booking.createdAt).getDay())).length;
    const recurringServicePattern = servicePatternHistory.length >= 12
      ? {
        status: 'available',
        historyDays: 90,
        sampleSize: servicePatternHistory.length,
        weekendBookings,
        weekdayBookings: servicePatternHistory.length - weekendBookings,
        summary: weekendBookings / servicePatternHistory.length >= 0.4
          ? 'Weekend booking demand is elevated relative to the number of weekend days.'
          : 'Recorded booking demand is concentrated on weekdays.'
      }
      : {
        status: 'insufficient_data',
        historyDays: 90,
        sampleSize: servicePatternHistory.length,
        summary: 'Recurring weekly demand pattern unavailable due to insufficient booking history.'
      };

    const summarize = rows => ({
      increasing: rows.filter(row => row.classification === 'increasing').length,
      stable: rows.filter(row => row.classification === 'stable').length,
      declining: rows.filter(row => row.classification === 'declining').length,
      insufficientData: rows.filter(row => row.classification === 'insufficient_data').length
    });
    const actions = [
      ...productTrends.filter(row => row.classification === 'increasing' || Number(row.inventory?.onHand) <= Number(row.inventory?.reorderLevel)).slice(0, 4).map(row => ({ domain: 'product', subject: row.name, action: row.recommendation, why: row.why })),
      ...petTrends.filter(row => row.classification === 'increasing').slice(0, 2).map(row => ({ domain: 'pet', subject: row.name, action: row.recommendation, why: row.why })),
      ...serviceTrends.filter(row => row.classification === 'increasing' || row.capacity.pressure === 'high').slice(0, 3).map(row => ({ domain: 'service', subject: row.name, action: row.recommendation, why: row.why }))
    ];

    return {
      policy: SELLER_DEMAND_POLICY,
      period: { currentStart, currentEnd: now, previousStart, previousEnd: currentStart },
      products: {
        summary: summarize(productTrends),
        trends: productTrends,
        forecastingNote: 'Detailed replenishment forecasts continue to use the existing per-product model selection, history window, confidence, and warning output.'
      },
      pets: {
        summary: summarize(petTrends),
        trends: petTrends,
        evidenceNotice: 'Pet demand uses completed paid Pawzzle pet purchases. Views, favorites, and inquiries are not claimed because they are not tracked here as authoritative demand events.',
        seasonalPattern: { status: 'insufficient_data', summary: 'A reliable pet-listing seasonal pattern is not claimed from the currently available purchase-only evidence.' }
      },
      services: { summary: summarize(serviceTrends), trends: serviceTrends, recurringPattern: recurringServicePattern },
      actions,
      privacyNotice: 'Demand insights are aggregated and do not expose individual customer identities.'
    };
  }

  static validatePetMatchPreferences(input) {
    return validatePetMatchPreferences(input);
  }

  static petCompatibilityAssessment(listings = [], preferences = {}, householdPets = []) {
    const { value, errors } = validatePetMatchPreferences(preferences);
    if (errors.length) return { errors, preferences: value, recommendations: [], excluded: {} };

    const excluded = { unavailable: 0, listingStatus: 0, storeVisibility: 0, purchaseBudget: 0, speciesPreference: 0, insufficientEvidence: 0 };
    const purchaseMaximum = PURCHASE_BUDGET_MAX[value.purchaseBudget];
    const recommendations = [];
    for (const pet of listings) {
      if (pet.status !== 'available' || pet.isAvailable !== true) {
        excluded.unavailable += 1;
        continue;
      }
      if (pet.isDeleted === true || pet.approvalStatus !== 'approved' || pet.listingType !== 'sale') {
        excluded.listingStatus += 1;
        continue;
      }
      if (!pet.store || pet.store.isCustomerVisible !== true) {
        excluded.storeVisibility += 1;
        continue;
      }
      if (Number.isFinite(purchaseMaximum) && Number(pet.price) > purchaseMaximum) {
        excluded.purchaseBudget += 1;
        continue;
      }
      if (value.preferredSpecies.length && !value.preferredSpecies.includes(normalizeChoice(pet.species))) {
        excluded.speciesPreference += 1;
        continue;
      }
      const assessment = listingCompatibility(pet, value, householdPets);
      if (assessment.score === null) {
        excluded.insufficientEvidence += 1;
        continue;
      }
      recommendations.push({ pet, ...assessment });
    }
    recommendations.sort((a, b) =>
      b.score - a.score
      || b.evidenceCoverage - a.evidenceCoverage
      || String(a.pet.name || '').localeCompare(String(b.pet.name || ''))
      || String(a.pet._id || '').localeCompare(String(b.pet._id || ''))
    );
    return {
      errors: [],
      preferences: value,
      recommendations,
      excluded,
      weights: PET_MATCH_WEIGHTS,
      disclaimer: 'Compatibility is decision support based on your answers and available listing data. It is not a guarantee, behavioral assessment, or veterinary diagnosis.'
    };
  }

  static explainInventoryPosition({ product, inventory, unitsLast30 = 0, unitsPrevious30 = 0, observations = 0 }) {
    const onHand = Number(inventory?.quantity ?? product?.stockQuantity ?? 0);
    const reorderLevel = Number(inventory?.reorderLevel ?? product?.minStockThreshold ?? 10);
    const maxStock = Number(inventory?.maxStock || Math.max(reorderLevel * 4, onHand));
    const dailyUsage = Number(unitsLast30 || 0) / 30;
    const previousDailyUsage = Number(unitsPrevious30 || 0) / 30;
    const trendPercent = previousDailyUsage > 0
      ? round(((dailyUsage - previousDailyUsage) / previousDailyUsage) * 100, 1)
      : dailyUsage > 0 ? 100 : 0;
    const daysRemaining = dailyUsage > 0 ? round(onHand / dailyUsage, 1) : null;
    const leadTimeDays = Number(inventory?.supplierProductRef?.deliveryLeadTimeDays || 7);
    const safetyStock = Math.max(reorderLevel, Math.ceil(dailyUsage * 7));
    const targetStock = Math.max(reorderLevel * 2, Math.ceil(dailyUsage * (leadTimeDays + 30) + safetyStock));
    const suggestedReorderQuantity = Math.max(0, Math.min(maxStock, targetStock) - onHand);
    const shouldReorder = onHand <= reorderLevel || (daysRemaining !== null && daysRemaining <= leadTimeDays + 7);
    const confidence = round(Math.min(0.95, observations > 0 ? 0.3 + Math.min(observations, 30) / 50 : 0.2), 2);
    const trend = trendPercent > 10 ? 'increasing' : trendPercent < -10 ? 'decreasing' : 'stable';
    const productName = product?.name || 'This item';
    const why = daysRemaining === null
      ? `${productName} is at ${onHand} units, but there is not enough recent usage to estimate a depletion date.`
      : `${productName} has about ${daysRemaining} days of stock remaining at ${round(dailyUsage, 2)} units per day.`;
    return {
      product: { id: product?._id || product?.id, name: productName, sku: product?.sku },
      inventoryPosition: { onHand, reorderLevel, daysRemaining },
      usageTrend: { direction: trend, percent: trendPercent, unitsLast30, unitsPrevious30, dailyUsage: round(dailyUsage, 3) },
      decision: { shouldReorder, suggestedReorderQuantity: Math.ceil(suggestedReorderQuantity), reorderWithinDays: shouldReorder ? Math.max(0, Math.floor((daysRemaining ?? 0) - leadTimeDays)) : null },
      confidence,
      confidenceLabel: confidenceLabel(confidence),
      why,
      basedOn: [`${onHand} units on hand`, `${unitsLast30} units used or sold in 30 days`, `${reorderLevel} unit reorder level`, `${leadTimeDays} day assumed or configured lead time`],
      recommendedAction: shouldReorder
        ? `Review a purchase order for ${Math.ceil(suggestedReorderQuantity)} units and confirm supplier lead time.`
        : 'Continue monitoring usage; no immediate reorder is indicated.',
      forecastReason: `${trend} 30-day usage with ${observations} recorded observation${observations === 1 ? '' : 's'}.`
    };
  }

  static bookingDemandForecast(bookings = [], { now = new Date(), activeSpecialists = 0 } = {}) {
    const historyStart = new Date(now.getTime() - 90 * DAY_MS);
    const valid = bookings.filter(row => {
      const date = new Date(row.bookingDate || row.createdAt);
      return date >= historyStart && date <= now && !['cancelled', 'rejected', 'no_show', 'confirmation_expired'].includes(row.status);
    });
    const dayCounts = Array(7).fill(0);
    const hourCounts = new Map();
    const dateHourCounts = new Map();
    valid.forEach(row => {
      const date = new Date(row.bookingDate || row.createdAt);
      const hour = Number(String(row.startTime || '0').split(':')[0]);
      dayCounts[date.getDay()] += 1;
      if (Number.isFinite(hour)) {
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
        const key = `${dateKey(date)}-${hour}`;
        dateHourCounts.set(key, (dateHourCounts.get(key) || 0) + 1);
      }
    });
    const occurrences = 90 / 7;
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const busiestDays = dayCounts.map((count, day) => ({ day, label: weekdays[day], bookings: count, averagePerDay: round(count / occurrences, 1) })).sort((a, b) => b.bookings - a.bookings);
    const busiestHours = [...hourCounts.entries()].map(([hour, count]) => ({ hour, label: `${String(hour).padStart(2, '0')}:00`, bookings: count })).sort((a, b) => b.bookings - a.bookings);
    const topDay = busiestDays[0];
    const upcomingPeaks = Array.from({ length: 14 }, (_, index) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + index + 1))
      .filter(date => topDay && date.getDay() === topDay.day)
      .map(date => ({ date: dateKey(date), expectedBookings: topDay.averagePerDay, reason: `${topDay.label} has the highest observed 90-day booking volume.` }));
    const observedPeakConcurrency = Math.max(...dateHourCounts.values(), 0);
    const recommendedStaffing = valid.length ? Math.max(1, observedPeakConcurrency) : 0;
    const confidence = round(Math.min(0.95, valid.length / 60), 2);
    return {
      horizonDays: 14,
      historyDays: 90,
      sampleSize: valid.length,
      busiestDays: busiestDays.slice(0, 3),
      busiestHours: busiestHours.slice(0, 3),
      upcomingPeaks,
      recommendedStaffing: {
        specialists: recommendedStaffing,
        currentlyActive: activeSpecialists,
        gap: Math.max(0, recommendedStaffing - activeSpecialists)
      },
      confidence,
      confidenceLabel: confidenceLabel(confidence),
      why: valid.length
        ? `${topDay.label} and ${busiestHours[0]?.label || 'the observed peak hour'} carry the highest recent booking load.`
        : 'There is not yet enough completed booking history to identify a peak.',
      basedOn: [`${valid.length} non-cancelled bookings from the last 90 days`, 'Recorded booking dates and start times'],
      recommendedAction: recommendedStaffing > activeSpecialists
        ? `Plan at least ${recommendedStaffing} available specialists during forecast peaks.`
        : 'Current active specialist coverage meets the observed peak concurrency.'
    };
  }

  static supplierInsights(purchaseOrders = []) {
    const groups = new Map();
    purchaseOrders.filter(order => order.supplier).forEach(order => {
      const id = String(order.supplier?._id || order.supplier);
      const supplier = order.supplier;
      const group = groups.get(id) || { id, name: supplier.businessName || 'Supplier', orders: [], prices: [] };
      group.orders.push(order);
      (order.items || []).forEach(item => group.prices.push(Number(item.unitPrice || 0)));
      groups.set(id, group);
    });
    return [...groups.values()].map(group => {
      const delivered = group.orders.filter(order => order.status === 'delivered');
      const onTime = delivered.filter(order => !order.estimatedDeliveryDate || (order.actualDeliveryDate && new Date(order.actualDeliveryDate) <= new Date(order.estimatedDeliveryDate))).length;
      const deliveryDays = delivered.filter(order => order.actualDeliveryDate).map(order => (new Date(order.actualDeliveryDate) - new Date(order.createdAt)) / DAY_MS).filter(value => value >= 0);
      const meanPrice = group.prices.length ? group.prices.reduce((a, b) => a + b, 0) / group.prices.length : 0;
      const priceVariance = group.prices.length ? group.prices.reduce((total, price) => total + ((price - meanPrice) ** 2), 0) / group.prices.length : 0;
      const priceConsistency = meanPrice ? clamp(100 - (Math.sqrt(priceVariance) / meanPrice) * 100) : 0;
      const reliability = group.orders.length ? (delivered.length / group.orders.length) * 100 : 0;
      const onTimeRate = delivered.length ? (onTime / delivered.length) * 100 : 0;
      const score = round(0.5 * reliability + 0.3 * onTimeRate + 0.2 * priceConsistency, 1);
      const confidence = round(Math.min(0.95, group.orders.length / 10), 2);
      return {
        supplier: { id: group.id, name: group.name },
        score,
        confidence,
        confidenceLabel: confidenceLabel(confidence),
        evidence: { orders: group.orders.length, delivered: delivered.length, onTime, averageDeliveryDays: deliveryDays.length ? round(deliveryDays.reduce((a, b) => a + b, 0) / deliveryDays.length, 1) : null, priceConsistency: round(priceConsistency, 1) },
        why: `${group.name} scored ${score}/100 from delivery completion, on-time performance, and observed price consistency.`,
        basedOn: [`${group.orders.length} purchase orders`, `${delivered.length} delivered`, `${round(priceConsistency, 1)}% price consistency`],
        recommendedAction: confidence < 0.45 ? 'Collect more completed purchase-order history before making this supplier the default.' : 'Prefer this supplier when its catalog, price, and lead time fit the required item.'
      };
    }).sort((a, b) => b.score - a.score);
  }

  static storeHealthScore(input = {}) {
    const components = [];
    const add = (key, label, weight, score, evidence) => {
      if (score === null || score === undefined || Number.isNaN(Number(score))) return;
      components.push({ key, label, weight, score: clamp(score), evidence });
    };
    add('sales', 'Sales momentum', 15, input.revenueGrowth === null || input.revenueGrowth === undefined ? null : 50 + clamp(input.revenueGrowth, -50, 50), `${round(input.revenueGrowth, 1)}% month-over-month growth`);
    add('bookings', 'Booking completion', 20, input.bookingTotal ? (input.bookingCompleted / input.bookingTotal) * 100 : null, `${input.bookingCompleted || 0} of ${input.bookingTotal || 0} bookings completed`);
    add('cancellations', 'Cancellation control', 15, input.bookingTotal ? 100 - (input.bookingCancelled / input.bookingTotal) * 100 : null, `${input.bookingCancelled || 0} cancelled bookings`);
    add('reviews', 'Customer reviews', 15, input.reviewCount ? (Number(input.averageRating || 0) / 5) * 100 : null, `${input.reviewCount || 0} reviews averaging ${round(input.averageRating, 1)}/5`);
    add('inventory', 'Inventory health', 15, input.inventoryTotal ? ((input.inventoryTotal - input.inventoryRiskCount) / input.inventoryTotal) * 100 : null, `${input.inventoryRiskCount || 0} of ${input.inventoryTotal || 0} items need attention`);
    add('suppliers', 'Supplier performance', 10, input.supplierScore ?? null, `${round(input.supplierScore, 1)} average supplier score`);
    add('payouts', 'Payout status', 5, input.pendingPayouts === null || input.pendingPayouts === undefined ? null : input.pendingPayouts > 0 ? 50 : 100, `${input.pendingPayouts || 0} pending payout requests`);
    add('services', 'Service completion', 5, input.serviceTotal ? (input.serviceCompleted / input.serviceTotal) * 100 : null, `${input.serviceCompleted || 0} completed services`);
    const evaluatedWeight = components.reduce((total, component) => total + component.weight, 0);
    const overallScore = evaluatedWeight ? round(components.reduce((total, component) => total + component.score * component.weight, 0) / evaluatedWeight, 0) : null;
    return {
      overallScore,
      rating: overallScore === null ? 'insufficient_data' : overallScore >= 80 ? 'healthy' : overallScore >= 60 ? 'monitor' : 'needs_attention',
      strengths: components.filter(component => component.score >= 75).sort((a, b) => b.score - a.score).slice(0, 3),
      areasNeedingAttention: components.filter(component => component.score < 60).sort((a, b) => a.score - b.score).slice(0, 3),
      components,
      why: overallScore === null ? 'Not enough recorded operational data is available.' : `The score is the weighted result of ${components.length} available operational indicators.`,
      basedOn: components.map(component => component.evidence),
      recommendedAction: overallScore === null ? 'Continue recording transactions and operational outcomes.' : overallScore < 60 ? 'Address the lowest-scoring operational area first.' : 'Maintain strong areas and monitor lower-scoring indicators.'
    };
  }

  static riskIndicators(input = {}) {
    const risks = [];
    const add = (key, severity, title, reason, evidence, suggestedAction, relatedId) => risks.push({ key, severity, title, reason, evidence, suggestedAction, relatedId });
    (input.inventory || []).filter(item => item.decision?.shouldReorder).forEach(item => add(`inventory:${item.product.id}`, item.inventoryPosition.onHand <= 0 || (item.inventoryPosition.daysRemaining !== null && item.inventoryPosition.daysRemaining <= 3) ? 'critical' : 'high', 'Inventory running low', item.why, item.basedOn, item.recommendedAction, item.product.id));
    if ((input.credentialsExpired || 0) > 0 || (input.credentialsExpiring || 0) > 0) add('credentials', input.credentialsExpired > 0 ? 'critical' : 'high', 'Professional credentials need attention', `${input.credentialsExpired || 0} credentials are expired and ${input.credentialsExpiring || 0} expire within 30 days.`, ['Current professional credential expiration dates'], 'Review verification documents and renew credentials before future assignment.', null);
    if (input.supplierDelayCount > 0) add('supplier-delays', 'high', 'Supplier delivery delays', `${input.supplierDelayCount} delivered purchase orders arrived after their estimated date.`, ['Estimated and actual purchase-order delivery dates'], 'Review affected suppliers and confirm lead times before the next reorder.', null);
    if (input.cancellationRate >= 20) add('booking-cancellations', input.cancellationRate >= 35 ? 'critical' : 'high', 'High booking cancellation rate', `${round(input.cancellationRate, 1)}% of recorded bookings were cancelled or rejected.`, [`${input.cancelledBookings} cancelled of ${input.totalBookings} bookings`], 'Review cancellation reasons, proposal response time, and schedule availability.', null);
    if (input.pendingPayouts > 0) add('pending-payouts', 'medium', 'Pending payouts', `${input.pendingPayouts} payout request${input.pendingPayouts === 1 ? ' is' : 's are'} pending.`, ['Current payout status records'], 'Review payout requests and resolve any held items.', null);
    if (input.overdueProcurement > 0) add('overdue-procurement', 'high', 'Overdue procurement', `${input.overdueProcurement} purchase order${input.overdueProcurement === 1 ? ' is' : 's are'} past the estimated delivery date.`, ['Open purchase-order status and estimated delivery dates'], 'Contact the supplier and update the delivery expectation.', null);
    if (input.bookingCongestion) add('booking-congestion', 'medium', 'Upcoming booking congestion', input.bookingCongestion.reason, input.bookingCongestion.evidence, input.bookingCongestion.action, null);
    const rank = { critical: 0, high: 1, medium: 2, low: 3 };
    return risks.sort((a, b) => rank[a.severity] - rank[b.severity]);
  }

  static async forecastProduct({ store, productId, horizon = 30, historyDays = 180 }) {
    horizon = Math.min(Math.max(Number(horizon), 7), 90);
    historyDays = Math.min(Math.max(Number(historyDays), 30), 730);
    const start = new Date(Date.now() - historyDays * DAY_MS);
    const orders = await Order.find({
      store, createdAt: { $gte: start }, paymentStatus: 'paid',
      status: { $nin: ['cancelled', 'refunded', 'returned'] },
      'items.itemId': productId, isDeleted: { $ne: true }
    }).select('items createdAt');
    const events = [];
    orders.forEach((order) => order.items
      .filter((item) => item.itemType === 'product' && item.itemId.toString() === productId.toString())
      .forEach((item) => events.push({ date: order.createdAt, quantity: item.quantity })));
    const series = buildDailySeries(events, start, historyDays);
    const values = series.map((row) => row.value);
    const result = selectForecast(values, horizon);
    const total = result.forecast.reduce((a, b) => a + b, 0);
    return {
      productId,
      horizonDays: horizon,
      historyDays,
      dataThrough: new Date(),
      modelVersion: `dss-${result.model}-v1`,
      forecastUnits: round(total),
      averageDailyUnits: round(total / horizon, 3),
      history: {
        observations: events.length,
        unitsLast30: round(values.slice(-30).reduce((a, b) => a + b, 0)),
        unitsPrevious30: round(values.slice(-60, -30).reduce((a, b) => a + b, 0))
      },
      interval: {
        lowerUnits: round(result.lowerDaily * horizon),
        upperUnits: round(result.upperDaily * horizon)
      },
      accuracy: { metric: 'WAPE', value: result.wape === null ? null : round(result.wape, 4), holdoutDays: result.holdout },
      confidence: round(result.confidence, 3),
      warnings: [
        ...(events.length < 10 ? ['Limited sales history; treat this forecast as preliminary.'] : []),
        ...(result.wape !== null && result.wape > 0.5 ? ['Historical forecast error is high.'] : [])
      ],
      daily: result.forecast.map((value, index) => ({
        date: dateKey(new Date(Date.now() + (index + 1) * DAY_MS)),
        units: round(value, 3)
      }))
    };
  }

  static async replenishment({ store, productId, horizon = 30, save = false, generatedBy }) {
    const [forecast, inventory, product] = await Promise.all([
      this.forecastProduct({ store, productId, horizon }),
      Inventory.findOne({ store, product: productId }),
      Product.findById(productId).select('name sku supplierProductRef')
    ]);
    if (!product) throw new Error('Product not found.');
    const onHand = inventory?.quantity || 0;
    const leadTimeDays = 7;
    const daily = forecast.averageDailyUnits;
    const leadTimeDemand = daily * leadTimeDays;
    const safetyStock = Math.max(
      daily * 3,
      Math.max(0, forecast.interval.upperUnits - forecast.forecastUnits) * leadTimeDays / horizon
    );
    const reorderPoint = leadTimeDemand + safetyStock;
    const targetStock = daily * (leadTimeDays + Number(horizon)) + safetyStock;
    const rawQuantity = Math.max(0, targetStock - onHand);
    const recommendedQuantity = Math.ceil(rawQuantity);
    const daysOfSupply = daily > 0 ? onHand / daily : null;
    const shouldReorder = onHand <= reorderPoint;
    const output = {
      product: { id: product._id, name: product.name, sku: product.sku },
      forecast,
      inventoryPosition: { onHand, daysOfSupply: daysOfSupply === null ? null : round(daysOfSupply, 1) },
      policy: {
        leadTimeDays,
        safetyStock: round(safetyStock),
        reorderPoint: round(reorderPoint),
        targetCoverageDays: leadTimeDays + Number(horizon)
      },
      decision: {
        shouldReorder,
        recommendedQuantity,
        estimatedReorderDate: shouldReorder
          ? dateKey(new Date())
          : dateKey(new Date(Date.now() + Math.max(0, daysOfSupply - leadTimeDays) * DAY_MS))
      },
      explanation: [
        `Expected lead-time demand is ${round(leadTimeDemand)} units.`,
        `Safety stock is ${round(safetyStock)} units based on forecast uncertainty.`,
        `Current stock of ${onHand} is ${shouldReorder ? 'at or below' : 'above'} the reorder point of ${round(reorderPoint)}.`
      ]
    };
    const enhanced = this.explainInventoryPosition({
      product,
      inventory,
      unitsLast30: forecast.history.unitsLast30,
      unitsPrevious30: forecast.history.unitsPrevious30,
      observations: forecast.history.observations
    });
    output.estimatedDaysRemaining = enhanced.inventoryPosition.daysRemaining;
    output.usageTrend = enhanced.usageTrend;
    output.confidenceIndicator = enhanced.confidenceLabel;
    output.forecastReason = enhanced.forecastReason;
    output.why = enhanced.why;
    output.basedOn = enhanced.basedOn;
    output.recommendedAction = enhanced.recommendedAction;
    if (save && recommendedQuantity > 0) {
      output.recommendation = await DSSRecommendation.create({
        store, decisionType: 'replenishment', subjectType: 'Product',
        subjectId: productId, dataThrough: forecast.dataThrough,
        modelVersion: forecast.modelVersion,
        inputsSnapshot: { onHand, leadTimeDays, horizon, forecast },
        recommendedAction: output.decision,
        alternatives: [
          { scenario: 'conservative', quantity: Math.ceil(Math.max(0, forecast.interval.lowerUnits - onHand)) },
          { scenario: 'high-demand', quantity: Math.ceil(Math.max(0, forecast.interval.upperUnits + safetyStock - onHand)) }
        ],
        confidence: forecast.confidence, explanation: output.explanation,
        expectedImpact: { target: 'reduce_stockout_risk' },
        generatedBy
      });
    }
    return output;
  }

  static async supplierScorecard({ store }) {
    const suppliers = await Supplier.find(getActiveSupplierFilter()).lean();
    const orders = await PurchaseOrder.find({
      store, isDeleted: false, status: { $in: ['delivered', 'returned', 'cancelled'] }
    }).lean();
    return suppliers.map((supplier) => {
      const own = orders.filter((order) => order.supplier.toString() === supplier._id.toString());
      const delivered = own.filter((order) => order.status === 'delivered');
      const onTime = delivered.filter((order) =>
        !order.estimatedDeliveryDate || (order.actualDeliveryDate && order.actualDeliveryDate <= order.estimatedDeliveryDate)
      ).length;
      const fillRates = own.flatMap((order) => order.items.map((item) =>
        item.quantity ? Math.min(1, (item.receivedQuantity || 0) / item.quantity) : 0
      ));
      const onTimeRate = delivered.length ? onTime / delivered.length : 0;
      const fillRate = fillRates.length ? fillRates.reduce((a, b) => a + b, 0) / fillRates.length : 0;
      const cancellationRate = own.length
        ? own.filter((order) => order.status === 'cancelled').length / own.length : 0;
      const score = 100 * (0.45 * onTimeRate + 0.4 * fillRate + 0.15 * (1 - cancellationRate));
      return {
        supplier: { id: supplier._id, name: supplier.businessName },
        evidence: { orders: own.length, delivered: delivered.length },
        criteria: {
          onTimeRate: round(onTimeRate, 3),
          fillRate: round(fillRate, 3),
          cancellationRate: round(cancellationRate, 3)
        },
        score: round(score, 1),
        confidence: round(Math.min(1, own.length / 10), 2),
        warning: own.length < 3 ? 'Insufficient completed orders for a stable ranking.' : null,
        why: `${supplier.businessName} scored ${round(score, 1)}/100 using delivery completion, fill rate, and cancellation history.`,
        basedOn: [`${own.length} purchase orders`, `${round(onTimeRate * 100, 1)}% on-time rate`, `${round(fillRate * 100, 1)}% fill rate`, `${round(cancellationRate * 100, 1)}% cancellation rate`],
        recommendedAction: own.length < 3 ? 'Collect more completed orders before relying on this ranking.' : 'Prefer this supplier when product availability, price, and lead time meet the purchase requirement.'
      };
    }).sort((a, b) => b.score - a.score);
  }
}

module.exports = DecisionSupportService;
module.exports.SELLER_DEMAND_POLICY = SELLER_DEMAND_POLICY;
