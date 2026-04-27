const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    required: true,
    maxlength: 2000
  },
  logo: {
    type: String
  },
  coverImage: {
    type: String
  },
  businessType: {
    type: String,
    enum: ['pet_store', 'breeder', 'shelter', 'veterinary', 'grooming', 'training', 'other'],
    required: true
  },
  operationalModules: [{
    type: String,
    enum: ['pets', 'products', 'services'],
    required: true
  }],
  legalStructure: {
    type: String,
    enum: ['single_proprietorship', 'partnership', 'corporation', 'cooperative', 'other'],
    default: 'single_proprietorship'
  },
  yearsInBusiness: {
    type: Number,
    default: 0
  },
  numberOfEmployees: {
    type: Number,
    default: 1
  },
  hasPhysicalStore: {
    type: Boolean,
    default: true
  },
  contactInfo: {
    phone: { type: String, required: true },
    email: { type: String, required: true },
    website: String,
    address: {
      street: { type: String, required: true },
      barangay: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      zipCode: { type: String, required: true },
      country: { type: String, required: true },
      coordinates: {
        lat: { type: Number },
        lng: { type: Number }
      }
    }
  },
  socialMedia: {
    facebook: String,
    instagram: String,
    twitter: String,
    youtube: String
  },
  businessHours: {
    monday: { open: { type: String, default: '09:00' }, close: { type: String, default: '17:00' }, closed: { type: Boolean, default: false } },
    tuesday: { open: { type: String, default: '09:00' }, close: { type: String, default: '17:00' }, closed: { type: Boolean, default: false } },
    wednesday: { open: { type: String, default: '09:00' }, close: { type: String, default: '17:00' }, closed: { type: Boolean, default: false } },
    thursday: { open: { type: String, default: '09:00' }, close: { type: String, default: '17:00' }, closed: { type: Boolean, default: false } },
    friday: { open: { type: String, default: '09:00' }, close: { type: String, default: '17:00' }, closed: { type: Boolean, default: false } },
    saturday: { open: { type: String, default: '09:00' }, close: { type: String, default: '17:00' }, closed: { type: Boolean, default: false } },
    sunday: { open: { type: String, default: '09:00' }, close: { type: String, default: '17:00' }, closed: { type: Boolean, default: false } }
  },
  bookingSettings: {
    slotDuration: { type: Number, default: 60 }, // minutes
    allowInstantBooking: { type: Boolean, default: true },
    bufferTime: { type: Number, default: 0 }, // minutes between slots
    maxBookingsPerSlot: { type: Number, default: 1 }
  },
  specialties: [{
    type: String,
    enum: ['dogs', 'cats', 'birds', 'fish', 'reptiles', 'small_animals', 'exotic_pets']
  }],
  services: [{
    name: { type: String, required: true },
    description: String,
    price: Number
  }],
  ratings: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 }
  },
  verificationStatus: {
    type: String,
    enum: ['verified', 'pending', 'suspended'],
    default: 'verified'
  },
  verification: {
    idImage: { type: String },
    selfieImage: { type: String },
    phoneVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    breederPermit: { type: String },
    businessPermit: { type: String },
    verifiedAt: { type: Date },
    adminNotes: { type: String }
  },
  payoutAccount: {
    accountName: { type: String },
    accountNumber: { type: String },
    bankName: { type: String },
    type: { type: String, enum: ['gcash', 'maya', 'bank_transfer'] }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  featured: {
    type: Boolean,
    default: false
  },
  subscriptionTier: {
    type: String,
    enum: ['basic', 'premium', 'enterprise'],
    default: 'basic'
  },
  subscriptionExpires: Date,
  stats: {
    totalPets: { type: Number, default: 0 },
    totalProducts: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    totalPlatformFees: { type: Number, default: 0 },
    responseRate: { type: Number, default: 0 }, // percentage
    responseTime: { type: String, default: 'under an hour' }, // human readable
    activeListingsCount: { type: Number, default: 0 }
  },
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  payoutMethods: [{
    type: {
      type: String,
      enum: ['gcash', 'maya', 'bank_transfer'],
      required: true
    },
    accountName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    bankName: String,
    isDefault: { type: Boolean, default: false }
  }],
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
  }
});

// Generate slug from store name and update timestamp
storeSchema.pre('save', function (next) {
  if (this.isModified('name')) {
    const name = this.name || 'store';
    this.slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') + '-' + Date.now();
  }
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Store', storeSchema);
