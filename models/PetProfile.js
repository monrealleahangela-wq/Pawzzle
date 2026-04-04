const mongoose = require('mongoose');

const petProfileSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: { type: String, required: true, trim: true },
  type: { type: String, required: true, trim: true },   // Dog, Cat, etc.
  breed: { type: String, required: true, trim: true },
  size: { type: String, enum: ['Small', 'Medium', 'Large', 'Extra Large'], default: 'Small' },
  birthday: { type: Date, required: true },
  gender: { type: String, enum: ['Male', 'Female'], required: true },
  weight: { type: Number, required: true, min: 1, max: 200 },
  color: { type: String, trim: true },
  photo: { type: String },
  vaccinationCards: [{ type: String }],
  vaccinationStatus: { type: String, default: 'Pending' }, 
  specialNotes: { type: String, default: '' },
  allergies: { type: String, default: 'None' },
  medicalConditions: { type: String, default: 'None' },
  groomingPreferences: { type: String, default: 'None' },
  behaviorNotes: { type: String, default: 'Normal' },
  emergencyContact: { type: String, trim: true },
  // Track last booking to sort by recency in the UI
  lastBookedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

petProfileSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('PetProfile', petProfileSchema);
