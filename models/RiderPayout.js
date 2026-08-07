const mongoose = require('mongoose');
const crypto = require('crypto');

const riderPayoutSchema = new mongoose.Schema({
  payoutId: { type: String, unique: true, index: true },
  rider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  amount: { type: Number, min: 0.01, required: true },
  earnings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RiderEarning' }],
  paymentMethod: {
    type: { type: String, enum: ['gcash', 'maya', 'bank_transfer'], required: true },
    accountName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    bankName: String
  },
  status: { type: String, enum: ['pending', 'processing', 'paid', 'failed'], default: 'pending', index: true },
  referenceNumber: { type: String, trim: true },
  notes: String,
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processedAt: Date
}, { timestamps: true });

riderPayoutSchema.pre('validate', function (next) {
  if (!this.payoutId) this.payoutId = `RPO-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  next();
});

module.exports = mongoose.model('RiderPayout', riderPayoutSchema);
