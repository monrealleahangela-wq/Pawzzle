const mongoose = require('mongoose');

const medicalEncounterSchema = new mongoose.Schema({
  pet: { type: mongoose.Schema.Types.ObjectId, ref: 'PetProfile', required: true, index: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  veterinarian: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  encounterDate: { type: Date, default: Date.now, required: true },
  reason: { type: String, required: true, trim: true },
  observations: String,
  assessment: String,
  diagnoses: [{ code: String, description: { type: String, required: true } }],
  treatments: [{ description: { type: String, required: true }, performedAt: Date }],
  prescriptions: [{
    medication: { type: String, required: true },
    dosage: String,
    frequency: String,
    duration: String,
    instructions: String
  }],
  followUpAt: Date,
  attachments: [String],
  status: { type: String, enum: ['draft', 'signed', 'amended'], default: 'draft' },
  signedAt: Date,
  amendmentReason: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

medicalEncounterSchema.index({ pet: 1, encounterDate: -1 });

module.exports = mongoose.model('MedicalEncounter', medicalEncounterSchema);
