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
  hiringStaff: {
    type: Boolean,
    default: false
  },
  staffTypes: [{
    type: String,
    enum: [
      'vets', 'groomers', 'trainers', 'boarding_specialists', 
      'medical_assistants', 'pet_handlers', 'inventory', 
      'logistics', 'sales', 'service_mgmt', 'admin'
    ]
  }],
  staffingConfiguration: {
    hasStaff: { type: String, enum: ['yes', 'no', 'planning'], default: 'no' },
    staffQuantityRange: { type: String, enum: ['1-5', '6-15', '16+'] },
    isStaffVisibleToCustomers: { type: Boolean, default: false },
    requiresProfessionalVerification: { type: Boolean, default: false }
  },
  expansionStatus: {
    type: String,
    enum: ['none', 'pending', 'under_review'],
    default: 'none'
  },
  legalStructure: {
    type: String,
    enum: ['single_proprietorship', 'sole_proprietorship', 'one_person_corporation', 'partnership', 'corporation', 'cooperative', 'other'],
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
      unitBuilding: { type: String },
      street: { type: String, required: true },
      barangay: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      zipCode: { type: String, required: true },
      country: { type: String, required: true },
      landmark: { type: String },
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
    maxBookingsPerSlot: { type: Number, default: 1 },
    confirmationWindowMinutes: { type: Number, default: 1440, min: 15, max: 10080 }
  },
  hrSettings: {
    payrollFrequency: {
      type: String,
      enum: ['weekly', 'semi_monthly', 'monthly'],
      default: 'semi_monthly'
    },
    timezone: { type: String, default: 'Asia/Manila' },
    weekly: {
      weekStartsOn: { type: Number, min: 0, max: 6, default: 1 },
      payDelayDays: { type: Number, min: 0, max: 31, default: 2 }
    },
    semiMonthly: {
      firstCutoffDay: { type: Number, min: 1, max: 27, default: 15 },
      firstPayDay: { type: Number, min: 1, max: 31, default: 20 },
      secondPayDay: { type: Number, min: 1, max: 31, default: 5 }
    },
    monthly: {
      cutoffDay: { type: Number, min: 1, max: 28, default: 25 },
      payDay: { type: Number, min: 1, max: 31, default: 30 }
    },
    defaultWorkDays: {
      type: [Number],
      default: [1, 2, 3, 4, 5],
      validate: value => value.every(day => Number.isInteger(day) && day >= 0 && day <= 6)
    },
    defaultShift: {
      start: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, default: '09:00' },
      end: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, default: '17:00' },
      breakMinutes: { type: Number, min: 0, max: 480, default: 60 }
    },
    gracePeriodMinutes: { type: Number, min: 0, max: 240, default: 10 },
    lateDeductionEnabled: { type: Boolean, default: true },
    undertimeDeductionEnabled: { type: Boolean, default: true },
    overtime: {
      enabled: { type: Boolean, default: false },
      multiplier: { type: Number, min: 1, max: 5, default: 1.25 },
      requiresApproval: { type: Boolean, default: true }
    },
    attendanceRadiusMeters: { type: Number, min: 20, max: 5000, default: 150 },
    maximumLocationAccuracyMeters: { type: Number, min: 10, max: 5000, default: 200 },
    outsideGeofencePolicy: { type: String, enum: ['reject', 'flag'], default: 'reject' },
    payrollApprovalRequired: { type: Boolean, default: true },
    leaveTypes: {
      type: [{
        key: { type: String, required: true, trim: true, lowercase: true },
        name: { type: String, required: true, trim: true, maxlength: 100 },
        isPaid: { type: Boolean, default: false },
        active: { type: Boolean, default: true }
      }],
      default: () => [
        { key: 'vacation', name: 'Vacation Leave', isPaid: true, active: true },
        { key: 'sick', name: 'Sick Leave', isPaid: true, active: true },
        { key: 'emergency', name: 'Emergency Leave', isPaid: false, active: true },
        { key: 'unpaid', name: 'Unpaid Leave', isPaid: false, active: true },
        { key: 'other', name: 'Other', isPaid: false, active: true }
      ]
    },
    updatedAt: Date,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  refundPolicy: {
    type: {
      type: String,
      enum: ['full_refund', 'conditional_refund', 'no_refund'],
      default: 'conditional_refund'
    },
    summary: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: 'Refund requests are reviewed by the store according to the order or service circumstances.'
    },
    conditions: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: ''
    },
    updatedAt: Date,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', select: false },
    auditLog: {
      type: [{
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        changedAt: { type: Date, default: Date.now },
        previous: { type: mongoose.Schema.Types.Mixed },
        next: { type: mongoose.Schema.Types.Mixed }
      }],
      select: false,
      default: []
    }
  },
  // Store-scoped role policy. Staff accounts inherit this at request time;
  // individual account permission payloads are not authoritative.
  rolePermissions: { type: mongoose.Schema.Types.Mixed, default: {} },
  staffSequence: { type: Number, default: 0, min: 0, select: false },
  taxConfiguration: {
    isConfigured: { type: Boolean, default: false },
    taxStatus: {
      type: String,
      enum: ['non_vat', 'vat_registered', 'vat_exempt', 'zero_rated'],
      default: 'non_vat'
    },
    pricingMode: {
      type: String,
      enum: ['inclusive', 'exclusive'],
      default: 'inclusive'
    },
    vatRatePercent: { type: Number, default: 12, min: 0, max: 100 },
    deliveryFeeTaxable: { type: Boolean, default: false },
    configuredAt: { type: Date, default: Date.now },
    configuredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', select: false },
    auditLog: {
      type: [{
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        changedAt: { type: Date, default: Date.now },
        previous: { type: mongoose.Schema.Types.Mixed },
        next: { type: mongoose.Schema.Types.Mixed }
      }],
      select: false,
      default: []
    }
  },
  // Authoritative business/tax identity verified from the Store Application.
  // Sensitive identifiers and documents are excluded unless explicitly selected.
  taxProfile: {
    birRegistered: { type: Boolean, default: false },
    declaredTaxStatus: {
      type: String,
      enum: ['vat_registered', 'non_vat_registered', null],
      default: null
    },
    verifiedTaxStatus: {
      type: String,
      enum: ['vat_registered', 'non_vat_registered', null],
      default: null
    },
    verificationStatus: {
      type: String,
      enum: ['unverified', 'pending', 'verified', 'rejected'],
      default: 'unverified'
    },
    tin: { type: String, select: false },
    branchCode: { type: String, select: false },
    registeredName: { type: String, trim: true },
    registeredAddress: { type: mongoose.Schema.Types.Mixed },
    lineOfBusiness: { type: String, trim: true },
    corDocumentUrl: { type: String, select: false },
    sourceApplication: { type: mongoose.Schema.Types.ObjectId, ref: 'StoreApplication' },
    submittedAt: Date,
    verifiedAt: Date,
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', select: false },
    rejectionReason: { type: String, select: false },
    verificationNotes: { type: String, select: false },
    updateRequestStatus: { type: String, enum: ['none', 'pending', 'resolved'], default: 'none' },
    updateRequestedAt: Date,
    updateRequestReason: { type: String, trim: true, maxlength: 1000, select: false }
  },
  businessProfile: {
    registeredBusinessName: { type: String, trim: true },
    tradeName: { type: String, trim: true },
    legalStructure: { type: String, trim: true },
    registrationAuthority: { type: String, trim: true },
    registrationNumber: { type: String, trim: true, select: false },
    registrationVerified: { type: Boolean, default: false },
    sourceApplication: { type: mongoose.Schema.Types.ObjectId, ref: 'StoreApplication' }
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
