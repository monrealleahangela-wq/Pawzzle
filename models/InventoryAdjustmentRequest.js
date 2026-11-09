const mongoose = require('mongoose');

const evidenceSchema = new mongoose.Schema({
  url: { type: String, required: true, trim: true },
  originalName: { type: String, trim: true },
  publicId: { type: String, trim: true }
}, { _id: false });

const inventoryAdjustmentRequestSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  inventory: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true, index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  productVariant: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: undefined },
  adjustmentType: {
    type: String,
    enum: ['damage', 'expired', 'missing', 'internal_use', 'count_discrepancy', 'other'],
    required: true
  },
  quantity: { type: Number, required: true, min: 1 },
  stockBefore: { type: Number, required: true, min: 0 },
  stockAfter: { type: Number, required: true, min: 0 },
  reason: { type: String, required: true, trim: true, minlength: 8, maxlength: 1000 },
  evidence: { type: [evidenceSchema], default: [] },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true
  },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  reviewNotes: { type: String, trim: true, maxlength: 1000 },
  appliedTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryTransaction' },
  appliedAt: Date
}, {
  timestamps: true,
  autoIndex: String(process.env.NODE_ENV || '').toLowerCase() !== 'production',
  autoCreate: String(process.env.NODE_ENV || '').toLowerCase() !== 'production'
});

inventoryAdjustmentRequestSchema.index({ store: 1, status: 1, createdAt: -1 });
inventoryAdjustmentRequestSchema.index({ requestedBy: 1, createdAt: -1 });

module.exports = mongoose.model('InventoryAdjustmentRequest', inventoryAdjustmentRequestSchema);
