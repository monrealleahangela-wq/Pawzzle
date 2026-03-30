const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
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
    minlength: 6
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
    enum: ['super_admin', 'admin', 'staff', 'customer'],
    default: 'customer'
  },
  staffType: {
    // Only relevant when role === 'staff'
    type: String,
    enum: ['order_staff', 'inventory_staff', 'service_staff', 'delivery_staff', null],
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
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
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
    country: String
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
    default: null
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  permissions: {
    type: Object,
    default: {}
  },
  requiresPasswordChange: {
    type: Boolean,
    default: false
  }
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

// Hash password before saving (only for local auth)
userSchema.pre('save', async function (next) {
  // If password is not modified and this isn't a new document, skip
  if (!this.isModified('password') && !this.isNew) return next();
  
  // If no password provided (e.g. OAuth users), skip
  if (!this.password) return next();

  // If password already looks like a bcrypt hash, skip to avoid double hashing
  if (this.password.startsWith('$2a$') || this.password.startsWith('$2b$')) {
    console.log(`[UserModel] Password for ${this.email} already hashed, skipping.`);
    return next();
  }

  try {
    console.log(`[UserModel] Hashing password for user: ${this.email}`);
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    console.log(`[UserModel] Password hashed successfully ($2x$ prefix: ${this.password.substring(0, 4)})`);
    next();
  } catch (error) {
    console.error(`[UserModel] Hashing FAILED for ${this.email}:`, error);
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Update timestamp on save
userSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('User', userSchema);
