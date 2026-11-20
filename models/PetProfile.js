const mongoose = require('mongoose');
const { normalizePetType } = require('../utils/serviceAdvisorPetContract');

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
  type: {
    type: String,
    required: true,
    trim: true,
    set: value => normalizePetType(value) || value
  },
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
  foodSensitivities: [{ type: String, trim: true, lowercase: true }],
  dietaryPreferences: [{ type: String, trim: true, lowercase: true }],
  healthConcerns: [{ type: String, trim: true, lowercase: true }],
  activityLevel: { type: String, enum: ['unknown', 'low', 'moderate', 'high'], default: 'unknown' },
  skinType: { type: String, enum: ['unknown', 'normal', 'dry', 'sensitive', 'oily'], default: 'unknown' },
  bodyMeasurements: {
    neckCm: { type: Number, min: 0 },
    chestCm: { type: Number, min: 0 },
    backLengthCm: { type: Number, min: 0 },
    heightCm: { type: Number, min: 0 }
  },
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

petProfileSchema.virtual('ageInMonths').get(function () {
  if (this.birthday) {
    const birthday = new Date(this.birthday);
    if (!Number.isNaN(birthday.getTime()) && birthday <= new Date()) {
      return Math.max(0, Math.floor((Date.now() - birthday.getTime()) / (30.4375 * 24 * 60 * 60 * 1000)));
    }
  }
  if (this.approximateAge?.value === undefined || this.approximateAge?.value === null || this.approximateAge?.value === '') return null;
  const value = Number(this.approximateAge.value);
  if (!Number.isFinite(value) || value < 0) return null;
  return this.approximateAge?.unit === 'months' ? value : value * 12;
});

petProfileSchema.virtual('lifeStage').get(function () {
  const months = this.ageInMonths;
  if (months === null) return 'unknown';
  if (months < 12) return 'young';
  if (months >= 84) return 'senior';
  return 'adult';
});

petProfileSchema.set('toJSON', { virtuals: true });
petProfileSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('PetProfile', petProfileSchema);
