const mongoose = require('mongoose');
const workflowCapability = require('../utils/leavePolicyWorkflowCapability');

const eventSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  qualification: { type: mongoose.Schema.Types.ObjectId, ref: 'LeavePolicyReviewerQualification', required: true },
  reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  eventType: { type: String, enum: ['registered', 'verified', 'verification_rejected', 'revoked'], required: true },
  evidenceReference: { type: String, trim: true, maxlength: 500, select: false },
  reason: { type: String, trim: true, maxlength: 1000, required: true },
  idempotencyKey: { type: String, required: true, trim: true, maxlength: 200 },
  createdAt: { type: Date, default: Date.now, immutable: true }
}, { versionKey: false, timestamps: false });
eventSchema.index({ store: 1, qualification: 1, idempotencyKey: 1 }, { unique: true, name: 'qualification_event_idempotency' });
eventSchema.index({ store: 1, idempotencyKey: 1 }, { unique: true, name: 'qualification_store_idempotency' });
eventSchema.pre('validate', function onlyWorkflowServiceMayAppend(next) {
  if (this.isNew && this.$locals[workflowCapability.localKey] !== true) return next(new Error('Reviewer qualification events may only be appended by the audited workflow service.'));
  next();
});
const appendOnly = function appendOnlyQualificationEvent(next) { next(new Error('Reviewer qualification events are append-only.')); };
eventSchema.pre('save', function onlyInsert(next) { if (this.isNew) return next(); appendOnly(next); });
['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'].forEach(hook => eventSchema.pre(hook, appendOnly));
eventSchema.statics.bulkWrite = function prohibitQualificationEventBulkWrite() {
  return Promise.reject(new Error('Reviewer qualification events must be appended through the audited workflow service.'));
};
module.exports = mongoose.models.LeavePolicyReviewerQualificationEvent
  || mongoose.model('LeavePolicyReviewerQualificationEvent', eventSchema);
