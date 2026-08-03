const mongoose = require('mongoose');

const deliveryFeeRuleSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  name: { type: String, required: true, trim: true },
  baseFee: { type: Number, default: 0, min: 0 },
  includedKilometers: { type: Number, default: 0, min: 0 },
  ratePerKilometer: { type: Number, required: true, min: 0 },
  minimumFee: { type: Number, default: 0, min: 0 },
  maximumFee: { type: Number, min: 0 },
  maximumDistanceKm: { type: Number, min: 0 },
  version: { type: Number, default: 1, min: 1 },
  effectiveFrom: { type: Date, default: Date.now },
  effectiveUntil: Date,
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

deliveryFeeRuleSchema.index({ store: 1, isActive: 1, effectiveFrom: -1 });

module.exports = mongoose.model('DeliveryFeeRule', deliveryFeeRuleSchema);
