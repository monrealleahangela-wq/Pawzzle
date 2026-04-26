const mongoose = require('mongoose');

const purchaseOrderItemSchema = new mongoose.Schema({
  supplierProduct: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SupplierProduct',
    required: true
  },
  productName: { type: String, required: true },
  sku: { type: String },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  totalPrice: { type: Number, required: true, min: 0 },
  receivedQuantity: { type: Number, default: 0, min: 0 },
  notes: { type: String }
}, { _id: true });

const purchaseOrderSchema = new mongoose.Schema({
  // ── Order Identity ────────────────────────────────────
  orderNumber: {
    type: String,
    unique: true,
    required: true
  },

  // ── Parties ───────────────────────────────────────────
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },

  // ── Items ─────────────────────────────────────────────
  items: [purchaseOrderItemSchema],

  // ── Pricing ───────────────────────────────────────────
  subtotal: { type: Number, required: true, min: 0 },
  shippingCost: { type: Number, default: 0, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  totalCost: { type: Number, required: true, min: 0 },

  // ── Shipping ──────────────────────────────────────────
  shippingAddress: {
    street: { type: String },
    city: { type: String },
    province: { type: String },
    zipCode: { type: String }
  },
  trackingNumber: { type: String },
  carrier: { type: String },
  estimatedDeliveryDate: { type: Date },
  actualDeliveryDate: { type: Date },

  // ── Status ────────────────────────────────────────────
  status: {
    type: String,
    enum: ['draft', 'submitted', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
    default: 'draft'
  },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'partially_paid', 'paid', 'refunded'],
    default: 'unpaid'
  },
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'gcash', 'maya', 'cod', 'credit_terms', 'other'],
    default: 'bank_transfer'
  },
  paymentReference: { type: String },
  paymentDate: { type: Date },

  // ── Notes & History ───────────────────────────────────
  sellerNotes: { type: String },
  supplierNotes: { type: String },
  cancellationReason: { type: String },
  statusHistory: [{
    status: { type: String },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String },
    timestamp: { type: Date, default: Date.now }
  }],

  // ── Metadata ──────────────────────────────────────────
  isDeleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

purchaseOrderSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Auto-generate order number
purchaseOrderSchema.pre('validate', async function (next) {
  if (!this.orderNumber) {
    const count = await mongoose.model('PurchaseOrder').countDocuments();
    this.orderNumber = `PO-${Date.now()}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

purchaseOrderSchema.index({ seller: 1, status: 1 });
purchaseOrderSchema.index({ supplier: 1, status: 1 });
purchaseOrderSchema.index({ store: 1, status: 1 });
purchaseOrderSchema.index({ orderNumber: 1 });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
