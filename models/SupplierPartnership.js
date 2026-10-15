const mongoose = require('mongoose');
const { STATUSES } = require('../utils/supplierPartnershipPolicy');

const acceptanceSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  hash: { type: String, required: true },
  acceptedAt: { type: Date, required: true }
}, { _id: false });

const versionSchema = new mongoose.Schema({
  number: { type: Number, required: true, min: 1 },
  terms: { type: mongoose.Schema.Types.Mixed, required: true },
  hash: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, required: true },
  sellerAcceptance: acceptanceSchema,
  supplierAcceptance: acceptanceSchema
}, { _id: false });

const partnershipSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: STATUSES, required: true, default: 'requested' },
  currentVersion: { type: Number, required: true, default: 1 },
  revision: { type: Number, required: true, default: 0 },
  versions: { type: [versionSchema], required: true },
  history: [{
    action: { type: String, required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    version: Number,
    note: { type: String, maxlength: 1000 },
    at: { type: Date, required: true }
  }],
  terminatedAt: Date,
  expiredAt: Date
}, {
  timestamps: true,
  optimisticConcurrency: true,
  // The new agreement indexes must also exist before production accepts traffic.
  autoIndex: String(process.env.NODE_ENV || '').toLowerCase() !== 'production',
  autoCreate: String(process.env.NODE_ENV || '').toLowerCase() !== 'production'
});

partnershipSchema.index({ store: 1, supplier: 1 }, { unique: true });
partnershipSchema.index({ supplier: 1, status: 1 });
partnershipSchema.index({ status: 1, 'versions.terms.effectiveUntil': 1 });

module.exports = mongoose.model('SupplierPartnership', partnershipSchema);
