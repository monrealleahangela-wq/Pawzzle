const mongoose = require('mongoose');
const { normalizeVariantSku } = require('../utils/variantIdentity');

const skuClaimSchema = new mongoose.Schema({
  namespaceType: {
    type: String,
    enum: ['store', 'supplier'],
    required: true,
    immutable: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    immutable: true
  },
  normalizedSku: {
    type: String,
    required: true,
    immutable: true
  },
  entityType: {
    type: String,
    enum: ['product', 'product_variant', 'supplier_product', 'supplier_product_variant'],
    required: true,
    immutable: true
  },
  entity: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    immutable: true
  },
  activeKey: { type: String, select: false },
  isActive: { type: Boolean, default: true },
  claimedAt: { type: Date, default: Date.now },
  releasedAt: Date,
  releaseReason: { type: String, trim: true, maxlength: 300 }
}, {
  timestamps: true,
  autoIndex: String(process.env.NODE_ENV || '').toLowerCase() !== 'production',
  autoCreate: String(process.env.NODE_ENV || '').toLowerCase() !== 'production'
});

skuClaimSchema.pre('validate', function normalizeClaimIdentity(next) {
  try {
    this.normalizedSku = normalizeVariantSku(this.normalizedSku);
    if (this.isActive) {
      this.activeKey = `${this.namespaceType}:${String(this.owner)}:${this.normalizedSku}`;
    } else {
      this.activeKey = undefined;
    }
    next();
  } catch (error) {
    next(error);
  }
});

skuClaimSchema.index(
  { activeKey: 1 },
  {
    unique: true,
    name: 'sku_claim_active_namespace_unique',
    partialFilterExpression: { activeKey: { $type: 'string' }, isActive: true }
  }
);
skuClaimSchema.index(
  { namespaceType: 1, owner: 1, normalizedSku: 1, createdAt: -1 },
  { name: 'sku_claim_namespace_history' }
);
skuClaimSchema.index(
  { entityType: 1, entity: 1, isActive: 1 },
  { name: 'sku_claim_entity_lookup' }
);

module.exports = mongoose.model('SkuClaim', skuClaimSchema);
