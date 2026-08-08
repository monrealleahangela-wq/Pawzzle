const mongoose = require('mongoose');

const weightsSchema = new mongoose.Schema({
  petType: { type: Number, min: 0, max: 100, default: 25 },
  customerNeed: { type: Number, min: 0, max: 100, default: 30 },
  coat: { type: Number, min: 0, max: 100, default: 15 },
  size: { type: Number, min: 0, max: 100, default: 10 },
  history: { type: Number, min: 0, max: 100, default: 10 },
  preference: { type: Number, min: 0, max: 100, default: 10 }
}, { _id: false });

const serviceDSSConfigSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, unique: true },
  enabled: { type: Boolean, default: true },
  weights: { type: weightsSchema, default: () => ({}) },
  thresholds: {
    high: { type: Number, min: 0, max: 100, default: 75 },
    good: { type: Number, min: 0, max: 100, default: 50 }
  },
  changeLog: [{ changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, changedAt: { type: Date, default: Date.now }, previous: mongoose.Schema.Types.Mixed, next: mongoose.Schema.Types.Mixed }]
}, { timestamps: true });

module.exports = mongoose.model('ServiceDSSConfig', serviceDSSConfigSchema);
