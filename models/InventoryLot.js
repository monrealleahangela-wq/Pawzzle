const mongoose = require('mongoose');

const inventoryLotSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  lotNumber: { type: String, required: true, trim: true },
  manufacturer: { type: String, trim: true },
  receivedAt: { type: Date, required: true, default: Date.now },
  manufacturedAt: Date,
  expiresAt: { type: Date, index: true },
  quantityReceived: { type: Number, required: true, min: 0 },
  quantityAvailable: { type: Number, required: true, min: 0 },
  quantityReserved: { type: Number, default: 0, min: 0 },
  unitCost: { type: Number, default: 0, min: 0 },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder' },
  purchaseOrderItem: mongoose.Schema.Types.ObjectId,
  status: {
    type: String,
    enum: ['available', 'depleted', 'quarantined', 'recalled', 'expired'],
    default: 'available',
    index: true
  },
  isVaccine: { type: Boolean, default: false, index: true },
  vaccineType: { type: String, trim: true },
  storageNotes: { type: String, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

inventoryLotSchema.index({ store: 1, product: 1, lotNumber: 1 }, { unique: true });
inventoryLotSchema.index({ store: 1, status: 1, expiresAt: 1 });

inventoryLotSchema.pre('save', function (next) {
  if (this.expiresAt && this.expiresAt <= new Date() && this.quantityAvailable > 0) {
    this.status = 'expired';
  } else if (this.quantityAvailable === 0 && this.status === 'available') {
    this.status = 'depleted';
  }
  next();
});

module.exports = mongoose.model('InventoryLot', inventoryLotSchema);
