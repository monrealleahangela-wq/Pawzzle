const mongoose = require('mongoose');

const procurementCartItemSchema = new mongoose.Schema({
  supplierProduct: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SupplierProduct',
    required: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  quantity: { type: Number, required: true, min: 1 },
  storeProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  addedUnitPrice: { type: Number, required: true, min: 0 },
  addedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { _id: true });

const procurementCartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  items: { type: [procurementCartItemSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

procurementCartSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// A procurement cart belongs to one authenticated operator within one store.
// Supplier identity remains attached to every line and is always derived by
// the server from SupplierProduct rather than accepted from the client.
procurementCartSchema.index({ user: 1, store: 1 }, { unique: true });
procurementCartSchema.index({ store: 1, updatedAt: -1 });

module.exports = mongoose.model('ProcurementCart', procurementCartSchema);
