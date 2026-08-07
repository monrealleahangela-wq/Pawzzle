const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  category: { type: String, required: true, trim: true },
  payee: { type: String, required: true, trim: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', index: true },
  purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', index: true },
  description: { type: String, trim: true },
  expenseDate: { type: Date, required: true, default: Date.now, index: true },
  taxCode: {
    type: String,
    enum: ['VAT_12_INCLUSIVE', 'VAT_12_EXCLUSIVE', 'NON_VAT', 'VAT_EXEMPT', 'ZERO_RATED'],
    default: 'NON_VAT'
  },
  netAmount: { type: Number, required: true, min: 0 },
  vatAmount: { type: Number, required: true, min: 0 },
  grossAmount: { type: Number, required: true, min: 0 },
  paymentMethod: { type: String, trim: true },
  paymentReference: { type: String, trim: true },
  attachmentUrl: String,
  status: {
    type: String,
    enum: ['draft', 'submitted', 'approved', 'paid', 'rejected', 'void'],
    default: 'draft'
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  rejectionReason: String
}, { timestamps: true });

expenseSchema.index({ store: 1, expenseDate: -1, status: 1 });
expenseSchema.index({ store: 1, purchaseOrder: 1 });

module.exports = mongoose.model('Expense', expenseSchema);
