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
  payrollInputRevision: { type: Number, min: 0, default: 0 },
  computedInputRevision: { type: Number, min: 0, default: 0 },
  policySnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  statutoryReadiness: {
    status: { type: String, enum: ['unassessed', 'blocked_missing_rules', 'blocked_missing_employee_data', 'blocked_calculation_error', 'ready'], default: 'unassessed', index: true },
    reviewedOn: { type: String, trim: true },
    blockingReasons: [{
      agency: { type: String, trim: true, maxlength: 40 },
      category: { type: String, enum: ['rules', 'employee_data', 'calculation', 'calculation_error'], trim: true },
      code: { type: String, trim: true, maxlength: 100 },
      reason: { type: String, trim: true, maxlength: 1000 }
    }],
    verifiedSnapshot: {
      checksum: { type: String, trim: true },
      employeeCount: { type: Number, min: 0 },
      reconciledEmployeeCount: { type: Number, min: 0 },
      employeeChecksums: [{ type: String, trim: true }],
      ruleVersions: [{
        agency: { type: String, trim: true, maxlength: 40 },
        version: { type: String, trim: true, maxlength: 100 },
        checksum: { type: String, trim: true, maxlength: 200 },
        effectiveFrom: { type: Date },
        effectiveThrough: { type: Date }
      }]
    }
  },
  totals: {
    employeeCount: { type: Number, min: 0, default: 0 },
    grossPay: { type: Number, min: 0, default: 0 },
    deductions: { type: Number, min: 0, default: 0 },
    netPay: { type: Number, min: 0, default: 0 }
  },
  reviewIssues: [{
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    employeeName: { type: String, trim: true, maxlength: 200 },
    code: { type: String, trim: true, maxlength: 80 },
    reason: { type: String, required: true, maxlength: 500 },
    blocking: { type: Boolean, default: false }
  }],
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  computedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  computedAt: Date,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  paidAt: Date,
  paymentRecord: {
    method: { type: String, trim: true },
    referenceNumber: { type: String, trim: true },
    paymentDate: Date,
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, trim: true, maxlength: 1000 }
  },
  paymentSummary: {
    confirmedEmployeeCount: { type: Number, min: 0, default: 0 },
    requiredEmployeeCount: { type: Number, min: 0, default: 0 },
    confirmedAmount: { type: Number, min: 0, default: 0 },
    completedAt: Date
  },
  attendanceRecalculation: {
    required: { type: Boolean, default: false },
    invalidatedAt: Date,
    invalidatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    attendance: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance' },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    workDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    reason: { type: String, trim: true, maxlength: 500 }
  }
}, { timestamps: true });

payrollPeriodSchema.index({ store: 1, periodStart: 1, periodEnd: 1 }, { unique: true });

module.exports = mongoose.model('PayrollPeriod', payrollPeriodSchema);
