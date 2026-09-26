const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  // ── Account Owner ─────────────────────────────────────
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },

  // ── Business Information ──────────────────────────────
  businessName: {
    type: String,
    required: true,
    trim: true
  },
  businessSlug: {
    type: String,
    unique: true
  },
  contactPerson: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    street: { type: String, required: true },
    barangay: { type: String },
    city: { type: String, required: true },
    province: { type: String, required: true },
    zipCode: { type: String },
    country: { type: String, default: 'PH' }
  },

  // ── Business Details ──────────────────────────────────
  description: {
    type: String,
    default: ''
  },
  logo: {
    type: String
  },
  productCategories: [{
    type: String,
    enum: [
      'pet_food', 'pet_treats', 'grooming_supplies', 'medical_supplies',
      'accessories', 'toys', 'cleaning_products', 'cages_habitats',
      'leashes_collars', 'health_supplements', 'raw_materials', 'other'
    ]
  }],

  // ── Legal & Verification ──────────────────────────────
  businessPermit: { type: String },
  taxId: { type: String, trim: true },
  verificationDocuments: [{ type: String }],

  // Supplier onboarding uses one profile and one account. Legacy records with
  // no supplierType are treated as platform suppliers by the service layer.
  supplierType: {
    type: String,
    enum: ['platform', 'store_added'],
    default: 'platform'
  },
  originStore: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null },
  storeAssociations: [{
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending_activation', 'active', 'inactive'],
      default: 'pending_activation'
    },
    associatedAt: { type: Date, default: Date.now },
    deactivatedAt: Date,
    reactivatedAt: Date
  }],
  applicationDocuments: [{
    documentType: {
      type: String,
      enum: ['business_registration', 'bir_certificate'],
      required: true
    },
    documentUrl: { type: String, required: true, select: false },
    originalName: String,
    mimeType: String,
    size: Number,
    status: {
      type: String,
      enum: ['pending', 'verified', 'needs_resubmission', 'rejected', 'superseded'],
      default: 'pending'
    },
    reviewerFeedback: String,
    submittedAt: { type: Date, default: Date.now },
    reviewedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  applicationHistory: [{
    action: {
      type: String,
      enum: ['submitted', 'resubmitted', 'approved', 'rejected', 'resubmission_requested']
    },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: String,
    at: { type: Date, default: Date.now }
  }],
  invitation: {
    tokenHash: { type: String, select: false },
    expiresAt: Date,
    sentAt: Date,
    acceptedAt: Date,
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  
  // ── Account Status ────────────────────────────────────
  status: {
    type: String,
    enum: ['pending_verification', 'resubmission_required', 'verified', 'suspended', 'rejected'],
    default: 'pending_verification'
  },
  verifiedAt: { type: Date },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String },
  suspensionReason: { type: String },

  // ── Performance Metrics ───────────────────────────────
  performance: {
    totalOrders: { type: Number, default: 0 },
    completedOrders: { type: Number, default: 0 },
    cancelledOrders: { type: Number, default: 0 },
    averageDeliveryDays: { type: Number, default: 0 },
    reliabilityScore: { type: Number, default: 100, min: 0, max: 100 },
    totalRevenue: { type: Number, default: 0 }
  },

  // ── Ratings ───────────────────────────────────────────
  ratings: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 }
  },

  // ── Payout Information ────────────────────────────────
  payoutAccount: {
    accountName: { type: String },
    accountNumber: { type: String },
    bankName: { type: String },
    type: { type: String, enum: ['gcash', 'maya', 'bank_transfer'] }
  },

  // ── Metadata ──────────────────────────────────────────
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

supplierSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (this.isModified('businessName') && !this.businessSlug) {
    this.businessSlug = this.businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') + '-' + Date.now();
  }
  next();
});

supplierSchema.index({ status: 1 });
supplierSchema.index({ 'productCategories': 1 });
supplierSchema.index({ user: 1 });
supplierSchema.index({ supplierType: 1, status: 1, isActive: 1 });
supplierSchema.index({ 'storeAssociations.store': 1, 'storeAssociations.status': 1 });
supplierSchema.index({ 'invitation.tokenHash': 1 }, { sparse: true });

module.exports = mongoose.model('Supplier', supplierSchema);
