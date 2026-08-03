const DSSRecommendation = require('../models/DSSRecommendation');
const DecisionSupportService = require('../services/decisionSupportService');
const resolveStore = require('../utils/resolveStore');

const productForecast = async (req, res) => {
  try {
    const store = await resolveStore(req);
    if (!store) return res.status(400).json({ message: 'Store is required.' });
    res.json(await DecisionSupportService.forecastProduct({
      store, productId: req.params.productId,
      horizon: req.query.horizon, historyDays: req.query.historyDays
    }));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const replenishment = async (req, res) => {
  try {
    const store = await resolveStore(req);
    if (!store) return res.status(400).json({ message: 'Store is required.' });
    res.json(await DecisionSupportService.replenishment({
      store, productId: req.params.productId, horizon: req.query.horizon,
      save: req.body.save === true, generatedBy: req.user._id
    }));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const supplierScorecard = async (req, res) => {
  try {
    const store = await resolveStore(req);
    if (!store) return res.status(400).json({ message: 'Store is required.' });
    res.json({ suppliers: await DecisionSupportService.supplierScorecard({ store }) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const decideRecommendation = async (req, res) => {
  try {
    const allowed = ['accepted', 'modified', 'dismissed', 'completed'];
    if (!allowed.includes(req.body.status)) {
      return res.status(400).json({ message: `Status must be one of: ${allowed.join(', ')}.` });
    }
    const recommendation = await DSSRecommendation.findById(req.params.id);
    if (!recommendation) return res.status(404).json({ message: 'Recommendation not found.' });
    if (req.user.store && recommendation.store.toString() !== req.user.store.toString()) {
      return res.status(403).json({ message: 'Recommendation belongs to another store.' });
    }
    recommendation.status = req.body.status;
    recommendation.decisionReason = req.body.reason;
    recommendation.decidedBy = req.user._id;
    recommendation.decidedAt = new Date();
    if (req.body.modifiedAction) recommendation.recommendedAction = req.body.modifiedAction;
    await recommendation.save();
    res.json(recommendation);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = { productForecast, replenishment, supplierScorecard, decideRecommendation };
