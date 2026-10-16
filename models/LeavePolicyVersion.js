const mongoose = require('mongoose');
const activationCapability = require('../utils/leavePolicyActivationCapability');
const workflowCapability = require('../utils/leavePolicyWorkflowCapability');

const leavePolicyVersionSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  leaveTypeKey: { type: String, required: true, trim: true, lowercase: true, match: /^[a-z0-9][a-z0-9_-]{0,59}$/ },
  version: { type: Number, required: true, min: 1, validate: Number.isInteger },
  scopeType: { type: String, enum: ['store', 'employee_category'], default: 'store', required: true },
  scopeKey: { type: String, trim: true, lowercase: true, default: 'all', maxlength: 80 },
  classification: { type: String, enum: ['statutory', 'employer_provided'], required: true },
  status: { type: String, enum: ['draft', 'active', 'retired'], default: 'draft', required: true, index: true },
  reviewState: { type: String, enum: ['draft', 'submitted_for_review', 'changes_requested', 'compliance_reviewed', 'owner_approved', 'rejected', 'withdrawn'], default: 'draft', required: true, index: true },
  contentRevision: { type: Number, default: 1, min: 1, validate: Number.isInteger },
  workflowRevision: { type: Number, default: 0, min: 0, validate: Number.isInteger },
  effectiveFrom: { type: Date, required: true },
  effectiveThrough: { type: Date, default: null },
  eligibility: {
    employmentStatuses: [{ type: String, trim: true, lowercase: true }],
    employeeCategories: [{ type: String, trim: true, lowercase: true }],
    minimumServiceDays: { type: Number, min: 0, validate: value => value == null || Number.isInteger(value) }
  },
  unitsPerDay: { type: Number, required: true, min: 1, default: 480, validate: Number.isInteger },
  paidTreatment: { type: String, enum: ['paid', 'unpaid'], required: true },
  accrual: {
    mode: { type: String, enum: ['none', 'manual', 'fixed_periodic'], default: 'none', required: true },
    units: { type: Number, min: 1, validate: value => value == null || Number.isInteger(value) },
    period: { type: String, enum: ['monthly', 'annually'] },
    firstAccrualDate: Date
  },
  carryover: {
    enabled: { type: Boolean, default: false, required: true },
    maximumUnits: { type: Number, min: 0, validate: value => value == null || Number.isInteger(value) },
    expiresAfterMonths: { type: Number, min: 1, validate: value => value == null || Number.isInteger(value) }
  },
  approvalEvidence: {
    businessApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    complianceReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    complianceQualificationReference: { type: String, trim: true, maxlength: 500 },
    approvedAt: Date,
    effectiveApprovedAt: Date,
    approvalReference: { type: String, trim: true, maxlength: 300 },
    notes: { type: String, trim: true, maxlength: 2000, select: false }
  },
  sourceReferences: [{
    title: { type: String, required: true, trim: true, maxlength: 200 },
    issuer: { type: String, required: true, trim: true, maxlength: 160 },
    url: { type: String, required: true, trim: true, maxlength: 1000, match: /^https:\/\//i },
    effectiveDate: { type: Date, default: null }
  }],
  approvedSnapshot: { type: mongoose.Schema.Types.Mixed, select: false },
  checksum: { type: String, trim: true, select: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now, immutable: true },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false, minimize: false });

leavePolicyVersionSchema.index({ store: 1, leaveTypeKey: 1, scopeType: 1, scopeKey: 1, version: 1 }, { unique: true });
leavePolicyVersionSchema.index({ store: 1, leaveTypeKey: 1, status: 1, effectiveFrom: 1, effectiveThrough: 1 });

leavePolicyVersionSchema.pre('validate', function validatePolicy(next) {
  if (this.isNew && (this.status !== 'draft' || this.reviewState !== 'draft'
    || this.contentRevision !== 1 || this.workflowRevision !== 0)) {
    this.invalidate('reviewState', 'New leave policies must begin as inactive draft revision one; workflow states are service-managed.');
  }
  if (this.effectiveThrough && this.effectiveThrough < this.effectiveFrom) {
    this.invalidate('effectiveThrough', 'Policy effectiveThrough must not precede effectiveFrom.');
  }
  if (this.scopeType === 'store' && this.scopeKey !== 'all') {
    this.invalidate('scopeKey', 'Store-wide policy scopeKey must be all.');
  }
  if (this.accrual?.mode === 'fixed_periodic' && (!Number.isInteger(this.accrual.units) || !this.accrual.period || !this.accrual.firstAccrualDate)) {
    this.invalidate('accrual', 'A fixed periodic draft requires explicit integer units, period, and first accrual date.');
  }
  if (this.carryover?.enabled && !Number.isInteger(this.carryover.maximumUnits)) {
    this.invalidate('carryover.maximumUnits', 'Enabled carryover requires an explicit integer maximum; no default entitlement is inferred.');
  }
  if (['active', 'retired'].includes(this.status)) {
    const { policySnapshotPayload, calculatePolicyChecksum } = require('../services/leaveCreditLedgerService');
    const evidence = this.approvalEvidence || {};
    if (!evidence.businessApprovedBy || !evidence.complianceReviewedBy || !evidence.complianceQualificationReference
      || !evidence.approvedAt || !evidence.effectiveApprovedAt || !evidence.approvalReference || !this.approvedSnapshot || !this.checksum) {
      this.invalidate('status', 'An active or retired policy requires distinct documented business and compliance approval evidence and an integrity-checked snapshot.');
    }
    if (evidence.businessApprovedBy && evidence.complianceReviewedBy
      && String(evidence.businessApprovedBy) === String(evidence.complianceReviewedBy)) {
      this.invalidate('approvalEvidence.complianceReviewedBy', 'Business approval and compliance review must be performed by different people.');
    }
    if (this.approvedSnapshot && this.checksum) {
      const expected = calculatePolicyChecksum(policySnapshotPayload(this));
      const snapshotted = calculatePolicyChecksum(this.approvedSnapshot);
      if (expected !== String(this.checksum).toLowerCase() || snapshotted !== String(this.checksum).toLowerCase()) {
        this.invalidate('checksum', 'Active policy fields do not match the immutable approved snapshot checksum.');
      }
    }
    if (this.status === 'active' && (!Array.isArray(this.sourceReferences) || !this.sourceReferences.length)) {
      this.invalidate('sourceReferences', 'Activation requires at least one cited policy source document.');
    }
    if (this.isNew && this.status === 'active' && this.$locals[activationCapability.localKey] !== true) {
      this.invalidate('status', 'Leave policies must be activated through the transaction-safe activation service.');
    }
  }
  next();
});

