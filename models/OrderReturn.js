const crypto = require('crypto');
const mongoose = require('mongoose');

const attributeSnapshotSchema = new mongoose.Schema({
  code: String, label: String, valueCode: String, valueLabel: String
}, { _id: false });

const evidenceSchema = new mongoose.Schema({
  publicId: { type: String, required: true },
  deliveryType: { type: String, enum: ['authenticated', 'upload'], default: 'authenticated' },
  resourceType: { type: String, enum: ['image', 'video'], default: 'image' },
  format: { type: String, required: true },
  originalName: { type: String, trim: true, maxlength: 255 },
  size: { type: Number, min: 1, max: 25 * 1024 * 1024 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uploadedAt: { type: Date, default: Date.now }
});

const addressSnapshotSchema = new mongoose.Schema({
  formattedAddress: String, street: String, barangay: String, city: String,
  province: String, zipCode: String, country: String, landmark: String,
  coordinates: { lat: Number, lng: Number }
}, { _id: false });

const CASE_STATUSES = [
  'issue_reported', 'seller_review', 'return_approved_awaiting_pickup',
  'pickup_scheduled', 'rider_assigned', 'going_to_customer', 'return_picked_up',
  'returning_to_seller', 'returned_to_seller', 'under_inspection',
  'refund_approved', 'refund_processing', 'refund_completed',
  'replacement_approved', 'replacement_prepared', 'replacement_rider_assigned',
  'replacement_picked_up', 'replacement_in_transit', 'replacement_arrived',
  'replacement_delivered', 'awaiting_customer_confirmation', 'disputed',
  'rejected', 'resolved', 'cancelled',
  // Legacy lifecycle values remain readable while existing records migrate.
  'requested', 'approved', 'received', 'inspected', 'refund_pending', 'refunded', 'closed'
];

const orderReturnSchema = new mongoose.Schema({
  caseId: {
    type: String, required: true, unique: true,
    default: () => `RET-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
  orderItem: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true, index: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, immutable: true, index: true },
  itemSnapshot: {
    parentProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    productVariant: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant' },
    itemType: { type: String, enum: ['product', 'pet'], default: 'product' },
    name: { type: String, required: true },
    sku: String,
    attributes: [attributeSnapshotSchema],
    image: String,
    unitPrice: { type: Number, required: true, min: 0 },
    purchasedQuantity: { type: Number, required: true, min: 1 },
    unitWeightKg: { type: Number, min: 0 }
  },
  requestedQuantity: { type: Number, required: true, min: 1 },
  issueType: {
    type: String,
    enum: ['damaged', 'wrong_item', 'missing_item', 'defective', 'not_as_described', 'missing_parts', 'other'],
    default: 'other', required: true
  },
  description: { type: String, trim: true, minlength: 3, maxlength: 2000 },
  reason: { type: String, required: true, trim: true, minlength: 3, maxlength: 2000 },
  requestedResolution: {
    type: String, enum: ['return_refund', 'replacement', 'refund_only'],
    default: 'return_refund', required: true
  },
  evidence: { type: [evidenceSchema], default: [] },
  policySnapshot: {
    type: { type: String, enum: ['full_refund', 'conditional_refund', 'no_refund'] },
    summary: String, conditions: String, capturedAt: Date
  },
  status: { type: String, enum: CASE_STATUSES, default: 'issue_reported', index: true },
  revision: { type: Number, default: 0, min: 0 },
  decision: {
    outcome: { type: String, enum: ['approve_return', 'approve_refund', 'approve_replacement', 'reject'] },
    reason: { type: String, trim: true, maxlength: 2000 },
    requiresPhysicalReturn: Boolean,
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedAt: Date
  },
  pickup: {
    status: {
      type: String,
      enum: ['not_required', 'awaiting_schedule', 'scheduled', 'rider_assigned', 'going_to_customer', 'picked_up', 'returning', 'delivered'],
      default: 'not_required'
    },
    delivery: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery' },
    assignedRider: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    scheduledAt: Date,
    pickupAddress: addressSnapshotSchema,
    sellerDestination: addressSnapshotSchema,
    verificationCode: { type: String, select: false },
    verificationCodeLast4: String,
    verifiedAt: Date,
    photo: String,
    evidence: { type: [evidenceSchema], default: [] }
  },
  inspection: {
    acceptedQuantity: { type: Number, min: 0 },
    resellableQuantity: { type: Number, min: 0 },
    nonResellableQuantity: { type: Number, min: 0 },
    outcome: { type: String, enum: ['eligible_refund', 'eligible_replacement', 'partial_refund', 'rejected'] },
    note: { type: String, trim: true, maxlength: 2000 },
    evidence: { type: [evidenceSchema], default: [] },
    inspectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    inspectedAt: Date
  },
  restock: {
    status: { type: String, enum: ['not_applicable', 'pending', 'applied', 'failed'], default: 'pending' },
    idempotencyKey: { type: String, trim: true }, appliedAt: Date, failureReason: String
  },
  refund: {
    status: {
      type: String, enum: ['not_requested', 'review_required', 'approved', 'processing', 'refunded', 'denied'],
      default: 'not_requested'
    },
    amount: { type: Number, min: 0 },
    productAmount: { type: Number, min: 0 },
    shippingAmount: { type: Number, min: 0, default: 0 },
    otherEligibleCharges: { type: Number, min: 0, default: 0 },
    paymentMethod: String,
    reference: { type: String, trim: true },
    provider: { type: String, enum: ['paymongo', 'manual'] },
    providerRefundId: { type: String, trim: true },
    providerPaymentId: { type: String, trim: true },
    providerStatus: {
      type: String,
      enum: ['not_submitted', 'submitting', 'pending', 'processing', 'succeeded', 'failed'],
      default: 'not_submitted'
    },
    providerAttempt: { type: Number, min: 1, default: 1 },
    providerUpdatedAt: Date,
    idempotencyKey: { type: String, trim: true },
    callbackIds: [{ type: String, trim: true }],
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: Date
  },
  replacement: {
    status: {
      type: String,
      enum: ['not_requested', 'approved', 'prepared', 'rider_assigned', 'picked_up', 'in_transit', 'arrived', 'delivered', 'confirmed', 'failed'],
      default: 'not_requested'
    },
    delivery: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery' },
    assignedRider: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    preparedAt: Date, deliveredAt: Date, confirmedAt: Date
  },
  dispute: {
    status: { type: String, enum: ['none', 'open', 'resolved'], default: 'none' },
    reason: { type: String, trim: true, maxlength: 2000 },
    openedAt: Date,
    openedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    adminDecision: { type: String, enum: ['uphold_rejection', 'approve_return', 'approve_refund', 'approve_replacement'] },
    adminReason: { type: String, trim: true, maxlength: 2000 },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedAt: Date
  },
  history: [{
    action: { type: String, required: true }, fromStatus: String, toStatus: String,
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actorRole: String,
    note: { type: String, trim: true, maxlength: 2000 },
    at: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true,
  autoIndex: String(process.env.NODE_ENV || '').toLowerCase() !== 'production',
  autoCreate: String(process.env.NODE_ENV || '').toLowerCase() !== 'production'
});

orderReturnSchema.index({ order: 1, orderItem: 1 }, { unique: true, name: 'order_return_item_unique' });
orderReturnSchema.index({ store: 1, status: 1, updatedAt: -1 }, { name: 'order_return_store_status' });
orderReturnSchema.index({ customer: 1, updatedAt: -1 }, { name: 'order_return_customer_updated' });
orderReturnSchema.index({ 'pickup.assignedRider': 1, status: 1 }, { name: 'order_return_pickup_rider' });
orderReturnSchema.index({ 'replacement.assignedRider': 1, status: 1 }, { name: 'order_return_replacement_rider' });
orderReturnSchema.index(
  { 'restock.idempotencyKey': 1 },
  { unique: true, sparse: true, name: 'order_return_restock_idempotency_unique' }
);
orderReturnSchema.index(
  { 'refund.idempotencyKey': 1 },
  { unique: true, sparse: true, name: 'order_return_refund_idempotency_unique' }
);
orderReturnSchema.index(
  { 'refund.providerRefundId': 1 },
  { unique: true, sparse: true, name: 'order_return_provider_refund_unique' }
);

orderReturnSchema.statics.CASE_STATUSES = CASE_STATUSES;

module.exports = mongoose.model('OrderReturn', orderReturnSchema);
