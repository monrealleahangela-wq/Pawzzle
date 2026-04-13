const mongoose = require('mongoose');

const storeApplicationSchema = new mongoose.Schema({
  applicant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  businessName: {
    type: String,
    required: true,
    trim: true
  },
  businessType: {
    type: String,
    enum: ['pet_store', 'breeder', 'shelter', 'veterinary', 'grooming', 'training', 'other'],
    required: true
  },
  businessLicense: {
    number: {
      type: String,
      required: false
    },
    issuingAuthority: {
      type: String,
      required: false
    },
    issueDate: {
      type: Date,
      required: false
    },
    expiryDate: {
      type: Date,
      required: false
    },
    documentUrl: {
      type: String,
      required: false
    }
  },
  taxId: {
    type: String,
    required: false
  },
  contactInfo: {
    phone: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    },
    address: {
      street: { type: String, required: false },
      city: { type: String, required: false },
      state: { type: String, required: false },
      zipCode: { type: String, required: false },
      country: { type: String, required: false }
    }
  },
  businessDescription: {
    type: String,
    required: false,
    maxlength: 1000
  },
  legalStructure: {
    type: String,
    enum: ['single_proprietorship', 'partnership', 'corporation', 'cooperative', 'other'],
    default: 'single_proprietorship'
  },
  yearsInBusiness: {
    type: Number,
    min: 0,
    default: 0
  },
  numberOfEmployees: {
    type: Number,
    min: 0,
    default: 1
  },
  hasPhysicalStore: {
    type: Boolean,
    default: true
  },
  emergencyContact: {
    name: { type: String, required: false },
    phone: { type: String, required: false },
    relationship: { type: String, required: false }
  },
  website: {
    type: String,
    trim: true
  },
  socialMedia: {
    facebook: String,
    instagram: String,
    twitter: String
  },
  references: [{
    name: { type: String, required: false },
    business: { type: String, required: false },
    phone: { type: String, required: false },
    email: { type: String, required: false }
  }],
  certifications: [{
    name: { type: String, required: true },
    issuingOrganization: { type: String, required: true },
    issueDate: { type: Date, required: true },
    expiryDate: Date,
    documentUrl: { type: String, required: false }
  }],
  governmentIdUrl: {
    type: String,
    required: false
  },
  businessRegistrationUrl: {
    type: String, // DTI or SEC
    required: false
  },
  birRegistrationUrl: {
    type: String, // BIR Form 2303
    required: false
  },
  barangayClearanceUrl: {
    type: String,
    required: false
  },
  storeLogoUrl: {
    type: String,
    required: false
  },
  mayorsPermitUrl: {
    type: String,
    required: false
  },
  paymentInfo: {
    bankName: String,
    bankAccountName: String,
    bankAccountNumber: String,
    alternativePaymentMethod: {
      provider: { type: String, enum: ['GCash', 'PayMaya', 'Other'] },
      accountNumber: String
    }
  },
  productsOffered: [{
    type: String
  }],
  insurance: {
    provider: { type: String, required: false },
    policyNumber: { type: String, required: false },
    coverageAmount: { type: Number, required: false },
    expiryDate: { type: Date, required: false },
    documentUrl: { type: String, required: false }
  },
  status: {
    type: String,
    enum: ['pending', 'under_review', 'approved', 'rejected', 'requires_more_info'],
    default: 'under_review'
  },
  requiredCorrections: [{
    type: String,
    enum: [
      'businessName', 'businessType', 'businessDescription', 'storeLogo',
      'taxId', 'governmentId', 'businessRegistration', 'mayorsPermit',
      'birRegistration', 'barangayClearance', 'address', 'paymentInfo',
      'references'
    ]
  }],
  reviewNotes: {
    type: String,
    trim: true
  },
  rejectionReason: {
    type: String,
    trim: true
  },
  verificationScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  verificationChecks: {
    licenseValid: { type: Boolean, default: false },
    taxIdValid: { type: Boolean, default: false },
    insuranceValid: { type: Boolean, default: false },
    certificationsValid: { type: Boolean, default: false },
    referencesValid: { type: Boolean, default: false },
    businessRegistered: { type: Boolean, default: false }
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Verification Level Virtual
storeApplicationSchema.virtual('verificationLevel').get(function() {
  const score = this.verificationScore || 0;
  if (score === 0) return 1;
  return Math.min(5, Math.floor(score / 20) + 1);
});

// Update timestamp on save
storeApplicationSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Calculate verification score
storeApplicationSchema.methods.calculateVerificationScore = function () {
  let score = 0;
  const checks = this.verificationChecks;

  // License verification (20 points)
  if (checks.licenseValid) score += 20;

  // Tax ID verification (20 points)
  if (checks.taxIdValid) score += 20;

  // Government ID (15 points)
  if (this.governmentIdUrl) score += 15;

  // Business Registration Documents (15 points)
  if (this.businessRegistrationUrl || this.birRegistrationUrl || this.mayorsPermitUrl) score += 15;

  // Insurance verification (10 points)
  if (checks.insuranceValid) score += 10;

  // Professional References (10 points)
  if (checks.referencesValid) score += 10;

  // Digital Identity (Store Logo & Description) (10 points)
  if (this.storeLogoUrl) score += 5;
  if (this.businessDescription && this.businessDescription.length > 50) score += 5;

  this.verificationScore = score;
  return score;
};

// Auto-verification logic
storeApplicationSchema.methods.autoVerify = function () {
  const checks = this.verificationChecks;

  // Check if license is not expired
  if (this.businessLicense?.expiryDate && new Date(this.businessLicense.expiryDate) > new Date()) {
    checks.licenseValid = true;
  }

  // Basic tax ID format validation (simplified)
  if (this.taxId && this.taxId.length >= 9) {
    checks.taxIdValid = true;
  }

  // Check insurance expiry
  if (this.insurance?.expiryDate && new Date(this.insurance.expiryDate) > new Date()) {
    checks.insuranceValid = true;
  }

  // Check certifications
  if (this.certifications && this.certifications.length > 0) {
    const validCerts = this.certifications.filter(cert =>
      cert.expiryDate && new Date(cert.expiryDate) > new Date()
    );
    checks.certificationsValid = validCerts.length > 0;
  }

  // Basic reference validation
  if (this.references?.length >= 2) {
    checks.referencesValid = true;
  }

  // Business registration: Check if at least one major business doc is present
  if (this.businessRegistrationUrl || this.birRegistrationUrl || this.mayorsPermitUrl) {
    checks.businessRegistered = true;
  }

  return this.calculateVerificationScore();
};

module.exports = mongoose.model('StoreApplication', storeApplicationSchema);
