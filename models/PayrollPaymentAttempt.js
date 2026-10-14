const crypto = require('crypto');
const mongoose = require('mongoose');

const PAYMENT_STATUSES = ['pending', 'processing', 'for_confirmation', 'paid', 'failed', 'on_hold'];

const historySchema = new mongoose.Schema({
  fromStatus: { type: String, enum: [...PAYMENT_STATUSES, 'none'], required: true },
  toStatus: { type: String, enum: PAYMENT_STATUSES, required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  at: { type: Date, default: Date.now, required: true },
  reason: { type: String, trim: true, maxlength: 500, default: '' }
}, { _id: true });

const payrollPaymentAttemptSchema = new mongoose.Schema({
  attemptId: { type: String, default: () => crypto.randomUUID(), immutable: true, unique: true, index: true },
  idempotencyKey: { type: String, required: true, select: false, immutable: true },
  idempotencyFingerprint: { type: String, required: true, select: false, immutable: true },
  activeKey: { type: String, select: false },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true, immutable: true },
  payrollPeriod: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollPeriod', required: true, index: true, immutable: true },
  payslip: { type: mongoose.Schema.Types.ObjectId, ref: 'Payslip', required: true, index: true, immutable: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true, immutable: true },
  retryOf: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollPaymentAttempt', immutable: true },
  amount: { type: Number, required: true, min: 0.01, immutable: true },
  currency: { type: String, enum: ['PHP'], default: 'PHP', immutable: true },
  externalMethod: { type: String, enum: ['bank_transfer', 'gcash', 'maya', 'cash', 'cheque', 'other'], required: true },
  encryptedTransferReference: { type: String, required: true, select: false },
  referenceFingerprint: { type: String, required: true, select: false },
  referenceMask: { type: String, required: true },
  transferAt: { type: Date, required: true },
  encryptedDestination: { type: String, select: false },
  destinationType: { type: String, trim: true, maxlength: 80 },
  destinationMask: { type: String, trim: true, maxlength: 80 },
  destinationBank: { type: String, trim: true, maxlength: 160 },
  proof: {
    encryptedContent: { type: String, select: false },
    originalName: { type: String, trim: true, maxlength: 255 },
    mimeType: { type: String, enum: ['image/jpeg', 'image/png', 'application/pdf'] },
    size: { type: Number, min: 0, max: 10 * 1024 * 1024 },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    submittedAt: Date
  },
  status: { type: String, enum: PAYMENT_STATUSES, required: true, default: 'pending', index: true },
  failureReason: { type: String, trim: true, maxlength: 500 },
  holdReason: { type: String, trim: true, maxlength: 500 },
  preparedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  preparedAt: { type: Date, default: Date.now, required: true },
  evidenceSubmittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  confirmedAt: Date,
  history: { type: [historySchema], default: [] }
}, { timestamps: true });

payrollPaymentAttemptSchema.index({ store: 1, idempotencyKey: 1 }, { unique: true });
payrollPaymentAttemptSchema.index({ store: 1, referenceFingerprint: 1 }, { unique: true });
payrollPaymentAttemptSchema.index({ activeKey: 1 }, { unique: true, partialFilterExpression: { activeKey: { $type: 'string' } } });
payrollPaymentAttemptSchema.index({ payrollPeriod: 1, employee: 1, createdAt: -1 });

payrollPaymentAttemptSchema.statics.PAYMENT_STATUSES = PAYMENT_STATUSES;

module.exports = mongoose.model('PayrollPaymentAttempt', payrollPaymentAttemptSchema);
