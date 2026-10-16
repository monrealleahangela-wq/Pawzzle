const mongoose = require('mongoose');
const workflowCapability = require('../utils/leavePolicyWorkflowCapability');

const leavePolicyReviewerQualificationSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  qualificationCategory: { type: String, enum: ['labor_compliance', 'payroll_compliance', 'leave_policy_compliance'], required: true },
  authorityScopes: {
    leaveTypeKeys: [{ type: String, trim: true, lowercase: true }],
    policyClassifications: [{ type: String, enum: ['statutory', 'employer_provided'] }],
    decisionIds: [{ type: String, match: /^(all|LP-(0[1-9]|1[0-9]|2[0-2]))$/ }]
  },
  credentialIssuer: { type: String, required: true, trim: true, maxlength: 200 },
  credentialType: { type: String, required: true, trim: true, maxlength: 200 },
  protectedEvidenceReference: { type: String, required: true, trim: true, maxlength: 500, select: false },
  validFrom: { type: Date, required: true },
  validThrough: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'verified', 'revoked', 'expired'], default: 'pending', required: true, index: true },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  verifiedAt: { type: Date, default: null },
  verificationEvidenceReference: { type: String, trim: true, maxlength: 500, select: false },
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  revokedAt: { type: Date, default: null },
  revocationReason: { type: String, trim: true, maxlength: 1000, select: false },
  revision: { type: Number, default: 0, min: 0, validate: Number.isInteger },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now, immutable: true }
}, { versionKey: false, timestamps: true });

leavePolicyReviewerQualificationSchema.index({ store: 1, reviewer: 1, qualificationCategory: 1, validFrom: 1, validThrough: 1 });

leavePolicyReviewerQualificationSchema.pre('validate', function pendingOnlyOnInsert(next) {
  if (this.isNew && (this.status !== 'pending' || this.verifiedBy || this.verifiedAt || this.revokedBy || this.revokedAt)) {
    this.invalidate('status', 'Reviewer qualifications must be registered pending; verification and revocation are workflow-service transitions.');
  }
  next();
});

const guardUpdate = function guardQualificationUpdate(next) {
  if (this.getOptions()[workflowCapability.optionName] !== workflowCapability.token) {
    return next(new Error('Reviewer qualifications may only change through the audited qualification workflow service.'));
  }
  next();
};
['updateOne', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'updateMany'].forEach(hook => {
  leavePolicyReviewerQualificationSchema.pre(hook, guardUpdate);
});
leavePolicyReviewerQualificationSchema.pre('save', function guardQualificationSave(next) {
  if (!this.isNew && this.$locals[workflowCapability.localKey] !== true) {
    return next(new Error('Reviewer qualifications may only change through the audited qualification workflow service.'));
  }
  next();
});
['deleteOne', 'deleteMany', 'findOneAndDelete'].forEach(hook => {
  leavePolicyReviewerQualificationSchema.pre(hook, function prohibitDelete(next) {
    next(new Error('Reviewer qualification history is retained and cannot be deleted.'));
  });
});
leavePolicyReviewerQualificationSchema.statics.bulkWrite = function prohibitQualificationBulkWrite(operations) {
  if ((operations || []).some(operation => !operation?.insertOne
    || (operation.insertOne.document?.status != null && operation.insertOne.document.status !== 'pending')
    || operation.insertOne.document?.verifiedBy || operation.insertOne.document?.verifiedAt
    || operation.insertOne.document?.revokedBy || operation.insertOne.document?.revokedAt)) {
    return Promise.reject(new Error('Bulk writes may only register pending reviewer qualifications; verification and revocation require the audited service.'));
  }
  return mongoose.Model.bulkWrite.call(this, operations, {});
};

module.exports = mongoose.models.LeavePolicyReviewerQualification
  || mongoose.model('LeavePolicyReviewerQualification', leavePolicyReviewerQualificationSchema);
