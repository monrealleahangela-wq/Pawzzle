const PetProfile = require('../models/PetProfile');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const Store = require('../models/Store');
const ServiceDSSConfig = require('../models/ServiceDSSConfig');

const DEFAULTS = { enabled: true, weights: { petType: 25, customerNeed: 30, coat: 15, size: 10, history: 10, preference: 10 }, thresholds: { high: 75, good: 50 } };
const normalized = value => String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
const configured = values => Array.isArray(values) && values.length > 0 && !values.includes('any');
const includesValue = (values, value) => values.includes(normalized(value));

const addCriterion = (parts, key, weight, evaluated, matched, explanation) => {
  if (!evaluated || weight <= 0) return;
  parts.push({ criterion: key, weight, matched: Boolean(matched), contribution: matched ? weight : 0, explanation });
};

const calculateScore = parts => {
  const evaluatedWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  if (!evaluatedWeight) return null;
  const earnedWeight = parts.reduce((sum, part) => sum + part.contribution, 0);
  return { evaluatedWeight, earnedWeight, score: Math.round((earnedWeight / evaluatedWeight) * 100) };
};

const getServiceRecommendations = async (req, res) => {
  try {
    const pet = await PetProfile.findOne({ _id: req.query.petId, owner: req.user._id }).lean();
    if (!pet) return res.status(404).json({ message: 'Pet profile not found.' });
    const serviceFilter = { isActive: true, isDeleted: { $ne: true }, 'recommendationCriteria.enabled': true };
    if (req.query.storeId) serviceFilter.store = req.query.storeId;
    const services = await Service.find(serviceFilter).populate('store', 'name isActive').lean();
    const activeServices = services.filter(service => service.store?.isActive !== false);
    const storeIds = [...new Set(activeServices.map(service => service.store?._id?.toString()).filter(Boolean))];
    const configs = await ServiceDSSConfig.find({ store: { $in: storeIds } }).lean();
    const configByStore = Object.fromEntries(configs.map(config => [config.store.toString(), config]));
    const completed = await Booking.find({ customer: req.user._id, status: 'completed', isDeleted: { $ne: true }, 'pet.name': new RegExp(`^${String(pet.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), 'pet.type': new RegExp(`^${String(pet.type).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).select('service bookingDate store notes').lean();
    const completedServiceIds = new Set(completed.map(booking => booking.service?.toString()));
    const profileHistoryIds = new Set((pet.groomingHistory?.previousServices || []).map(id => id.toString()));
    const results = [];

    for (const service of activeServices) {
      const criteria = service.recommendationCriteria || {};
      const config = configByStore[service.store._id.toString()] || DEFAULTS;
      if (config.enabled === false) continue;
      const petType = normalized(pet.type), size = normalized(pet.size).replace('extra_large', 'extra_large');
      const coatLength = normalized(pet.coat?.length), coatType = normalized(pet.coat?.type);
      if (configured(criteria.applicablePetTypes) && petType && !includesValue(criteria.applicablePetTypes, petType)) continue;
      if (configured(criteria.applicableSizes) && size && size !== 'unknown' && !includesValue(criteria.applicableSizes, size)) continue;
      if (configured(criteria.coatLengths) && coatLength && coatLength !== 'unknown' && !includesValue(criteria.coatLengths, coatLength)) continue;
      if (configured(criteria.coatTypes) && coatType && coatType !== 'unknown' && !includesValue(criteria.coatTypes, coatType)) continue;

      const weights = { ...DEFAULTS.weights, ...(config.weights || {}) };
      const parts = [];
      addCriterion(parts, 'petType', weights.petType, petType && (configured(criteria.applicablePetTypes) || criteria.applicablePetTypes?.includes('any')), criteria.applicablePetTypes?.includes('any') || includesValue(criteria.applicablePetTypes || [], petType), 'Pet type compatibility');
      const needs = pet.serviceNeeds || [];
      const needMatches = needs.filter(need => (criteria.relevantNeeds || []).includes(need));
      addCriterion(parts, 'customerNeed', weights.customerNeed, needs.length > 0 && !needs.includes('not_sure') && (criteria.relevantNeeds || []).length > 0, needMatches.length > 0, needMatches.length ? `Matches selected need: ${needMatches.map(value => value.replace(/_/g, ' ')).join(', ')}` : 'Selected service needs did not match this service');
      const coatChecks = [];
      if (coatLength && coatLength !== 'unknown' && criteria.coatLengths?.length) coatChecks.push(criteria.coatLengths.includes('any') || includesValue(criteria.coatLengths, coatLength));
      if (coatType && coatType !== 'unknown' && criteria.coatTypes?.length) coatChecks.push(criteria.coatTypes.includes('any') || includesValue(criteria.coatTypes, coatType));
      addCriterion(parts, 'coat', weights.coat, coatChecks.length > 0, coatChecks.every(Boolean), 'Coat information compatibility');
      addCriterion(parts, 'size', weights.size, size && size !== 'unknown' && criteria.applicableSizes?.length, criteria.applicableSizes?.includes('any') || includesValue(criteria.applicableSizes, size), 'Pet size compatibility');
      const historyMatch = completedServiceIds.has(service._id.toString()) || profileHistoryIds.has(service._id.toString());
      addCriterion(parts, 'history', weights.history, criteria.useCompletedHistory === true && (completedServiceIds.size > 0 || profileHistoryIds.size > 0), historyMatch, historyMatch ? 'Matches a completed or customer-recorded previous service' : 'No matching completed service history');
      const preference = normalized(pet.servicePreferences?.preferredServiceType);
      const searchable = [normalized(service.name), normalized(service.category), normalized(service.subCategory), ...(criteria.preferenceTags || []).map(normalized)];
      addCriterion(parts, 'preference', weights.preference, Boolean(preference), searchable.some(value => value.includes(preference) || preference.includes(value)), 'Customer service preference match');
      const scoreResult = calculateScore(parts);
      if (!scoreResult) continue;
      const { evaluatedWeight, earnedWeight, score } = scoreResult;
      const thresholds = { ...DEFAULTS.thresholds, ...(config.thresholds || {}) };
      results.push({ service: { _id: service._id, name: service.name, description: service.description, price: service.price, duration: service.duration, category: service.category, images: service.images || [], store: service.store }, score, matchLevel: score >= thresholds.high ? 'High' : score >= thresholds.good ? 'Good' : 'Possible', explanations: parts.filter(part => part.matched).map(part => part.explanation), calculation: parts.map(part => ({ ...part, points: part.contribution })), scoreSummary: { evaluatedWeight, earnedWeight }, thresholds });
    }
    results.sort((a, b) => b.score - a.score || a.service.name.localeCompare(b.service.name));
    res.json({ pet, recommendations: results, completedServiceHistory: completed, methodology: 'Deterministic weighted scoring using customer-provided pet data and store-configured service criteria.', disclaimer: 'This system provides service recommendations only. For health concerns or medical advice, please consult a qualified veterinarian.' });
  } catch (error) {
    console.error('Service recommendation error:', error);
    res.status(500).json({ message: 'Unable to calculate service recommendations.' });
  }
};

const resolveAdminStore = async req => {
  if (req.query.storeId) {
    const store = await Store.findById(req.query.storeId);
    if (store && (req.user.role === 'super_admin' || store.owner.toString() === req.user._id.toString() || req.user.store?.toString() === store._id.toString())) return store;
    return null;
  }
  if (req.user.store) return Store.findById(req.user.store);
  return Store.findOne({ owner: req.user._id });
};

const getDSSConfig = async (req, res) => {
  const store = await resolveAdminStore(req);
  if (!store) return res.status(403).json({ message: 'Store access denied.' });
  const config = await ServiceDSSConfig.findOne({ store: store._id }).lean();
  res.json({ store: { _id: store._id, name: store.name }, configuration: config || { store: store._id, ...DEFAULTS } });
};

const updateDSSConfig = async (req, res) => {
  try {
    const store = await resolveAdminStore(req);
    if (!store) return res.status(403).json({ message: 'Store access denied.' });
    const { enabled, weights, thresholds } = req.body;
    const mergedWeights = { ...DEFAULTS.weights, ...(weights || {}) };
    if (Object.values(mergedWeights).some(value => !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100)) return res.status(400).json({ message: 'Each DSS weight must be between 0 and 100.' });
    if (Object.values(mergedWeights).reduce((sum, value) => sum + Number(value), 0) <= 0) return res.status(400).json({ message: 'At least one DSS weight must be greater than zero.' });
    const mergedThresholds = { ...DEFAULTS.thresholds, ...(thresholds || {}) };
    if (mergedThresholds.good < 0 || mergedThresholds.high > 100 || mergedThresholds.good >= mergedThresholds.high) return res.status(400).json({ message: 'Thresholds must be ordered: Good below High, within 0–100.' });
    const existing = await ServiceDSSConfig.findOne({ store: store._id });
    const previous = existing ? { enabled: existing.enabled, weights: existing.weights?.toObject(), thresholds: existing.thresholds?.toObject() } : DEFAULTS;
    const next = { enabled: enabled !== false, weights: mergedWeights, thresholds: mergedThresholds };
    const config = await ServiceDSSConfig.findOneAndUpdate({ store: store._id }, { $set: next, $push: { changeLog: { changedBy: req.user._id, previous, next } } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.json({ message: 'DSS configuration updated.', configuration: config });
  } catch (error) { res.status(500).json({ message: 'Unable to update DSS configuration.' }); }
};

module.exports = { getServiceRecommendations, getDSSConfig, updateDSSConfig, _test: { addCriterion, calculateScore, configured, includesValue } };