const immutablePolicyError = function immutablePolicyError(next) {
  const policyId = this.getQuery()?._id || this.getQuery()?.id;
  if (!policyId) return next(new Error('Policy updates require a document identifier.'));
  this.model.findOne({ _id: policyId }).select('+approvedSnapshot +checksum').then(existing => {
    const update = this.getUpdate() || {};
    const activation = update.$set?.status === 'active' || update.$setOnInsert?.status === 'active' || update.status === 'active';
    if (activation && this.getOptions()[activationCapability.optionName] !== activationCapability.token) {
      return next(new Error('Draft policies must be activated through the transaction-safe activation service.'));
    }
    const workflowUpdate = this.getOptions()[workflowCapability.optionName] === workflowCapability.token;
    if (existing?.status === 'draft' && !activation && !workflowUpdate) {
      return next(new Error('Draft policy revisions and review-state changes must use the audited leave policy workflow service.'));
    }
    if (existing?.status === 'active') {
      const statusOnlyRetirement = update.$set?.status === 'retired'
        && Object.keys(update).every(key => key === '$set')
        && Object.keys(update.$set).every(key => key === 'status');
      if (statusOnlyRetirement) return next();
      return next(new Error('Active leave policy versions are immutable; create a new version instead.'));
    }
    next();
  }).catch(next);
};
leavePolicyVersionSchema.pre('findOneAndUpdate', immutablePolicyError);
leavePolicyVersionSchema.pre('updateOne', immutablePolicyError);
leavePolicyVersionSchema.pre('updateMany', immutablePolicyError);
leavePolicyVersionSchema.pre('replaceOne', immutablePolicyError);
leavePolicyVersionSchema.pre('findOneAndReplace', immutablePolicyError);
leavePolicyVersionSchema.pre('save', function immutableActivePolicy(next) {
  if (this.isNew || !this.isModified()) return next();
  this.constructor.findById(this._id).select('+approvedSnapshot +checksum').then(existing => {
    if (this.status === 'active' && existing?.status === 'draft' && this.$locals[activationCapability.localKey] !== true) {
      return next(new Error('Draft policies must be activated through the transaction-safe activation service.'));
    }
    if (existing?.status === 'draft' && this.$locals[workflowCapability.localKey] !== true
      && this.$locals[activationCapability.localKey] !== true) {
      return next(new Error('Draft policy revisions and review-state changes must use the audited leave policy workflow service.'));
    }
    if (existing?.status !== 'active') return next();
    const modified = this.modifiedPaths().filter(path => path !== '__v');
    if (modified.length === 1 && modified[0] === 'status' && this.status === 'retired') return next();
    next(new Error('Active leave policy versions are immutable; create a new version instead.'));
  }).catch(next);
});
leavePolicyVersionSchema.pre('deleteOne', function prohibitPolicyDelete(next) {
  next(new Error('Leave policy versions are retained for audit and cannot be deleted.'));
});
leavePolicyVersionSchema.pre('deleteMany', function prohibitPolicyDelete(next) {
  next(new Error('Leave policy versions are retained for audit and cannot be deleted.'));
});
leavePolicyVersionSchema.pre('deleteOne', { document: true, query: false }, function prohibitDocumentPolicyDelete(next) {
  next(new Error('Leave policy versions are retained for audit and cannot be deleted.'));
});
leavePolicyVersionSchema.pre('findOneAndDelete', function prohibitPolicyDelete(next) {
  next(new Error('Leave policy versions are retained for audit and cannot be deleted.'));
});
leavePolicyVersionSchema.statics.bulkWrite = function immutablePolicyBulkWrite(operations, options) {
  const writes = Array.isArray(operations) ? operations : [];
  if (writes.some(operation => !operation?.insertOne
    || ['active', 'retired'].includes(operation.insertOne.document?.status)
    || (operation.insertOne.document?.reviewState != null && operation.insertOne.document.reviewState !== 'draft')
    || (operation.insertOne.document?.contentRevision != null && operation.insertOne.document.contentRevision !== 1)
    || (operation.insertOne.document?.workflowRevision != null && operation.insertOne.document.workflowRevision !== 0))) {
    return Promise.reject(new Error('Policy bulk writes may only create drafts; policy updates, deletion, and activation require a separately authorized workflow.'));
  }
  return mongoose.Model.bulkWrite.call(this, writes, options);
};

module.exports = mongoose.models.LeavePolicyVersion
  || mongoose.model('LeavePolicyVersion', leavePolicyVersionSchema);
