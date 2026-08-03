const mongoose = require('mongoose');

const dssRecommendationSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  decisionType: {
    type: String,
    enum: ['sales_forecast', 'service_capacity', 'replenishment',
      'reorder_quantity', 'supplier_selection', 'assortment',
      'seasonality', 'profitability', 'business_action'],
    required: true,
    index: true
  },
  subjectType: { type: String, required: true },
  subjectId: mongoose.Schema.Types.ObjectId,
  generatedAt: { type: Date, default: Date.now },
  dataThrough: Date,
  modelVersion: { type: String, required: true },
  inputsSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  recommendedAction: { type: mongoose.Schema.Types.Mixed, required: true },
  alternatives: [mongoose.Schema.Types.Mixed],
  confidence: { type: Number, min: 0, max: 1, required: true },
  explanation: [{ type: String }],
  expectedImpact: mongoose.Schema.Types.Mixed,
  status: {
    type: String,
    enum: ['pending', 'accepted', 'modified', 'dismissed', 'completed'],
    default: 'pending',
    index: true
  },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  decidedAt: Date,
  decisionReason: String,
  actualOutcome: mongoose.Schema.Types.Mixed
}, { timestamps: true });

dssRecommendationSchema.index({ store: 1, decisionType: 1, generatedAt: -1 });

module.exports = mongoose.model('DSSRecommendation', dssRecommendationSchema);
