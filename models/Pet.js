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
  listingType: {
    type: String,
    enum: ['sale', 'adoption'],
    default: 'sale'
  },
  weight: {
    type: Number
  },
  quantity: {
    type: Number,
    default: 1,
    min: 0
  },
  isNegotiable: {
    type: Boolean,
    default: false
  },
  dewormed: {
    type: Boolean,
    default: false
  },
  spayedNeutered: {
    type: Boolean,
    default: false
  },
  healthCondition: {
    type: String,
    enum: ['healthy', 'needs_monitoring', 'condition_present'],
    default: 'healthy'
  },
  vetRecords: [{
    type: String // URL to images or PDFs
  }],
  proofOfOwnership: [{
    type: String // URL to images or PDFs
  }],
  permits: [{
    type: String // Required for breeders/stores
  }],
  pickupAvailability: {
    type: String,
    enum: ['same_day', 'next_day', 'scheduled'],
    default: 'scheduled'
  },
  fulfillmentType: {
    type: String,
    enum: ['pickup_only', 'shipping', 'both'],
    default: 'pickup_only'
  },
  paymentType: {
    type: String,
    enum: ['online_only', 'cod', 'any'],
    default: 'online_only'
  },
  status: {
    type: String,
    enum: ['available', 'reserved', 'sold', 'adopted'],
    default: 'available'
  },
  vaccinationStatus: {
    type: String,
    enum: ['complete', 'partial', 'none'],
    default: 'none'
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
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store'
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved'
  },
  pedigreePapers: {
    type: Boolean,
    default: false
  },
  temperament: {
    type: String,
    trim: true
  },
  videos: [{
    type: String
  }],
  location: {
    type: String,
    trim: true
  },
  pickupInstructions: {
    type: String,
    trim: true
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
  if (this.status === 'adopted' || this.status === 'reserved' || this.status === 'sold') {
    this.isAvailable = false;
  }

  next();
});

module.exports = mongoose.model('Pet', petSchema);
