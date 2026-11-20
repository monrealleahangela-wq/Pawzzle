const crypto = require('crypto');
const mongoose = require('mongoose');

const storeApplicationSchema = new mongoose.Schema({
  applicant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  businessName: {
    type: String,
    trim: true
  },
  registeredBusinessName: { type: String, trim: true },
  tradeName: { type: String, trim: true },
  natureOfBusiness: { type: String, trim: true, maxlength: 500 },
  yearBusinessStarted: { type: Number, min: 1800, max: 2200 },
  businessType: {
    type: String,
    enum: ['pet_store', 'breeder', 'shelter', 'veterinary', 'grooming', 'training', 'other']
  },
  operationalModules: [{
    type: String,
    enum: ['pets', 'products', 'services'],
    required: true
  }],
  businessCategories: [{
    type: String,
    enum: ['pet_products', 'pet_sales', 'pet_grooming', 'pet_boarding', 'veterinary_services', 'other_pet_services']
  }],
  applicationReference: {
    type: String,
    trim: true,
    uppercase: true,
    index: true,
    unique: true,
    sparse: true,
    default: () => `APP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
  },
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
  supplierNeeds: {
    type: Boolean,
    default: false
  },
  inventoryPlans: {
    type: String,
    trim: true
  },
  productCategories: [{
    type: String
  }],
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
      type: String
    },
    email: {
      type: String
    },
    address: {
      unitBuilding: { type: String, trim: true },
      street: { type: String, required: false },
      barangay: { type: String, required: false },
      city: { type: String, required: false },
      state: { type: String, required: false },
      province: { type: String, required: false },
      zipCode: { type: String, required: false },
      country: { type: String, required: false },
      landmark: { type: String, trim: true },
      coordinates: {
        lat: { type: Number, min: -90, max: 90 },
        lng: { type: Number, min: -180, max: 180 }
      }
    }
  },
  representative: {
    fullName: { type: String, trim: true },
    role: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    isAuthorizedRepresentative: { type: Boolean, default: false },
    authorityDocumentUrl: { type: String, select: false }
  },
  businessRegistration: {
    authority: { type: String, enum: ['dti', 'sec', 'cda', 'other'] },
    certificateNumber: { type: String, trim: true },
    registeredName: { type: String, trim: true },
    registrationDate: Date,
    expirationDate: Date,
    documentUrl: { type: String, select: false }
  },
  barangayClearance: {
    number: { type: String, trim: true },
    issuingBarangay: { type: String, trim: true },
    issueDate: Date,
    expiryDate: Date
  },
  taxProfile: {
    birRegistrationStatus: {
      type: String,
      enum: ['registered', 'not_registered', 'pending_registration'],
      default: 'registered'
    },
    taxpayerClassification: { type: String, trim: true },
    tin: { type: String, trim: true, select: false },
    branchCode: { type: String, trim: true, select: false },
    registeredName: { type: String, trim: true },
    registeredAddress: {
      unitBuilding: String,
      street: String,
      barangay: String,
      city: String,
      province: String,
      postalCode: String,
      country: { type: String, default: 'PH' }
    },
    lineOfBusiness: { type: String, trim: true },
    declaredTaxStatus: {
      type: String,
      enum: ['vat_registered', 'non_vat_registered'],
      set: value => value === '' || value === null ? undefined : value
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
    corDocumentUrl: { type: String, select: false },
    submittedAt: Date,
    verifiedAt: Date,
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: { type: String, trim: true },
    verificationNotes: { type: String, trim: true }
  },
  declaration: {
    accepted: { type: Boolean, default: false },
    acceptedAt: Date,
    applicantName: { type: String, trim: true }
  },
  businessDescription: {
    type: String,
    required: false,
    maxlength: 1000
  },
  legalStructure: {
    type: String,
    enum: ['single_proprietorship', 'sole_proprietorship', 'one_person_corporation', 'partnership', 'corporation', 'cooperative', 'other'],
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
    required: false,
    select: false
  },
  businessRegistrationUrl: {
    type: String, // DTI or SEC
    required: false,
    select: false
  },
  birRegistrationUrl: {
    type: String, // BIR Form 2303
    required: false,
    select: false
  },
  barangayClearanceUrl: {
    type: String,
    required: false,
    select: false
  },
  storeLogoUrl: {
    type: String,
    required: false
  },
  storefrontPhotoUrls: [{
    type: String,
    select: false
  }],
  mayorsPermitUrl: {
    type: String,
    required: false,
    select: false
  },
  proofOfBusinessAddressUrl: { type: String, select: false },
  activityDocuments: [{
    activity: {
      type: String,
      enum: ['pets', 'products', 'services'],
      required: true
    },
    label: { type: String, required: true, trim: true },
    documentUrl: { type: String, required: true, select: false },
    originalName: { type: String, trim: true },
    issueDate: Date,
    expiryDate: Date
  }],
  categoryDocuments: [{
    requirementKey: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    level: { type: String, enum: ['required', 'conditional', 'recommended'], required: true },
    categories: [{ type: String, enum: ['pet_products', 'pet_sales', 'pet_grooming', 'pet_boarding', 'veterinary_services', 'other_pet_services'] }],
    documentUrl: { type: String, required: true, select: false },
    originalName: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    fileSize: Number,
    issueDate: Date,
    expiryDate: Date
  }],
  documentReview: {
    status: {
      type: String,
      enum: ['not_checked', 'ready_for_manual_review', 'needs_attention'],
      default: 'not_checked'
    },
    checkedAt: Date,
    manualApprovalRequired: { type: Boolean, default: true },
    checks: [{
      documentKey: { type: String, trim: true },
      label: { type: String, trim: true },
      status: {
        type: String,
        enum: ['complete', 'needs_review', 'mismatch', 'expired', 'unreadable']
      },
      message: { type: String, trim: true, maxlength: 500 }
    }],
    extractedInformation: [{
      documentKey: { type: String, trim: true, maxlength: 60 },
      field: { type: String, trim: true, maxlength: 120 },
      label: { type: String, trim: true, maxlength: 160 },
      value: { type: String, trim: true, maxlength: 300 },
      correctedByAdmin: { type: Boolean, default: false },
      correctedAt: Date,
      correctedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }]
  },
  draftSavedAt: Date,
  submittedAt: Date,
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
    enum: ['draft', 'submitted', 'pending_review', 'under_review', 'approved', 'rejected', 'requires_more_info', 'withdrawn', 'expansion_pending'],
    default: 'draft'
  },
  requiredCorrections: [{
    type: String,
    enum: [
      'businessName', 'businessType', 'businessDescription', 'storeLogo',
      'taxId', 'governmentId', 'businessRegistration', 'mayorsPermit',
      'birRegistration', 'barangayClearance', 'address', 'paymentInfo',
      'references', 'representative', 'businessRegistrationDetails',
      'taxProfile', 'taxStatus', 'coordinates', 'declaration',
      'storefrontPhotos', 'petActivityDocuments', 'productActivityDocuments', 'serviceActivityDocuments',
      'proofOfBusinessAddress', 'categoryDocuments'
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
  approvedStore: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
  reviewHistory: [{
    action: {
      type: String,
      enum: ['draft_saved', 'submitted', 'resubmitted', 'under_review', 'needs_correction', 'approved', 'rejected', 'withdrawn', 'tax_verified', 'tax_rejected', 'tax_update_requested', 'document_review_corrected']
    },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, default: Date.now },
    notes: { type: String, trim: true },
    sections: [String]
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
  },
  deletedAt: {
    type: Date,
    default: null
  },
  applicationType: {
    type: String,
    enum: ['new_store', 'expansion'],
    default: 'new_store'
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

module.exports = mongoose.model('StoreApplication', storeApplicationSchema);
