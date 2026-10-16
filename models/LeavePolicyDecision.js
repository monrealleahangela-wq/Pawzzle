const mongoose = require('mongoose');
const workflowCapability = require('../utils/leavePolicyWorkflowCapability');

const decisionSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  policy: { type: mongoose.Schema.Types.ObjectId, ref: 'LeavePolicyVersion', required: true },
  policyVersion: { type: Number, required: true, min: 1 },
  contentRevision: { type: Number, required: true, min: 1 },
  policyChecksum: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
  stage: { type: String, enum: ['submission', 'compliance_review', 'owner_approval', 'policy_decision', 'workflow'], required: true },
  decision: { type: String, enum: ['created', 'submitted', 'approved', 'not_applicable', 'changes_requested', 'rejected', 'withdrawn', 'revision_changed'], required: true },
  decisionId: { type: String, match: /^LP-(0[1-9]|1[0-9]|2[0-2])$/, default: null },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewerQualification: { type: mongoose.Schema.Types.ObjectId, ref: 'LeavePolicyReviewerQualification', default: null },
  evidenceReference: { type: String, trim: true, maxlength: 500, select: false },
  effectiveDate: { type: Date, default: null },
  reason: { type: String, trim: true, maxlength: 2000, required: true },
  idempotencyKey: { type: String, required: true, trim: true, maxlength: 200 },
  supersedes: { type: mongoose.Schema.Types.ObjectId, ref: 'LeavePolicyDecision', default: null },
  invalidates: { type: mongoose.Schema.Types.ObjectId, ref: 'LeavePolicyDecision', default: null },
  createdAt: { type: Date, default: Date.now, immutable: true }
}, { versionKey: false, timestamps: false });
decisionSchema.index({ store: 1, policy: 1, idempotencyKey: 1 }, { unique: true, name: 'policy_decision_idempotency' });
decisionSchema.index({ store: 1, idempotencyKey: 1 }, { unique: true, name: 'policy_store_idempotency' });
decisionSchema.index({ store: 1, policy: 1, contentRevision: 1, stage: 1, createdAt: 1 });
decisionSchema.pre('validate', function onlyWorkflowServiceMayAppend(next) {
  if (this.isNew && this.$locals[workflowCapability.localKey] !== true) {
    return next(new Error('Leave policy decisions may only be appended by the audited workflow service.'));
  }
  next();
});
const appendOnly = function appendOnlyDecision(next) { next(new Error('Leave policy decisions are append-only.')); };
decisionSchema.pre('save', function onlyInsert(next) { if (this.isNew) return next(); appendOnly(next); });
['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'].forEach(hook => decisionSchema.pre(hook, appendOnly));
decisionSchema.statics.bulkWrite = function prohibitDecisionBulkWrite() {
  return Promise.reject(new Error('Leave policy decisions must be appended through the audited workflow service.'));
};
module.exports = mongoose.models.LeavePolicyDecision || mongoose.model('LeavePolicyDecision', decisionSchema);
