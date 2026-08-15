const mongoose = require('mongoose');

const petProfileSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  homeStore: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    default: null,
    index: true
  },
  name: { type: String, required: true, trim: true },
  type: { type: String, required: true, trim: true },   // Dog, Cat, etc.
  breed: { type: String, trim: true, default: '' },
  isMixedBreed: { type: Boolean, default: false },
  breedStatus: { type: String, enum: ['purebred', 'mixed_breed', 'unknown'], default: 'unknown' },
  pcciRegistration: {
    status: { type: String, enum: ['yes', 'no', 'not_sure'], default: 'not_sure' },
    registrationNumber: { type: String, maxlength: 100, default: '' },
    registeredName: { type: String, maxlength: 200, default: '' },
    certificateUrl: { type: String, default: '' },
    microchipNumber: { type: String, maxlength: 100, default: '' },
    informationStatus: { type: String, enum: ['not_provided', 'customer_provided', 'system_verified'], default: 'not_provided' }
  },
  size: { type: String, enum: ['Unknown', 'Small', 'Medium', 'Large', 'Extra Large'], default: 'Unknown' },
  birthday: { type: Date, default: null },
  approximateAge: { value: { type: Number, min: 0 }, unit: { type: String, enum: ['months', 'years'] } },
  gender: { type: String, enum: ['Male', 'Female'], required: true },
  weight: { type: Number, min: 0, max: 200, default: null },
  weightUnit: { type: String, enum: ['kg', 'lb'], default: 'kg' },
  color: { type: String, trim: true },
  photo: { type: String },
  vaccinationCards: [{ type: String }],
  supportingDocuments: [{
    url: { type: String, required: true },
    name: { type: String, trim: true, maxlength: 255, default: 'Supporting document' }
  }],
  vaccinationStatus: { type: String, default: 'Pending' }, 
  specialNotes: { type: String, default: '' },
  allergies: { type: String, default: 'None' },
  medicalConditions: { type: String, default: 'None' },
  groomingPreferences: { type: String, default: 'None' },
  behaviorNotes: { type: String, default: 'Normal' },
  emergencyContact: { type: String, trim: true },
  coat: {
    length: { type: String, enum: ['unknown', 'short', 'medium', 'long'], default: 'unknown' },
    type: { type: String, enum: ['unknown', 'straight', 'wavy', 'curly', 'double_coat', 'other'], default: 'unknown' },
    condition: { type: String, enum: ['unknown', 'normal', 'tangled', 'matted', 'heavy_shedding', 'dry_looking', 'other'], default: 'unknown' },
    otherDescription: { type: String, trim: true, default: '' }
  },
  groomingHistory: {
    hasReceivedGrooming: { type: String, enum: ['yes', 'no', 'not_sure'], default: 'not_sure' },
    lastGroomingDate: Date,
    previousServices: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }]
  },
  serviceNeeds: [{ type: String, enum: ['general_grooming', 'bathing', 'haircut', 'nail_trimming', 'coat_brushing', 'dematting', 'basic_cleaning', 'not_sure'] }],
  servicePreferences: {
    preferredServiceType: { type: String, trim: true, default: '' },
    preferredDuration: { type: String, enum: ['', 'short', 'standard', 'extended'], default: '' },
    preferredFrequency: { type: String, trim: true, default: '' },
    specialHandling: { type: String, trim: true, default: '' }
  },
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
