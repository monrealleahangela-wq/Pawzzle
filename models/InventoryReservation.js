const mongoose = require('mongoose');

const inventoryReservationSchema = new mongoose.Schema({
  reservationKey: { type: String, required: true, trim: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  checkoutBatch: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderCheckoutBatch', index: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  productVariant: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: undefined, index: true },
  quantity: { type: Number, required: true, min: 1 },
  status: {
    type: String,
    enum: ['active', 'consumed', 'restored', 'released', 'expired', 'payment_review'],
    default: 'active',
    index: true
  },
  expiresAt: { type: Date, required: true, index: true },
  consumedAt: Date,
  restoredAt: Date,
  releasedAt: Date,
  releaseReason: { type: String, trim: true, maxlength: 300 },
  paymentId: { type: String, trim: true },
  expirationLease: {
    token: { type: String, trim: true },
    claimedAt: Date,
    expiresAt: Date
  }
}, {
  timestamps: true,
  autoIndex: String(process.env.NODE_ENV || '').toLowerCase() !== 'production',
  autoCreate: String(process.env.NODE_ENV || '').toLowerCase() !== 'production'
});

inventoryReservationSchema.index(
  { reservationKey: 1 },
  { unique: true, name: 'inventory_reservation_key_unique' }
);
inventoryReservationSchema.index({ status: 1, expiresAt: 1 }, { name: 'inventory_reservation_expiry' });
inventoryReservationSchema.index(
  { status: 1, expiresAt: 1, 'expirationLease.expiresAt': 1 },
  { name: 'inventory_reservation_worker_claim' }
);
inventoryReservationSchema.index({ order: 1, status: 1 }, { name: 'inventory_reservation_order_status' });

module.exports = mongoose.model('InventoryReservation', inventoryReservationSchema);
