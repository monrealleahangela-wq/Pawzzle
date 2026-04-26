const mongoose = require('mongoose');

const supplierProductSchema = new mongoose.Schema({
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  sku: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    enum: [
      'pet_food', 'pet_treats', 'grooming_supplies', 'medical_supplies',
      'accessories', 'toys', 'cleaning_products', 'cages_habitats',
      'leashes_collars', 'health_supplements', 'raw_materials', 'other'
    ],
    required: true
  },
  images: [{ type: String }],

  // ── Pricing ───────────────────────────────────────────
  wholesalePrice: {
    type: Number,
    required: true,
    min: 0
  },
  retailPrice: {
    type: Number,
    default: 0,
    min: 0
  },
  currency: {
    type: String,
    default: 'PHP'
  },

  // ── Stock & Ordering ──────────────────────────────────
  availableStock: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  minimumOrderQuantity: {
    type: Number,
    default: 1,
    min: 1
  },
  unitOfMeasure: {
    type: String,
    enum: ['piece', 'pack', 'box', 'kg', 'liter', 'bag', 'bottle', 'set'],
    default: 'piece'
  },
  deliveryLeadTimeDays: {
    type: Number,
    default: 3,
    min: 0
  },

  // ── Product Details ───────────────────────────────────
  brand: { type: String, trim: true },
  specifications: { type: String },
  weight: { type: Number },       // in grams
  dimensions: { type: String },   // e.g., "10x5x3 cm"
  expirationDate: { type: Date },

  // ── Metadata ──────────────────────────────────────────
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

supplierProductSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

supplierProductSchema.index({ supplier: 1, sku: 1 }, { unique: true });
supplierProductSchema.index({ category: 1 });
supplierProductSchema.index({ supplier: 1, isActive: 1 });

module.exports = mongoose.model('SupplierProduct', supplierProductSchema);
