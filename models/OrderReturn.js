const mongoose = require('mongoose');

const attributeSnapshotSchema = new mongoose.Schema({
  code: String,
  label: String,
  valueCode: String,
  valueLabel: String
}, { _id: false });

const orderReturnSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
  orderItem: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true, index: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, immutable: true, index: true },
  itemSnapshot: {
    parentProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productVariant: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    name: { type: String, required: true },
    sku: String,
    attributes: [attributeSnapshotSchema],
    image: String,
    unitPrice: { type: Number, required: true, min: 0 },
    purchasedQuantity: { type: Number, required: true, min: 1 }
  },
  requestedQuantity: { type: Number, required: true, min: 1 },
  reason: { type: String, required: true, trim: true, minlength: 3, maxlength: 1000 },
  status: {
    type: String,
    enum: ['requested', 'approved', 'rejected', 'received', 'inspected', 'refund_pending', 'refunded', 'closed', 'cancelled'],
    default: 'requested',
    index: true
  },
  revision: { type: Number, default: 0, min: 0 },
  inspection: {
    acceptedQuantity: { type: Number, min: 0 },
    resellableQuantity: { type: Number, min: 0 },
    nonResellableQuantity: { type: Number, min: 0 },
    note: { type: String, trim: true, maxlength: 1000 },
    inspectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    inspectedAt: Date
  },
  restock: {
    status: { type: String, enum: ['not_applicable', 'pending', 'applied', 'failed'], default: 'pending' },
    idempotencyKey: { type: String, trim: true },
    appliedAt: Date,
    failureReason: String
  },
  refund: {
    status: { type: String, enum: ['not_requested', 'review_required', 'processing', 'refunded', 'denied'], default: 'not_requested' },
    amount: { type: Number, min: 0 },
    reference: { type: String, trim: true },
    callbackIds: [{ type: String, trim: true }],
    updatedAt: Date
  },
  history: [{
    action: { type: String, required: true },
    fromStatus: String,
    toStatus: String,
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, trim: true, maxlength: 1000 },
    at: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true,
  autoIndex: String(process.env.NODE_ENV || '').toLowerCase() !== 'production',
  autoCreate: String(process.env.NODE_ENV || '').toLowerCase() !== 'production'
});

orderReturnSchema.index({ order: 1, orderItem: 1 }, { unique: true, name: 'order_return_item_unique' });
orderReturnSchema.index({ store: 1, status: 1, updatedAt: -1 }, { name: 'order_return_store_status' });
orderReturnSchema.index(
  { 'restock.idempotencyKey': 1 },
  { unique: true, sparse: true, name: 'order_return_restock_idempotency_unique' }
);

module.exports = mongoose.model('OrderReturn', orderReturnSchema);
