const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  requirementKey: {
    type: String,
    enum: ['business_registration', 'bir_certificate', 'authority_document', 'mayors_permit', 'barangay_clearance', 'supporting_document'],
    required: true
  },
  label: { type: String, required: true, trim: true },
  documentUrl: { type: String, required: true, select: false },
  originalName: { type: String, trim: true },
  mimeType: { type: String, trim: true },
  size: { type: Number, min: 0 },
  issueDate: Date,
  hasExpiration: { type: Boolean, default: false },
  expirationDate: Date,
  requiredForOperation: { type: Boolean, default: false },
  taxAffecting: { type: Boolean, default: false }
}, { _id: true });

const storeComplianceRequestSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sourceApplication: { type: mongoose.Schema.Types.ObjectId, ref: 'StoreApplication' },
  requestType: {
    type: String,
    enum: ['initial_verification', 'business_update', 'tax_update', 'document_replacement', 'document_renewal', 'correction_resubmission'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending_review', 'under_review', 'needs_correction', 'approved', 'rejected'],
    default: 'pending_review',
    index: true
  },
  reason: { type: String, required: true, trim: true, maxlength: 2000 },
  currentSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  proposedProfile: {
    business: { type: mongoose.Schema.Types.Mixed, default: {} },
    representative: { type: mongoose.Schema.Types.Mixed, default: {} },
    tax: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  proposedDocuments: { type: [documentSchema], default: [] },
  requiredCorrections: { type: [String], default: [] },
  correctionReason: { type: String, trim: true, maxlength: 3000 },
  reviewNotes: { type: String, trim: true, maxlength: 3000 },
  submittedAt: { type: Date, default: Date.now },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedAt: Date,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewHistory: {
    type: [{
      action: { type: String, enum: ['submitted', 'resubmitted', 'under_review', 'needs_correction', 'approved', 'rejected'], required: true },
      actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      notes: { type: String, trim: true, maxlength: 3000 },
      at: { type: Date, default: Date.now }
    }],
    default: []
  }
}, { timestamps: true });

storeComplianceRequestSchema.index(
  { store: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending_review', 'under_review', 'needs_correction'] } } }
);

module.exports = mongoose.model('StoreComplianceRequest', storeComplianceRequestSchema);
