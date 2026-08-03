const mongoose = require('mongoose');

const inventoryTransactionSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  lot: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryLot', index: true },
  type: {
    type: String,
    enum: ['opening', 'receipt', 'sale', 'service_use', 'return_in', 'return_out',
      'transfer_in', 'transfer_out', 'adjustment_in', 'adjustment_out',
      'damage', 'expiry', 'quarantine', 'release'],
    required: true
  },
  quantity: { type: Number, required: true, min: 0.000001 },
  signedQuantity: { type: Number, required: true },
  unitCost: { type: Number, default: 0, min: 0 },
  referenceType: { type: String, trim: true },
  referenceId: mongoose.Schema.Types.ObjectId,
  idempotencyKey: { type: String, trim: true, sparse: true, unique: true },
  reason: { type: String, trim: true },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  occurredAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

inventoryTransactionSchema.index({ store: 1, product: 1, occurredAt: -1 });

module.exports = mongoose.model('InventoryTransaction', inventoryTransactionSchema);
