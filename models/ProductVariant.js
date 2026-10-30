const mongoose = require('mongoose');
const Product = require('./Product');
const {
  assertVariantIdentityAvailable,
  buildVariantCombinationKey,
  getProductMode,
  normalizeVariantSku
} = require('../utils/variantIdentity');
const { isCatalogImageReference } = require('../utils/catalogListing');

const attributeSchema = new mongoose.Schema({
  code: { type: String, required: true },
  label: { type: String, required: true },
  valueCode: { type: String, required: true },
  valueLabel: { type: String, required: true }
}, { _id: false });

const productVariantSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    immutable: true
  },
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true,
    immutable: true,
    select: false
  },
  attributes: {
    type: [attributeSchema],
    required: true
  },
  combinationKey: {
    type: String,
    required: true,
    select: false
  },
  sku: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  normalizedSku: {
    type: String,
    required: true,
    select: false
  },
  price: {
    type: Number,
    required: true,
    min: 0.01
  },
  compareAtPrice: {
    type: Number,
    min: 0.01,
    validate: {
      validator(value) {
        return value === undefined || value === null || value >= this.price;
      },
      message: 'Compare-at price cannot be lower than the retail price.'
    }
  },
  images: {
    type: [String],
    default: [],
    validate: {
      validator: images => images.length <= 10 && images.every(isCatalogImageReference),
      message: 'Variant images must contain at most 10 valid uploaded image references.'
    }
  },
  unit: {
    type: String,
    enum: ['piece', 'pack', 'box', 'bottle', 'bag', 'kg'],
    default: 'piece'
  },
  weight: { type: Number, min: 0.001, max: 10000 },
  weightUnit: { type: String, enum: ['g', 'kg'] },
  weightIncludesPackaging: { type: Boolean, default: true },
  packagingWeight: { type: Number, min: 0.001, max: 10000 },
  packagingWeightUnit: { type: String, enum: ['g', 'kg'] },
  isActive: { type: Boolean, default: true },
  isDiscontinued: { type: Boolean, default: false },
  discontinuedAt: Date,
  discontinuedReason: { type: String, trim: true, maxlength: 500 }
}, {
  timestamps: true,
  autoIndex: String(process.env.NODE_ENV || '').toLowerCase() !== 'production',
  autoCreate: String(process.env.NODE_ENV || '').toLowerCase() !== 'production'
});

productVariantSchema.pre('validate', async function normalizeAndValidateProductVariant() {
  try {
    const identity = buildVariantCombinationKey(this.attributes);
    this.attributes = identity.attributes;
    this.combinationKey = identity.combinationKey;
  } catch (error) {
    this.invalidate('attributes', error.message);
  }
  try {
    this.normalizedSku = normalizeVariantSku(this.sku);
  } catch (error) {
    this.invalidate('sku', error.message);
  }

  if (this.isDiscontinued) {
    this.isActive = false;
    this.discontinuedAt = this.discontinuedAt || new Date();
  }

  if (!this.product) return;
  const parent = await Product.findById(this.product).select('_id store productMode').lean();
  if (!parent) {
    this.invalidate('product', 'Parent product does not exist.');
    return;
  }
  if (getProductMode(parent.productMode) !== 'variant') {
    this.invalidate('product', 'Parent product must use variant mode before child variants can be created.');
  }
  if (!parent.store) {
    this.invalidate('product', 'Parent product must belong to a Store.');
    return;
  }
  this.store = parent.store;
});

productVariantSchema.pre('save', async function rejectDuplicateProductVariantIdentity() {
  if (!this.product || !this.store || !this.combinationKey || !this.normalizedSku) return;
  await assertVariantIdentityAvailable({
    Model: this.constructor,
    parentField: 'product',
    parentId: this.product,
    ownerField: 'store',
    ownerId: this.store,
    combinationKey: this.combinationKey,
    normalizedSku: this.normalizedSku,
    excludeId: this.isNew ? undefined : this._id
  });
});

productVariantSchema.index(
  { product: 1, combinationKey: 1 },
  { unique: true, name: 'product_variant_combination_unique' }
);
productVariantSchema.index(
  { store: 1, normalizedSku: 1 },
  { unique: true, name: 'store_product_variant_sku_unique' }
);
productVariantSchema.index({ product: 1, isActive: 1, isDiscontinued: 1 });

module.exports = mongoose.model('ProductVariant', productVariantSchema);
