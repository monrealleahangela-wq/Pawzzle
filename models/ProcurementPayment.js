const mongoose = require('mongoose');

const procurementPaymentSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true, index: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
  transactionType: { type: String, enum: ['payment', 'refund', 'credit'], default: 'payment', index: true },
  amount: { type: Number, required: true, min: 0.01 },
  paymentDate: { type: Date, required: true, default: Date.now },
  paymentMethod: { type: String, enum: ['paymongo', 'bank_transfer', 'gcash', 'maya', 'cod', 'credit_terms', 'cash', 'financial_adjustment', 'other'], required: true },
  provider: { type: String, enum: ['manual', 'paymongo'], default: 'manual', index: true },
  providerPaymentId: { type: String, trim: true, sparse: true, unique: true },
  checkoutSessionId: { type: String, trim: true, index: true },
  reference: { type: String, trim: true },
  notes: { type: String, trim: true, maxlength: 500 },
  status: { type: String, enum: ['recorded', 'authorized', 'duplicate', 'void'], default: 'recorded', index: true },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receivingReport: { type: mongoose.Schema.Types.ObjectId, ref: 'ProcurementReceivingReport' },
  resolutionSubmission: { type: mongoose.Schema.Types.ObjectId },
  voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  voidedAt: Date,
  voidReason: { type: String, trim: true }
}, { timestamps: true });

procurementPaymentSchema.index({ store: 1, paymentDate: -1 });
procurementPaymentSchema.index({ purchaseOrder: 1, status: 1 });
for (const transactionType of ['refund', 'credit']) {
  procurementPaymentSchema.index(
    { receivingReport: 1, resolutionSubmission: 1, transactionType: 1 },
    {
      name: `unique_procurement_${transactionType}_adjustment`,
      unique: true,
      partialFilterExpression: {
        receivingReport: { $exists: true },
        resolutionSubmission: { $exists: true },
        transactionType
      }
    }
  );
}

module.exports = mongoose.model('ProcurementPayment', procurementPaymentSchema);
