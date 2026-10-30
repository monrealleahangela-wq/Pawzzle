const mongoose = require('mongoose');
const SupplierProduct = require('./SupplierProduct');
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

const supplierProductVariantSchema = new mongoose.Schema({
  supplierProduct: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SupplierProduct',
    required: true,
    immutable: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
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
  wholesalePrice: { type: Number, required: true, min: 0 },
  availableStock: { type: Number, required: true, default: 0, min: 0 },
  minimumOrderQuantity: { type: Number, default: 1, min: 1 },
  unitOfMeasure: {
    type: String,
    enum: ['piece', 'pack', 'box', 'kg', 'liter', 'bag', 'bottle', 'set', 'ml', 'gram', 'tube'],
    default: 'piece'
  },
  weight: { type: Number, min: 0.001, max: 10000000 },
  weightUnit: { type: String, enum: ['g', 'kg'], default: 'g' },
  images: {
    type: [String],
    default: [],
    validate: {
      validator: images => images.length <= 10 && images.every(isCatalogImageReference),
      message: 'Variant images must contain at most 10 valid uploaded image references.'
    }
  },
  isActive: { type: Boolean, default: true },
  isDiscontinued: { type: Boolean, default: false },
  discontinuedAt: Date,
  discontinuedReason: { type: String, trim: true, maxlength: 500 },
  regulatoryReview: {
    scope: {
      type: String,
      enum: ['not_assessed', 'variant', 'parent'],
      default: 'not_assessed'
    },
    status: {
      type: String,
      enum: ['not_assessed', 'pending_review', 'approved', 'changes_requested', 'rejected'],
      default: 'not_assessed'
    },
    submittedAt: Date,
    reviewedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, trim: true, maxlength: 1000 }
  }
}, {
  timestamps: true,
  autoIndex: String(process.env.NODE_ENV || '').toLowerCase() !== 'production',
  autoCreate: String(process.env.NODE_ENV || '').toLowerCase() !== 'production'
});

supplierProductVariantSchema.pre('validate', async function normalizeAndValidateSupplierVariant() {
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

  if (!this.supplierProduct) return;
  const parentQuery = SupplierProduct.findById(this.supplierProduct).select('_id supplier productMode').lean();
  if (this.$session()) parentQuery.session(this.$session());
  const parent = await parentQuery;
  if (!parent) {
    this.invalidate('supplierProduct', 'Parent supplier product does not exist.');
    return;
  }
  if (getProductMode(parent.productMode) !== 'variant') {
    this.invalidate('supplierProduct', 'Parent supplier product must use variant mode before child variants can be created.');
  }
  this.supplier = parent.supplier;
});

supplierProductVariantSchema.pre('save', async function rejectDuplicateSupplierVariantIdentity() {
  if (!this.supplierProduct || !this.supplier || !this.combinationKey || !this.normalizedSku) return;
  await assertVariantIdentityAvailable({
    Model: this.constructor,
    parentField: 'supplierProduct',
    parentId: this.supplierProduct,
    ownerField: 'supplier',
    ownerId: this.supplier,
    combinationKey: this.combinationKey,
    normalizedSku: this.normalizedSku,
    excludeId: this.isNew ? undefined : this._id,
    session: this.$session()
  });
});

supplierProductVariantSchema.index(
  { supplierProduct: 1, combinationKey: 1 },
  { unique: true, name: 'supplier_product_variant_combination_unique' }
);
supplierProductVariantSchema.index(
  { supplier: 1, normalizedSku: 1 },
  { unique: true, name: 'supplier_product_variant_sku_unique' }
);
supplierProductVariantSchema.index({ supplierProduct: 1, isActive: 1, isDiscontinued: 1 });

module.exports = mongoose.model('SupplierProductVariant', supplierProductVariantSchema);
