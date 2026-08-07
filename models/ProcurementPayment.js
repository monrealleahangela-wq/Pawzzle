const mongoose = require('mongoose');

const procurementPaymentSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true, index: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
  amount: { type: Number, required: true, min: 0.01 },
  paymentDate: { type: Date, required: true, default: Date.now },
  paymentMethod: { type: String, enum: ['bank_transfer', 'gcash', 'maya', 'cod', 'credit_terms', 'cash', 'other'], required: true },
  reference: { type: String, trim: true },
  notes: { type: String, trim: true, maxlength: 500 },
  status: { type: String, enum: ['recorded', 'void'], default: 'recorded', index: true },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  voidedAt: Date,
  voidReason: { type: String, trim: true }
}, { timestamps: true });

procurementPaymentSchema.index({ store: 1, paymentDate: -1 });
procurementPaymentSchema.index({ purchaseOrder: 1, status: 1 });

module.exports = mongoose.model('ProcurementPayment', procurementPaymentSchema);
