const mongoose = require('mongoose');

const supplierProductSchema = new mongoose.Schema({
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  itemType: {
    type: String,
    enum: ['pet_supply', 'product', 'live_pet'],
    default: 'pet_supply',
    index: true
  },
  pet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pet',
    default: undefined,
    index: true
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
      'leashes_collars', 'health_supplements', 'raw_materials', 'live_pets', 'general_product',
      'consumables', 'equipment', 'other'
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
    enum: ['piece', 'pack', 'box', 'kg', 'liter', 'bag', 'bottle', 'set', 'ml', 'gram', 'tube'],
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
}, {
  // SupplierProduct has a guarded, explicit production index migration. Do
  // not let application startup create only part of that migration.
  autoIndex: String(process.env.NODE_ENV || '').toLowerCase() !== 'production',
  autoCreate: String(process.env.NODE_ENV || '').toLowerCase() !== 'production'
});

supplierProductSchema.pre('save', function (next) {
  if (this.itemType === 'live_pet') {
    this.availableStock = Math.min(1, Number(this.availableStock));
    this.minimumOrderQuantity = 1;
    this.unitOfMeasure = 'piece';
  } else {
    // Ordinary offers are not Pet records. Keeping this path absent also
    // prevents misleading null references in new catalog documents.
    this.pet = undefined;
  }
  this.updatedAt = Date.now();
  next();
});

supplierProductSchema.index({ supplier: 1, sku: 1 }, { unique: true });
supplierProductSchema.index({ category: 1 });
supplierProductSchema.index({ supplier: 1, isActive: 1 });
// A compound sparse index still indexes ordinary offers because `supplier`
// always exists, causing a false duplicate on `{ supplier, pet: null }`.
// Only actual live-pet ObjectId references belong in this unique index.
supplierProductSchema.index({ supplier: 1, pet: 1 }, {
  unique: true,
  name: 'supplier_live_pet_unique',
  partialFilterExpression: { pet: { $type: 'objectId' } }
});

module.exports = mongoose.model('SupplierProduct', supplierProductSchema);
