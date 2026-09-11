const mongoose = require('mongoose');

const adjustmentSchema = new mongoose.Schema({
  type: { type: String, required: true, trim: true, maxlength: 100 },
  amount: { type: Number, min: 0, required: true },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  source: { type: String, enum: ['manual', 'attendance', 'leave', 'rider_earning'], default: 'manual' },
  sourceId: { type: mongoose.Schema.Types.ObjectId },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const payslipSchema = new mongoose.Schema({
  payrollPeriod: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollPeriod', required: true, index: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  employeeSnapshot: {
    name: { type: String, required: true },
    staffId: String,
    role: String,
    compensationType: { type: String, enum: ['salary', 'daily', 'hourly'], required: true },
    baseRate: { type: Number, min: 0, required: true },
    effectiveDate: Date
  },
  attendanceSummary: {
    scheduledWorkDays: { type: Number, min: 0, default: 0 },
    daysPresent: { type: Number, min: 0, default: 0 },
    paidLeaveDays: { type: Number, min: 0, default: 0 },
    unpaidLeaveDays: { type: Number, min: 0, default: 0 },
    legacyUnclassifiedLeaveDays: { type: Number, min: 0, default: 0 },
    flaggedAttendanceDays: { type: Number, min: 0, default: 0 },
    absences: { type: Number, min: 0, default: 0 },
    lateMinutes: { type: Number, min: 0, default: 0 },
    undertimeMinutes: { type: Number, min: 0, default: 0 },
    overtimeMinutes: { type: Number, min: 0, default: 0 },
    workedMinutes: { type: Number, min: 0, default: 0 }
  },
  basePay: { type: Number, min: 0, required: true },
  additions: [adjustmentSchema],
  deductions: [adjustmentSchema],
  grossPay: { type: Number, min: 0, required: true },
  netPay: { type: Number, min: 0, required: true },
  paymentStatus: { type: String, enum: ['unpaid', 'recorded_paid'], default: 'unpaid' },
  paymentRecord: {
    method: { type: String, trim: true },
    referenceNumber: { type: String, trim: true },
    paymentDate: Date,
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, trim: true, maxlength: 1000 }
  },
  finalizedAt: Date
}, { timestamps: true });

payslipSchema.index({ payrollPeriod: 1, employee: 1 }, { unique: true });

module.exports = mongoose.model('Payslip', payslipSchema);
