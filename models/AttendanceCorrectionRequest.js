const mongoose = require('mongoose');

const evidenceSchema = new mongoose.Schema({
  publicId: { type: String, required: true, trim: true, maxlength: 500 },
  deliveryType: { type: String, enum: ['authenticated'], default: 'authenticated', required: true },
  resourceType: { type: String, enum: ['image'], default: 'image', required: true },
  format: { type: String, enum: ['jpg', 'jpeg', 'png', 'webp'], required: true },
  originalName: { type: String, required: true, trim: true, maxlength: 255 },
  size: { type: Number, required: true, min: 1, max: 5 * 1024 * 1024 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uploadedAt: { type: Date, default: Date.now, required: true }
}, { _id: false });

const historySchema = new mongoose.Schema({
  action: { type: String, enum: ['submitted', 'approved', 'rejected'], required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  at: { type: Date, default: Date.now, required: true },
  note: { type: String, trim: true, maxlength: 1000 }
}, { _id: false });

const attendanceCorrectionRequestSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  attendance: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance', required: true, index: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  workDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  originalTimeIn: { type: Date, required: true },
  proposedTimeOut: { type: Date, required: true },
  reasonCategory: {
    type: String,
    enum: ['forgot_before_leaving', 'device_or_internet', 'application_malfunction', 'other'],
    required: true
  },
  reason: { type: String, required: true, trim: true, minlength: 10, maxlength: 1000 },
  evidence: { type: evidenceSchema, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', required: true, index: true },
  submittedAt: { type: Date, default: Date.now, required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  rejectionReason: { type: String, trim: true, maxlength: 1000 },
  approvedTimeOut: Date,
  payrollImpact: {
    unfinalizedPeriodIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PayrollPeriod' }],
    finalizedPeriodIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PayrollPeriod' }],
    manualReconciliationRequired: { type: Boolean, default: false }
  },
  history: { type: [historySchema], default: [] }
}, { timestamps: true, optimisticConcurrency: true });

attendanceCorrectionRequestSchema.index(
  { attendance: 1 },
  {
    name: 'attendance_one_pending_correction',
    unique: true,
    partialFilterExpression: { status: 'pending' }
  }
);
attendanceCorrectionRequestSchema.index({ store: 1, status: 1, submittedAt: -1 });
attendanceCorrectionRequestSchema.index({ employee: 1, submittedAt: -1 });

module.exports = mongoose.model('AttendanceCorrectionRequest', attendanceCorrectionRequestSchema);
