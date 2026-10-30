const mongoose = require('mongoose');

const supplierVariantMappingSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, immutable: true },
  sellerProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, immutable: true },
  sellerVariant: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', required: true, immutable: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, immutable: true },
  supplierProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'SupplierProduct', required: true, immutable: true },
  supplierVariant: { type: mongoose.Schema.Types.ObjectId, ref: 'SupplierProductVariant', required: true, immutable: true },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'rejected', 'inactive'],
    default: 'pending',
    index: true
  },
  sourcePriority: { type: Number, min: 1, default: 1 },
  confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  confirmedAt: Date,
  deactivatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deactivatedAt: Date,
  notes: { type: String, trim: true, maxlength: 1000 },
  statusHistory: [{
    status: { type: String, enum: ['pending', 'confirmed', 'rejected', 'inactive'], required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now },
    notes: { type: String, trim: true, maxlength: 1000 }
  }]
}, {
  timestamps: true,
  autoIndex: String(process.env.NODE_ENV || '').toLowerCase() !== 'production',
  autoCreate: String(process.env.NODE_ENV || '').toLowerCase() !== 'production'
});

supplierVariantMappingSchema.index(
  { store: 1, sellerVariant: 1, supplierVariant: 1 },
  { unique: true, name: 'store_seller_supplier_variant_mapping_unique' }
);
supplierVariantMappingSchema.index({ store: 1, supplierVariant: 1, status: 1 });
supplierVariantMappingSchema.index({ sellerVariant: 1, status: 1, sourcePriority: 1 });

module.exports = mongoose.model('SupplierVariantMapping', supplierVariantMappingSchema);
