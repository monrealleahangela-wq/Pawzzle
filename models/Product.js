const mongoose = require('mongoose');
const { PRODUCT_CATEGORY_VALUES, normalizeProductCategory } = require('../utils/productCategories');

const productSchema = new mongoose.Schema({
  productMode: {
    type: String,
    enum: ['simple', 'variant'],
    default: 'simple'
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    validate: {
      validator: value => PRODUCT_CATEGORY_VALUES.includes(normalizeProductCategory(value)),
      message: 'Invalid product category'
    },
    set: value => normalizeProductCategory(value) || value
  },
  description: {
    type: String,
    required: true
  },
  shortDescription: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0.01
  },
  stockQuantity: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  stockStatus: {
    type: String,
    enum: ['in_stock', 'out_of_stock'],
    default: 'in_stock'
  },
  lowStockThreshold: {
    type: Number,
    default: 5
  },
  maxOrderQuantity: {
    type: Number
  },
  sku: {
    type: String,
    trim: true,
    unique: true,
    required: true
  },
  barcode: {
    type: String,
    trim: true,
    default: ''
  },
  unit: {
    type: String,
    enum: ['piece', 'pack', 'box', 'bottle', 'bag', 'kg'],
    default: 'piece'
  },
  // Seller-declared weight for one sellable unit. Existing records were
  // labelled as package weight, so an absent weightIncludesPackaging flag is
  // intentionally treated as true by the parcel-weight service.
  weight: {
    type: Number,
    min: 0.001,
    max: 10000
  },
  weightUnit: {
    type: String,
    enum: ['g', 'kg'],
    default: 'kg'
  },
  weightIncludesPackaging: {
    type: Boolean,
    default: true
  },
  packagingWeight: {
    type: Number,
    min: 0.001,
    max: 10000
  },
  packagingWeightUnit: {
    type: String,
    enum: ['g', 'kg'],
    default: 'g'
  },
  weightStatus: {
    type: String,
    enum: ['seller_provided', 'verified']
  },
  images: [{
    type: String,
    required: true
  }],
  coverImage: {
    type: String
  },
  video: {
    type: String
  },
  brand: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  collectionGroup: {
    type: String,
    trim: true
  },
  visibility: {
    type: String,
    enum: ['published', 'draft', 'hidden'],
    default: 'published'
  },
  fulfillmentType: {
    type: String,
    enum: ['pickup_only'],
    default: 'pickup_only'
  },
  pickupInstructions: {
    type: String,
    trim: true
  },
  // Additional Details
  warrantyInfo: String,
  returnPolicy: String,
  expiryDate: Date,
  ingredients: String,
  usageInstructions: String,
  // Variants
  variants: [{
    combination: String, // e.g., "Red - Large"
    price: Number,
    stock: Number,
    sku: String,
    type: {
      type: String,
      enum: ['Size', 'Color', 'Weight', 'Volume', 'Other']
    },
    weight: { type: Number, min: 0.001, max: 10000 },
    weightUnit: { type: String, enum: ['g', 'kg'] },
    weightIncludesPackaging: Boolean,
    packagingWeight: { type: Number, min: 0.001, max: 10000 },
    packagingWeightUnit: { type: String, enum: ['g', 'kg'] },
    weightStatus: { type: String, enum: ['seller_provided', 'verified'] }
  }],
  suitableFor: [{
    type: String,
    enum: ['dog', 'cat', 'bird', 'fish', 'rabbit', 'hamster', 'reptile', 'all']
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store'
  },
  // ── Supplier Traceability ─────────────────────────────
  supplierRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier'
  },
  supplierProductRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SupplierProduct'
  },
  // Store-reviewed alternatives. A supplier catalog entry never changes the
  // Store's primary supplier link merely because it is selected for a PO.
  procurementOffers: [{
    supplierProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'SupplierProduct', required: true },
    matchType: { type: String, enum: ['exact', 'equivalent'], required: true },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    confirmedAt: { type: Date, required: true }
  }],
  ratings: {
    average: {
      type: Number,
      default: 0
    },
    count: {
      type: Number,
      default: 0
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
});

productSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Product', productSchema);
