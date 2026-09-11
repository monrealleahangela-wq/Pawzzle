const mongoose = require('mongoose');

const payrollPeriodSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  frequency: { type: String, enum: ['weekly', 'semi_monthly', 'monthly'], required: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  payDate: { type: Date, required: true },
  status: {
    type: String,
    enum: ['draft', 'computed', 'reviewed', 'approved', 'paid'],
    default: 'draft',
    index: true
  },
  policySnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  totals: {
    employeeCount: { type: Number, min: 0, default: 0 },
    grossPay: { type: Number, min: 0, default: 0 },
    deductions: { type: Number, min: 0, default: 0 },
    netPay: { type: Number, min: 0, default: 0 }
  },
  reviewIssues: [{
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, required: true, maxlength: 500 }
  }],
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  computedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  computedAt: Date,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  paidAt: Date
}, { timestamps: true });

payrollPeriodSchema.index({ store: 1, periodStart: 1, periodEnd: 1 }, { unique: true });

module.exports = mongoose.model('PayrollPeriod', payrollPeriodSchema);
