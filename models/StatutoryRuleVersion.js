const mongoose = require('mongoose');
const { validateRuleIntegrity } = require('../utils/statutoryRuleRegistry');

const statutoryRuleVersionSchema = new mongoose.Schema({
  agency: { type: String, enum: ['SSS', 'PhilHealth', 'Pag-IBIG', 'BIR'], required: true, index: true },
  program: { type: String, required: true, trim: true, maxlength: 120 },
  employeeCoverage: { type: String, required: true, trim: true, maxlength: 120 },
  issuanceId: { type: String, required: true, trim: true, maxlength: 120 },
  sourceUrl: { type: String, required: true, trim: true, maxlength: 1000 },
  sourceVerifiedOn: { type: Date, required: true },
  effectiveFrom: { type: Date, required: true },
  // Null means the issuance states no end date; it is not an inferred expiry.
  effectiveThrough: { type: Date, default: null },
  parameters: { type: mongoose.Schema.Types.Mixed, required: true },
  version: { type: String, required: true, trim: true, maxlength: 120 },
  checksum: { type: String, required: true, match: /^[a-f0-9]{64}$/i },
  verificationStatus: { type: String, enum: ['unverified', 'verified'], default: 'unverified', index: true },
  activationStatus: { type: String, enum: ['inactive', 'active', 'superseded'], default: 'inactive', index: true },
  activatedAt: Date,
  activatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  supersedes: { type: mongoose.Schema.Types.ObjectId, ref: 'StatutoryRuleVersion', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true, minimize: false });

statutoryRuleVersionSchema.index({ agency: 1, program: 1, employeeCoverage: 1, version: 1 }, { unique: true });
statutoryRuleVersionSchema.index({ agency: 1, program: 1, employeeCoverage: 1, activationStatus: 1, effectiveFrom: 1, effectiveThrough: 1 });

statutoryRuleVersionSchema.pre('validate', function validateStatutoryRule(next) {
  try {
    validateRuleIntegrity(this.toObject());
    if (this.activationStatus === 'active' && (this.verificationStatus !== 'verified' || !this.activatedAt || !this.activatedBy)) {
      throw Object.assign(new Error('An active statutory rule must be verified and have activation actor and time.'), { code: 'invalid_rule_activation' });
    }
    next();
  } catch (error) {
    next(error);
  }
});

statutoryRuleVersionSchema.pre('save', async function preserveStatutoryVersion() {
  if (!this.isNew) {
    const immutableFields = ['agency', 'program', 'employeeCoverage', 'issuanceId', 'sourceUrl', 'sourceVerifiedOn', 'effectiveFrom', 'effectiveThrough', 'parameters', 'version', 'checksum'];
    const changed = immutableFields.filter(field => this.isModified(field));
    if (changed.length) throw Object.assign(new Error(`Published statutory rule data is immutable; create a new version instead (${changed.join(', ')}).`), { code: 'immutable_rule_version' });
  }
});

module.exports = mongoose.models.StatutoryRuleVersion
  || mongoose.model('StatutoryRuleVersion', statutoryRuleVersionSchema);
