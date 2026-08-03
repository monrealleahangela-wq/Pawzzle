const mongoose = require('mongoose');

const vaccinationRecordSchema = new mongoose.Schema({
  pet: { type: mongoose.Schema.Types.ObjectId, ref: 'PetProfile', required: true, index: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  encounter: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalEncounter' },
  vaccineName: { type: String, required: true, trim: true },
  diseaseTargets: [String],
  dose: String,
  administeredAt: { type: Date, required: true, default: Date.now },
  nextDueAt: { type: Date, index: true },
  veterinarian: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  inventoryLot: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryLot' },
  lotNumberSnapshot: { type: String, required: true },
  manufacturerSnapshot: String,
  adverseReaction: String,
  certificateUrl: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

vaccinationRecordSchema.index({ pet: 1, vaccineName: 1, administeredAt: -1 });
vaccinationRecordSchema.index({ store: 1, nextDueAt: 1 });

module.exports = mongoose.model('VaccinationRecord', vaccinationRecordSchema);
