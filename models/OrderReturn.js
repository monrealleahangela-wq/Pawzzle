const mongoose = require('mongoose');

const PROGRESS = ['requested', 'approved', 'preparing', 'ready_for_pickup', 'returning', 'arrived', 'completed'];
const STATUS = [...PROGRESS, 'rejected', 'cancelled'];

const historySchema = new mongoose.Schema({
  action: { type: String, required: true },
  fromStatus: String,
  toStatus: { type: String, required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  at: { type: Date, required: true },
  note: { type: String, maxlength: 1000 }
}, { _id: false });

const schema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
  orderItem: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  itemSnapshot: {
    name: { type: String, required: true },
    itemType: { type: String, enum: ['pet', 'product'], required: true },
    quantity: { type: Number, min: 1, required: true }
  },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, immutable: true, index: true },
  assignedRider: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: STATUS, required: true, default: 'requested' },
  revision: { type: Number, default: 0 },
  history: { type: [historySchema], default: [] },
  evidence: [{
    publicId: { type: String, required: true },
    deliveryType: { type: String, enum: ['authenticated'], default: 'authenticated' },
    format: { type: String, enum: ['jpg', 'jpeg', 'png', 'webp'], required: true },
    originalName: { type: String, maxlength: 255 },
    size: { type: Number, min: 1, max: 5 * 1024 * 1024 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, required: true }
  }],
  exception: {
    kind: { type: String, enum: ['delayed', 'pickup_failed', null], default: null },
    reason: { type: String, maxlength: 1000 },
    reportedAt: Date,
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  sellerReceipt: {
    confirmedAt: Date,
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, maxlength: 1000 }
  },
  refund: {
    status: { type: String, enum: ['unlinked', 'review_required', 'processing', 'refunded', 'denied'], default: 'unlinked' },
    reference: String
  }
}, { timestamps: true });

// One return per purchased line item; the deterministic _id used by the service
// also prevents concurrent duplicates before this index has been built.
schema.index({ order: 1, orderItem: 1 }, { unique: true });
schema.index({ assignedRider: 1, status: 1 });

module.exports = mongoose.model('OrderReturn', schema);
