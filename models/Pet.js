const mongoose = require('mongoose');

const petSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  species: {
    type: String,
    required: true,
    enum: ['dog', 'cat', 'bird', 'fish', 'rabbit', 'hamster', 'reptile', 'other']
  },
  breed: {
    type: String,
    required: true,
    trim: true
  },
  age: {
    type: Number,
    required: true,
    min: 0
  },
  ageUnit: {
    type: String,
    enum: ['months', 'years'],
    default: 'years'
  },
  birthday: {
    type: Date
  },
  gender: {
    type: String,
    enum: ['male', 'female'],
    required: true
  },
  size: {
    type: String,
    enum: ['small', 'medium', 'large', 'extra_large'],
    required: true
  },
  color: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  images: [{
    type: String
  }],
  isAvailable: {
    type: Boolean,
    default: true
  },
  status: {
    type: String,
    enum: ['available', 'reserved', 'adopted'],
    default: 'available'
  },
  vaccinationStatus: {
    type: String,
    enum: ['not_vaccinated', 'partially_vaccinated', 'fully_vaccinated'],
    default: 'not_vaccinated'
  },
  healthStatus: {
    type: String,
    enum: ['excellent', 'good', 'fair', 'needs_attention'],
    default: 'good'
  },
  specialNeeds: {
    type: String,
    trim: true
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  adoptionDetails: {
    requirements: { type: String, trim: true },
    trialPeriod: { type: String, trim: true },
    homeCheck: { type: Boolean, default: false },
    rescuePartner: { type: String, trim: true },
    transportAvailable: { type: Boolean, default: false },
    isKidFriendly: { type: Boolean, default: true },
    isPetFriendly: { type: Boolean, default: true }
  },
  ratings: {
    average: { type: Number, default: 0 },
    count: { type: Number, default: 0 }
  }
});

// Update timestamp and sync fields on save
petSchema.pre('save', function (next) {
  this.updatedAt = Date.now();

  // Sync isAvailable with status
  if (this.status === 'adopted' || this.status === 'reserved') {
    this.isAvailable = false;
  } else if (this.status === 'available') {
    // Only set to true if it was explicitly intended or if it was currently unavailable
    // We don't want to force it to true if an admin manually set isAvailable to false
    // but kept status 'available'.
  }

  next();
});

module.exports = mongoose.model('Pet', petSchema);
