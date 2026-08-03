const mongoose = require('mongoose');

const dogCertificationSchema = new mongoose.Schema({
  pet: { type: mongoose.Schema.Types.ObjectId, ref: 'PetProfile', required: true, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  certificationType: {
    type: String,
    enum: ['pcci_registered', 'pcci_listed', 'other_registry', 'unverified_claim'],
    required: true
  },
  registeredName: String,
  registrationNumber: { type: String, trim: true },
  issuingRegistry: { type: String, default: 'PCCI' },
  issueDate: Date,
  kennelAffix: String,
  litterRegistrationNumber: String,
  sire: { name: String, registrationNumber: String },
  dam: { name: String, registrationNumber: String },
  microchipOrTattoo: String,
  origin: { type: String, enum: ['local', 'imported', 'unknown'], default: 'unknown' },
  ownershipTransferStatus: {
    type: String,
    enum: ['not_required', 'pending', 'completed', 'rejected'],
    default: 'not_required'
  },
  documentUrls: [String],
  verificationStatus: {
    type: String,
    enum: ['unsubmitted', 'submitted', 'internally_reviewed', 'evidence_recorded', 'rejected', 'expired'],
    default: 'unsubmitted',
    index: true
  },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: Date,
  rejectionReason: String
}, { timestamps: true });

dogCertificationSchema.index(
  { issuingRegistry: 1, registrationNumber: 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model('DogCertification', dogCertificationSchema);
