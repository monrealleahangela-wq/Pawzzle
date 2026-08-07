const mongoose = require('mongoose');

const riderEarningSchema = new mongoose.Schema({
  rider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  delivery: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery', required: true, unique: true },
  baseRate: { type: Number, min: 0, required: true },
  incentive: { type: Number, min: 0, default: 0 },
  bonus: { type: Number, min: 0, default: 0 },
  deduction: { type: Number, min: 0, default: 0 },
  amount: { type: Number, min: 0, required: true },
  status: { type: String, enum: ['available', 'processing', 'paid'], default: 'available', index: true },
  payout: { type: mongoose.Schema.Types.ObjectId, ref: 'RiderPayout', default: null },
  earnedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('RiderEarning', riderEarningSchema);
