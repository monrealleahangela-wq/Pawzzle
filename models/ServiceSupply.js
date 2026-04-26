const mongoose = require('mongoose');

const serviceSupplySchema = new mongoose.Schema({
  // ── Ownership ─────────────────────────────────────────
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // ── Supply Details ────────────────────────────────────
  name: {
    type: String,
    required: true,
    trim: true
  },
  sku: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    enum: ['grooming_supplies', 'medical_supplies', 'cleaning_products', 'accessories', 'consumables', 'equipment', 'other'],
    required: true
  },
  description: { type: String, default: '' },
  images: [{ type: String }],

  // ── Stock Tracking ────────────────────────────────────
  currentStock: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  reservedStock: {
    type: Number,
    default: 0,
    min: 0
  },
  minimumStock: {
    type: Number,
    default: 5,
    min: 0
  },
  maximumStock: {
    type: Number,
    default: 500,
    min: 0
  },
  unitOfMeasure: {
    type: String,
    enum: ['piece', 'ml', 'liter', 'gram', 'kg', 'pack', 'bottle', 'tube', 'set'],
    default: 'piece'
  },
  costPerUnit: {
    type: Number,
    default: 0,
    min: 0
  },

  // ── Supply Usage Per Service ──────────────────────────
  usagePerService: {
    type: Number,
    default: 1,
    min: 0
  },

  // ── Linked Services ───────────────────────────────────
  linkedServices: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service'
  }],

  // ── Supplier Reference ────────────────────────────────
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier'
  },
  supplierProduct: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SupplierProduct'
  },

  // ── Tracking ──────────────────────────────────────────
  expirationDate: { type: Date },
  lastRestockedAt: { type: Date },
  lastUsedAt: { type: Date },

  // ── Metadata ──────────────────────────────────────────
  status: {
    type: String,
    enum: ['in_stock', 'low_stock', 'out_of_stock', 'expired', 'archived'],
    default: 'in_stock'
  },
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

serviceSupplySchema.pre('save', function (next) {
  this.updatedAt = Date.now();

  // Auto-compute status
  const available = this.currentStock - this.reservedStock;
  if (this.expirationDate && new Date(this.expirationDate) < new Date()) {
    this.status = 'expired';
  } else if (available <= 0) {
    this.status = 'out_of_stock';
  } else if (available <= this.minimumStock) {
    this.status = 'low_stock';
  } else {
    this.status = 'in_stock';
  }
  next();
});

// Virtual: available stock
serviceSupplySchema.virtual('availableStock').get(function () {
  return Math.max(0, this.currentStock - this.reservedStock);
});

// Check if supply can support a booking
serviceSupplySchema.methods.canSupport = function (quantity = 1) {
  const needed = this.usagePerService * quantity;
  return this.availableStock >= needed;
};

// Deduct supply after service completion
serviceSupplySchema.methods.deduct = async function (quantity = 1) {
  const needed = this.usagePerService * quantity;
  if (this.currentStock < needed) {
    throw new Error(`Insufficient supply: ${this.name}. Need ${needed}, have ${this.currentStock}`);
  }
  this.currentStock -= needed;
  this.lastUsedAt = new Date();
  await this.save();
  return this;
};

serviceSupplySchema.index({ store: 1, category: 1 });
serviceSupplySchema.index({ store: 1, status: 1 });
serviceSupplySchema.index({ linkedServices: 1 });

module.exports = mongoose.model('ServiceSupply', serviceSupplySchema);
