const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    minlength: 6,
    select: false
    // Not required for OAuth users
  },
  googleId: {
    type: String,
    sparse: true
  },
  authProvider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  avatar: {
    type: String // Profile picture URL from OAuth
  },
  role: {
    type: String,
    enum: [
      'super_admin', 'platform_admin', 'admin', 'store_owner', 'manager',
      'cashier', 'inventory_staff', 'procurement_officer', 'finance_staff',
      'veterinarian', 'groomer', 'trainer', 'boarding_staff',
      'service_staff', 'delivery_dispatcher', 'delivery_rider', 'staff', 'supplier',
      'customer', 'auditor'
    ],
    default: 'customer'
  },
  staffType: {
    // Only relevant when role === 'staff'
    type: String,
    enum: [
      'veterinarian', 'groomer', 'trainer', 'boarding_staff', 'boarding_specialist',
      'veterinary_technician', 'veterinary_assistant', 'veterinary_nurse',
      'veterinary_laboratory_technician',
      'manager', 'cashier', 'procurement_officer', 'finance_staff', 'delivery_dispatcher',
      'medical_assistant', 'pet_handler', 'inventory_staff', 
      'logistics_staff', 'sales_staff', 'service_management_staff', 
      'administrative_support', 'order_staff', 'service_staff', 'delivery_rider', null
    ],
    default: null
  },
  createdBy: {
    // Admin who created this staff account
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  firstName: {
    type: String,
    required: false,
    trim: true
  },
  lastName: {
    type: String,
    required: false,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  address: {
    street: { type: String, required: false },
    city: { type: String, required: false },
    province: { type: String, required: false },
    barangay: { type: String, required: false },
    state: String,
    zipCode: String,
    country: String,
    coordinates: {
      lat: { type: Number },
      lng: { type: Number }
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store'
  },
  shippingSettings: {
    freeShipping: {
      type: Boolean,
      default: true
    },
    shippingFee: {
      type: Number,
      default: 0,
      min: 0
    },
    freeShippingThreshold: {
      type: Number,
      default: 0,
      min: 0
    }
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
  deactivationReason: {
    type: String,
    default: null
  },
  deactivatedAt: {
    type: Date,
    default: null
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: {
    type: String,
    default: null,
    select: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  permissions: {
    type: Object,
    default: {}
  },
  staffStatus: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'archived'],
    default: 'active'
  },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  requiresPasswordChange: {
    type: Boolean,
    default: false
  },
  riderProfile: {
    staffId: { type: String, trim: true, uppercase: true },
    accountStatus: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
    vehicleType: { type: String, enum: ['motorcycle', 'bicycle', 'car', 'van', 'other', ''], default: '' },
    plateNumber: { type: String, trim: true, uppercase: true, default: '' },
    licenseId: { type: String, trim: true, default: '' },
    deliveryZone: { type: String, trim: true, default: '' },
    earningRules: {
      baseRate: { type: Number, min: 0, default: 0 },
      incentive: { type: Number, min: 0, default: 0 },
      bonus: { type: Number, min: 0, default: 0 },
      deduction: { type: Number, min: 0, default: 0 }
    },
    payoutMethod: {
      type: { type: String, enum: ['gcash', 'maya', 'bank_transfer', ''], default: '' },
      accountName: { type: String, trim: true, default: '' },
      accountNumber: { type: String, trim: true, default: '' },
      bankName: { type: String, trim: true, default: '' }
    }
  },
  // Trust & Reputation Layer
  isVerified: { type: Boolean, default: false },
  verificationBadge: { type: String, enum: ['none', 'starter', 'trusted', 'premium'], default: 'none' },
  reputation: {
    successfulHandovers: { type: Number, default: 0 },
    cancellationCount: { type: Number, default: 0 },
    noShowFlags: { type: Number, default: 0 },
    lastActiveAt: { type: Date, default: Date.now }
  },
  activityStats: {
    totalInquiriesSubmitted: { type: Number, default: 0 },
    activePetInquiries: { type: Number, default: 0 }
  },
  // Professional Profile Data (for Staff)
  professionalProfile: {
    staffId: { type: String, trim: true, uppercase: true },
    professionalTitle: { type: String, trim: true },
    specialty: { type: String, trim: true },
    qualifications: [{ type: String, trim: true }],
    certifications: [{
      name: String,
      issuingBody: String,
      year: Number,
      documentUrl: String,
      isVerified: { type: Boolean, default: false }
    }],
    experienceYears: { type: Number, default: 0 },
    training: [{ type: String, trim: true }],
    areasOfExpertise: [{ type: String, trim: true }],
    languages: [{ type: String, trim: true }],
    registration: {
      type: { type: String, trim: true },
      number: { type: String, trim: true },
      issuingBody: { type: String, trim: true },
      expiresAt: Date
    },
    verification: {
      status: {
        type: String,
        enum: ['pending_verification', 'verified', 'expired', 'suspended'],
        default: 'pending_verification'
      },
      isRequired: { type: Boolean, default: false },
      verifiedAt: Date,
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      notes: { type: String, trim: true, maxlength: 1000, default: '' }
    },
    credentialDocuments: [{
      documentType: {
        type: String,
        enum: ['professional_license', 'certification', 'training_certificate'],
        required: true
      },
      name: { type: String, required: true, trim: true, maxlength: 160 },
      issuingBody: { type: String, trim: true, maxlength: 160, default: '' },
      credentialNumber: { type: String, trim: true, maxlength: 160, default: '' },
      documentUrl: { type: String, required: true },
      publicId: { type: String, required: true },
      originalName: { type: String, trim: true, maxlength: 255, default: '' },
      uploadedAt: { type: Date, default: Date.now },
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      expiresAt: Date,
      status: {
        type: String,
        enum: ['pending_verification', 'verified', 'expired', 'suspended', 'archived'],
        default: 'pending_verification'
      },
      verifiedAt: Date,
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      archivedAt: Date,
      archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      replacesDocument: { type: mongoose.Schema.Types.ObjectId },
      reminderHistory: {
        thirtyDaySentAt: Date,
        sevenDaySentAt: Date,
        expiredSentAt: Date
      }
    }],
    availability: {
      monday: { available: Boolean, start: String, end: String, breaks: [{ start: String, end: String }] },
      tuesday: { available: Boolean, start: String, end: String, breaks: [{ start: String, end: String }] },
      wednesday: { available: Boolean, start: String, end: String, breaks: [{ start: String, end: String }] },
      thursday: { available: Boolean, start: String, end: String, breaks: [{ start: String, end: String }] },
      friday: { available: Boolean, start: String, end: String, breaks: [{ start: String, end: String }] },
      saturday: { available: Boolean, start: String, end: String, breaks: [{ start: String, end: String }] },
      sunday: { available: Boolean, start: String, end: String, breaks: [{ start: String, end: String }] }
    },
    leaveSchedule: [{
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      reason: { type: String, trim: true, maxlength: 500, default: '' }
    }],
    temporaryUnavailable: {
      active: { type: Boolean, default: false },
      until: Date,
      reason: { type: String, trim: true, maxlength: 500, default: '' }
    },
    emergencyUnavailable: {
      active: { type: Boolean, default: false },
      since: Date,
      reason: { type: String, trim: true, maxlength: 500, default: '' }
    },
    bio: String,
    specializations: [String],
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    isPublic: { type: Boolean, default: true }
  },
  roleChangeHistory: [{
    from: String,
    to: String,
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }]
});

// Enforce unique email/username ONLY for non-deleted accounts
// This allows reusing emails from soft-deleted accounts
userSchema.index({ email: 1 }, { 
  unique: true, 
  partialFilterExpression: { isDeleted: false } 
});

userSchema.index({ username: 1 }, { 
  unique: true, 
  partialFilterExpression: { isDeleted: false } 
});

userSchema.index({ 'riderProfile.staffId': 1 }, {
  unique: true,
  partialFilterExpression: { staffType: 'delivery_rider', 'riderProfile.staffId': { $type: 'string' }, isDeleted: false }
});

userSchema.index({ 'professionalProfile.staffId': 1 }, {
  unique: true,
  partialFilterExpression: { role: 'staff', 'professionalProfile.staffId': { $type: 'string' }, isDeleted: false }
});

// Hash password before saving (only for local auth)
userSchema.pre('save', async function (next) {
  // If password is not modified and this isn't a new document, skip
  if (!this.isModified('password') && !this.isNew) return next();
  
  // If no password provided (e.g. OAuth users), skip
  if (!this.password) return next();

  // If password already looks like a bcrypt hash, skip to avoid double hashing
  if (this.password.startsWith('$2a$') || this.password.startsWith('$2b$')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    console.error('[UserModel] Password hashing failed');
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (typeof candidatePassword !== 'string' || typeof this.password !== 'string') {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

// Update timestamp on save
userSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('User', userSchema);
