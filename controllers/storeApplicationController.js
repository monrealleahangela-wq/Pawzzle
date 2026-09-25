const { validationResult } = require('express-validator');
const StoreApplication = require('../models/StoreApplication');
const User = require('../models/User');
const Store = require('../models/Store');
const multer = require('multer');
const path = require('path');
const { createNotification } = require('./notificationController');
const { uploadDoc, cloudinary } = require('../middleware/upload');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { isPlatformAdmin } = require('../config/permissions');

const BUSINESS_STRUCTURES = [
  'single_proprietorship', 'sole_proprietorship', 'one_person_corporation',
  'corporation', 'partnership', 'cooperative', 'other'
];
const REGISTRATION_AUTHORITIES = ['dti', 'sec', 'cda', 'other'];
const DECLARED_TAX_STATUSES = ['vat_registered', 'non_vat_registered'];

const maskTin = value => value ? `${String(value).replace(/\D/g, '').slice(0, 3)}-***-***` : null;

const applicationValidationErrors = (data, files = {}) => {
  const errors = [];
  const address = data.contactInfo?.address || {};
  const registration = data.businessRegistration || {};
  const tax = data.taxProfile || {};
  const coordinates = address.coordinates || {};
  const required = (value, field, message) => {
    if (value === undefined || value === null || String(value).trim() === '') errors.push({ field, msg: message });
  };

  required(data.businessName, 'businessName', 'Store / trade name is required.');
  required(data.registeredBusinessName, 'registeredBusinessName', 'Registered business name is required.');
  if (!['pet_store', 'breeder', 'shelter', 'veterinary', 'grooming', 'training', 'other'].includes(data.businessType)) errors.push({ field: 'businessType', msg: 'Select a valid store category.' });
  if (!BUSINESS_STRUCTURES.includes(data.legalStructure)) errors.push({ field: 'legalStructure', msg: 'Select a valid business structure.' });
  required(data.natureOfBusiness, 'natureOfBusiness', 'Nature or line of business is required.');
  required(data.businessDescription, 'businessDescription', 'Store description is required.');
  if (!Array.isArray(data.operationalModules) || data.operationalModules.length === 0) errors.push({ field: 'operationalModules', msg: 'Select at least one store operation.' });
  required(data.contactInfo?.phone, 'contactInfo.phone', 'Primary contact number is required.');
  required(data.contactInfo?.email, 'contactInfo.email', 'Business email is required.');
  for (const [key, label] of [['street', 'Street'], ['barangay', 'Barangay'], ['city', 'City / municipality'], ['province', 'Province'], ['zipCode', 'Postal code']]) {
    required(address[key] || (key === 'province' ? address.state : ''), `contactInfo.address.${key}`, `${label} is required.`);
  }
  if (!Number.isFinite(Number(coordinates.lat)) || !Number.isFinite(Number(coordinates.lng))
      || Number(coordinates.lat) < -90 || Number(coordinates.lat) > 90
      || Number(coordinates.lng) < -180 || Number(coordinates.lng) > 180) {
    errors.push({ field: 'contactInfo.address.coordinates', msg: 'Select a valid store location on the map.' });
  }
  required(data.representative?.fullName, 'representative.fullName', 'Owner or representative legal name is required.');
  required(data.representative?.role, 'representative.role', 'Owner or representative role is required.');
  required(data.representative?.phone, 'representative.phone', 'Representative contact number is required.');
  required(data.representative?.email, 'representative.email', 'Representative email is required.');
  if (!REGISTRATION_AUTHORITIES.includes(registration.authority)) errors.push({ field: 'businessRegistration.authority', msg: 'Select a valid registration authority.' });
  const expectedAuthority = ['single_proprietorship', 'sole_proprietorship'].includes(data.legalStructure)
    ? 'dti'
    : ['one_person_corporation', 'corporation', 'partnership'].includes(data.legalStructure)
      ? 'sec'
      : data.legalStructure === 'cooperative' ? 'cda' : null;
  if (expectedAuthority && registration.authority !== expectedAuthority) {
    errors.push({ field: 'businessRegistration.authority', msg: `${expectedAuthority.toUpperCase()} registration is expected for the selected business structure.` });
  }
  required(registration.certificateNumber, 'businessRegistration.certificateNumber', 'Registration number is required.');
  required(registration.registeredName, 'businessRegistration.registeredName', 'Registered name is required.');
  if (!registration.documentUrl && !files.businessRegistration) errors.push({ field: 'businessRegistration', msg: 'Business registration document is required.' });

  if (!['registered', 'not_registered', 'pending_registration'].includes(tax.birRegistrationStatus)) {
    errors.push({ field: 'taxProfile.birRegistrationStatus', msg: 'Select the current BIR registration status.' });
  }
  if (tax.birRegistrationStatus === 'registered') {
    required(tax.tin, 'taxProfile.tin', 'TIN is required for a BIR-registered business.');
    required(tax.branchCode, 'taxProfile.branchCode', 'BIR branch code is required.');
    required(tax.registeredName, 'taxProfile.registeredName', 'BIR registered name is required.');
    required(tax.lineOfBusiness, 'taxProfile.lineOfBusiness', 'BIR line of business is required.');
    for (const [key, label] of [['street', 'street'], ['barangay', 'barangay'], ['city', 'city / municipality'], ['province', 'province'], ['postalCode', 'postal code']]) {
      required(tax.registeredAddress?.[key], `taxProfile.registeredAddress.${key}`, `BIR registered ${label} is required.`);
    }
    if (!DECLARED_TAX_STATUSES.includes(tax.declaredTaxStatus)) errors.push({ field: 'taxProfile.declaredTaxStatus', msg: 'Declared VAT or Non-VAT status is required.' });
    if (!tax.corDocumentUrl && !files.birRegistration) errors.push({ field: 'birRegistration', msg: 'BIR Certificate of Registration (Form 2303) is required.' });
    if (tax.tin && !/^\d{3}[- ]?\d{3}[- ]?\d{3,6}$/.test(String(tax.tin).trim())) {
      errors.push({ field: 'taxProfile.tin', msg: 'Enter a valid TIN using digits and optional hyphens.' });
    }
  }
  if (data.representative?.isAuthorizedRepresentative && !data.representative?.authorityDocumentUrl && !files.authorityDocument) {
    errors.push({ field: 'authorityDocument', msg: 'Proof of authority is required for an authorized representative.' });
  }
  if (data.declaration?.accepted !== true) errors.push({ field: 'declaration.accepted', msg: 'Accept the declaration before submitting.' });
  return errors;
};

const applicationQueryWithPrivateFields = query => query.select([
  '+taxProfile.tin', '+taxProfile.branchCode', '+taxProfile.corDocumentUrl',
  '+businessRegistration.documentUrl', '+representative.authorityDocumentUrl'
].join(' '));

const toApplicationResponse = (application, { includeDocuments = false } = {}) => {
  const object = application?.toObject ? application.toObject({ virtuals: true }) : { ...application };
  if (object.taxProfile) {
    object.taxProfile.tinMasked = maskTin(object.taxProfile.tin);
    if (!includeDocuments) {
      delete object.taxProfile.tin;
      delete object.taxProfile.branchCode;
      delete object.taxProfile.corDocumentUrl;
    }
  }
  if (!includeDocuments) {
    if (object.businessRegistration) delete object.businessRegistration.documentUrl;
    if (object.representative) delete object.representative.authorityDocumentUrl;
    delete object.governmentIdUrl;
    delete object.businessRegistrationUrl;
    delete object.birRegistrationUrl;
    delete object.barangayClearanceUrl;
    delete object.mayorsPermitUrl;
  }
  return object;
};

const taxProfileObject = profile => profile?.toObject ? profile.toObject() : { ...(profile || {}) };

// The Store becomes authoritative once an application has been approved. The
// original StoreApplication remains an immutable onboarding/audit record, so
// management responses must not treat its older tax decision as current.
const resolveAuthoritativeTaxProfile = (application, store) => {
  const submitted = taxProfileObject(application?.taxProfile);
  if (!store) {
    const fallback = { ...submitted, source: 'application' };
    if (fallback.tin) fallback.tinMasked = maskTin(fallback.tin);
    delete fallback.tin;
    delete fallback.corDocumentUrl;
    return fallback;
  }

  const current = taxProfileObject(store.taxProfile);
  const resolved = {
    ...submitted,
    birRegistrationStatus: current.birRegistered ? 'registered' : 'not_registered',
    declaredTaxStatus: current.declaredTaxStatus ?? null,
    verifiedTaxStatus: current.verifiedTaxStatus ?? null,
    verificationStatus: current.verificationStatus || 'unverified',
    tinMasked: maskTin(current.tin || submitted.tin),
    branchCode: current.branchCode || submitted.branchCode,
    registeredName: current.registeredName || submitted.registeredName,
    registeredAddress: current.registeredAddress || submitted.registeredAddress,
    lineOfBusiness: current.lineOfBusiness || submitted.lineOfBusiness,
    submittedAt: current.submittedAt || submitted.submittedAt,
    verifiedAt: current.verifiedAt || null,
    rejectionReason: current.rejectionReason || '',
    verificationNotes: current.verificationNotes || '',
    sourceApplication: current.sourceApplication || application?._id,
    source: 'store'
  };
  delete resolved.tin;
  delete resolved.corDocumentUrl;
  return resolved;
};

const attachStoreSummaries = async (applications, { includeDocuments = false } = {}) => {
  const rows = Array.isArray(applications) ? applications : [applications];
  const ownerIds = rows
    .map(application => application?.populated?.('applicant') || application?.applicant?._id || application?.applicant)
    .filter(Boolean);
  const stores = ownerIds.length
    ? await Store.find({ owner: { $in: ownerIds }, isDeleted: { $ne: true } })
      .select('_id owner name verificationStatus isActive isDeleted contactInfo.address taxProfile.birRegistered taxProfile.declaredTaxStatus taxProfile.verificationStatus taxProfile.verifiedTaxStatus taxProfile.registeredName taxProfile.registeredAddress taxProfile.lineOfBusiness taxProfile.sourceApplication taxProfile.submittedAt taxProfile.verifiedAt +taxProfile.tin +taxProfile.branchCode +taxProfile.rejectionReason +taxProfile.verificationNotes')
      .lean()
    : [];
  const storesByOwner = new Map(stores.map(store => [String(store.owner), store]));

  return rows.map(application => {
    const ownerId = application?.populated?.('applicant') || application?.applicant?._id || application?.applicant;
    const store = storesByOwner.get(String(ownerId)) || null;
    const storeSummary = store ? {
      _id: store._id,
      name: store.name,
      verificationStatus: store.verificationStatus,
      isActive: store.isActive,
      isDeleted: store.isDeleted,
      taxProfile: {
        verificationStatus: store.taxProfile?.verificationStatus || 'unverified',
        verifiedTaxStatus: store.taxProfile?.verifiedTaxStatus || null
      }
    } : null;
    return {
      ...toApplicationResponse(application, { includeDocuments }),
      currentTaxProfile: resolveAuthoritativeTaxProfile(application, store),
      store: storeSummary
    };
  });
};

const applyAuthoritativeTaxFilters = async (filter, { taxVerificationStatus, declaredTaxStatus, verifiedTaxStatus }) => {
  if (!taxVerificationStatus && !declaredTaxStatus && !verifiedTaxStatus) return;

  const stores = await Store.find({ isDeleted: { $ne: true } })
    .select('owner taxProfile.verificationStatus taxProfile.declaredTaxStatus taxProfile.verifiedTaxStatus')
    .lean();
  const allStoreOwnerIds = stores.map(store => store.owner).filter(Boolean);
  const matchingStoreOwnerIds = stores.filter(store => (
    (!taxVerificationStatus || store.taxProfile?.verificationStatus === taxVerificationStatus)
    && (!declaredTaxStatus || store.taxProfile?.declaredTaxStatus === declaredTaxStatus)
    && (!verifiedTaxStatus || store.taxProfile?.verifiedTaxStatus === verifiedTaxStatus)
  )).map(store => store.owner).filter(Boolean);
  const historicalApplicationMatch = { applicant: { $nin: allStoreOwnerIds } };
  if (taxVerificationStatus) historicalApplicationMatch['taxProfile.verificationStatus'] = taxVerificationStatus;
  if (declaredTaxStatus) historicalApplicationMatch['taxProfile.declaredTaxStatus'] = declaredTaxStatus;
  if (verifiedTaxStatus) historicalApplicationMatch['taxProfile.verifiedTaxStatus'] = verifiedTaxStatus;

  filter.$and = [
    ...(filter.$and || []),
    { $or: [{ applicant: { $in: matchingStoreOwnerIds } }, historicalApplicationMatch] }
  ];
};

// Configure multer for file uploads
// Configure Cloudinary storage for documents
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'pawzzle/documents',
    resource_type: 'auto',
    allowed_formats: ['jpeg', 'jpg', 'png', 'pdf', 'doc', 'docx']
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only document and image files are allowed'));
    }
  }
});

// Helper to parse JSON if field is a string
const safeParse = (data) => {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch (e) {
      return data;
    }
  }
  return data;
};

// Submit store application
const submitApplication = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const applicationData = {
      ...req.body,
      applicant: req.user.id,
      businessLicense: safeParse(req.body.businessLicense) || {},
      contactInfo: safeParse(req.body.contactInfo) || {},
      representative: safeParse(req.body.representative) || {},
      businessRegistration: safeParse(req.body.businessRegistration) || {},
      taxProfile: safeParse(req.body.taxProfile) || {},
      declaration: safeParse(req.body.declaration) || {},
      socialMedia: safeParse(req.body.socialMedia),
      references: safeParse(req.body.references),
      certifications: safeParse(req.body.certifications),
      insurance: safeParse(req.body.insurance),
      emergencyContact: safeParse(req.body.emergencyContact),
      operationalModules: safeParse(req.body.operationalModules) || [],
      staffTypes: safeParse(req.body.staffTypes) || [],
      productCategories: safeParse(req.body.productCategories) || [],
      paymentInfo: safeParse(req.body.paymentInfo),
      productsOffered: safeParse(req.body.productsOffered),
      hiringStaff: req.body.hiringStaff === 'true' || req.body.hiringStaff === true,
      supplierNeeds: req.body.supplierNeeds === 'true' || req.body.supplierNeeds === true,
      inventoryPlans: req.body.inventoryPlans || '',
      yearsInBusiness: Number.parseInt(req.body.yearsInBusiness, 10) || 0,
      yearBusinessStarted: Number.parseInt(req.body.yearBusinessStarted, 10) || undefined,
      numberOfEmployees: Number.parseInt(req.body.numberOfEmployees, 10) || 1,
      hasPhysicalStore: req.body.hasPhysicalStore === 'true' || req.body.hasPhysicalStore === true
    };

    const existingApplication = await applicationQueryWithPrivateFields(StoreApplication.findOne({
      applicant: req.user.id,
      applicationType: 'new_store',
      isDeleted: { $ne: true }
    }).sort({ createdAt: -1 }));
    // Never trust document URLs posted by the browser. Reuse the already-owned
    // secure upload unless the applicant supplied a replacement file.
    applicationData.businessRegistration.documentUrl = req.files?.businessRegistration
      ? undefined
      : existingApplication?.businessRegistration?.documentUrl;
    applicationData.taxProfile.corDocumentUrl = req.files?.birRegistration
      ? undefined
      : existingApplication?.taxProfile?.corDocumentUrl;
    applicationData.representative.authorityDocumentUrl = req.files?.authorityDocument
      ? undefined
      : existingApplication?.representative?.authorityDocumentUrl;

    const structuredErrors = applicationValidationErrors(applicationData, req.files || {});
    if (structuredErrors.length) {
      return res.status(400).json({ message: 'Complete the required application sections.', errors: structuredErrors });
    }

    if (existingApplication && ['under_review', 'pending_review', 'submitted', 'approved'].includes(existingApplication.status)) {
      return res.status(400).json({
        message: existingApplication.status === 'approved'
          ? 'Your store application has already been approved.'
          : 'You already have an application under review.'
      });
    }

    applicationData.taxProfile = {
      ...applicationData.taxProfile,
      verifiedTaxStatus: null,
      verificationStatus: applicationData.taxProfile.birRegistrationStatus === 'registered' ? 'pending' : 'unverified',
      submittedAt: new Date(),
      verifiedAt: null,
      verifiedBy: null,
      rejectionReason: '',
      verificationNotes: ''
    };
    applicationData.declaration = { ...applicationData.declaration, acceptedAt: new Date() };

    // Handle file uploads
    if (req.files) {
      if (req.files.licenseDocument) {
        applicationData.businessLicense = {
          ...applicationData.businessLicense,
          documentUrl: req.files.licenseDocument[0].path || req.files.licenseDocument[0].secure_url
        };
      }
      if (req.files.insuranceDocument) {
        applicationData.insurance = {
          ...applicationData.insurance,
          documentUrl: req.files.insuranceDocument[0].path || req.files.insuranceDocument[0].secure_url
        };
      }
      if (req.files.certificationDocuments) {
        applicationData.certifications = (applicationData.certifications || []).map((cert, index) => ({
          ...cert,
          documentUrl: req.files.certificationDocuments[index]?.path || req.files.certificationDocuments[index]?.secure_url
        }));
      }
      if (req.files.governmentId) {
        applicationData.governmentIdUrl = req.files.governmentId[0].path || req.files.governmentId[0].secure_url;
      }
      if (req.files.businessRegistration) {
        const documentUrl = req.files.businessRegistration[0].path || req.files.businessRegistration[0].secure_url;
        applicationData.businessRegistrationUrl = documentUrl;
        applicationData.businessRegistration.documentUrl = documentUrl;
      }
      if (req.files.birRegistration) {
        const documentUrl = req.files.birRegistration[0].path || req.files.birRegistration[0].secure_url;
        applicationData.birRegistrationUrl = documentUrl;
        applicationData.taxProfile.corDocumentUrl = documentUrl;
      }
      if (req.files.authorityDocument) {
        applicationData.representative.authorityDocumentUrl = req.files.authorityDocument[0].path || req.files.authorityDocument[0].secure_url;
      }
      if (req.files.barangayClearance) {
        applicationData.barangayClearanceUrl = req.files.barangayClearance[0].path || req.files.barangayClearance[0].secure_url;
      }
      if (req.files.storeLogo) {
        applicationData.storeLogoUrl = req.files.storeLogo[0].path || req.files.storeLogo[0].secure_url;
      }
      if (req.files.mayorsPermit) {
        applicationData.mayorsPermitUrl = req.files.mayorsPermit[0].path || req.files.mayorsPermit[0].secure_url;
      }
    }

    const isResubmission = Boolean(existingApplication && ['requires_more_info', 'rejected', 'draft'].includes(existingApplication.status));
    const application = isResubmission ? existingApplication : new StoreApplication();
    application.set(applicationData);

    // Completeness scoring is advisory only. Documents and tax status remain
    // pending until a Platform Admin explicitly reviews them.
    application.calculateVerificationScore();

    // All applications now require manual review by Super Admin
    // We set status to under_review to ensure it appears in the admin dashboard
    application.status = 'under_review';
    application.reviewNotes = application.verificationScore >= 60 
      ? 'Application submitted and awaiting manual review'
      : 'Application submitted but may require additional documentation due to low verification score';
    application.reviewHistory.push({
      action: isResubmission ? 'resubmitted' : 'submitted',
      actor: req.user.id,
      notes: isResubmission ? 'Applicant resubmitted requested corrections.' : 'Application submitted for Platform Admin review.'
    });

    await application.save();

    res.status(201).json({
      message: 'Application submitted successfully',
      application: {
        id: application._id,
        status: application.status,
        taxVerificationStatus: application.taxProfile?.verificationStatus,
        verificationScore: application.verificationScore,
        reviewNotes: application.reviewNotes
      }
    });

    // Notify applicant
    await createNotification({
      recipient: req.user.id,
      type: 'store_application',
      title: 'Store Application Received',
      message: `Your application status: ${application.status.replace(/_/g, ' ')}. ${application.reviewNotes}`,
      relatedId: application._id,
      relatedModel: 'StoreApplication'
    });
  } catch (error) {
    console.error('Submit application error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Request business expansion
const submitExpansionRequest = async (req, res) => {
  try {
    const { operationalModules, hiringStaff, staffTypes, supplierNeeds, inventoryPlans, productCategories, businessDescription } = req.body;
    
    // Validate if store exists
    const store = await Store.findOne({ owner: req.user.id });
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    // Check for existing pending expansion
    const existing = await StoreApplication.findOne({
      applicant: req.user.id,
      applicationType: 'expansion',
      status: { $in: ['pending_review', 'under_review', 'requires_more_info'] }
    });

    if (existing) {
      return res.status(400).json({ message: 'A business expansion request is already in progress' });
    }

    const applicationData = {
      applicant: req.user.id,
      businessName: store.name,
      businessType: store.businessType,
      applicationType: 'expansion',
      status: 'pending_review',
      operationalModules: safeParse(operationalModules),
      hiringStaff: hiringStaff === 'true' || hiringStaff === true,
      staffTypes: safeParse(staffTypes),
      supplierNeeds: supplierNeeds === 'true' || supplierNeeds === true,
      inventoryPlans: inventoryPlans,
      productCategories: safeParse(productCategories),
      businessDescription: businessDescription || `Expansion request for ${store.name}`,
      contactInfo: store.contactInfo,
    };

    // Handle uploaded permits/docs for expansion
    if (req.files) {
      if (req.files.licenseDocument) {
        applicationData.businessLicense = { documentUrl: req.files.licenseDocument[0].path || req.files.licenseDocument[0].secure_url };
      }
      if (req.files.mayorsPermit) {
        applicationData.mayorsPermitUrl = req.files.mayorsPermit[0].path || req.files.mayorsPermit[0].secure_url;
      }
      if (req.files.businessRegistration) {
        applicationData.businessRegistrationUrl = req.files.businessRegistration[0].path || req.files.businessRegistration[0].secure_url;
      }
    }

    const application = new StoreApplication(applicationData);
    await application.save();

    // Mark store as expansion pending
    store.expansionStatus = 'pending';
    await store.save();

    res.status(201).json({
      message: 'Expansion request submitted successfully',
      application
    });

    // Notify Super Admin
    try {
      const superAdmin = await User.findOne({ role: { $in: ['super_admin', 'platform_admin'] } });
      if (superAdmin) {
        await createNotification({
          recipient: superAdmin._id,
          sender: req.user.id,
          type: 'store_application', // Or 'expansion_request'
          title: 'Business Expansion Protocol Initiated',
          message: `${store.name} has submitted a request to expand their modular operations to include ${safeParse(operationalModules).join(', ')}.`,
          relatedId: application._id,
          relatedModel: 'StoreApplication'
        });
      }
    } catch (notifErr) {
      console.error('Failed to notify admin of expansion:', notifErr);
    }
  } catch (error) {
    console.error('Expansion request error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get all applications (Super Admin only)
const getAllApplications = async (req, res) => {
  try {
    const { status, taxVerificationStatus, declaredTaxStatus, verifiedTaxStatus, businessType, city, search, page = 1, limit = 50 } = req.query;
    console.log('🔍 FETCHING APPLICATIONS. Filters:', { status, page, limit });
    
    // Use $ne: true to catch records where the field is missing entirely
    const filter = { isDeleted: { $ne: true } };
    
    if (status && status !== 'all') {
      if (status === 'under_review' || status === 'pending') {
        filter.status = { $in: ['pending', 'under_review', 'under review', 'submitted'] };
      } else if (status === 'archived') {
        filter.isDeleted = true;
      } else {
        filter.status = status;
      }
    }
    if (businessType) filter.legalStructure = businessType;
    if (city) filter['contactInfo.address.city'] = new RegExp(String(city).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (search) {
      const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { businessName: new RegExp(escaped, 'i') },
        { registeredBusinessName: new RegExp(escaped, 'i') },
        { 'businessRegistration.certificateNumber': new RegExp(escaped, 'i') }
      ];
    }
    await applyAuthoritativeTaxFilters(filter, { taxVerificationStatus, declaredTaxStatus, verifiedTaxStatus });

    const skip = (page - 1) * limit;
    const applications = await StoreApplication.find(filter)
      .populate('applicant', 'username firstName lastName email')
      .populate('reviewedBy', 'username firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await StoreApplication.countDocuments(filter);
    const applicationsWithStores = await attachStoreSummaries(applications);
    console.log(`✅ FOUND ${applications.length} applications (Total Filtered: ${total})`);

    res.json({
      applications: applicationsWithStores,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalApplications: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get application by ID
const getApplicationById = async (req, res) => {
  try {
    const application = await applicationQueryWithPrivateFields(StoreApplication.findById(req.params.id))
      .populate('applicant', 'username firstName lastName email phone address')
      .populate('reviewedBy', 'username firstName lastName')
      .populate('taxProfile.verifiedBy', 'username firstName lastName');

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    const [applicationWithStore] = await attachStoreSummaries(application, { includeDocuments: true });
    res.json({ application: applicationWithStore });
  } catch (error) {
    console.error('Get application error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Review and approve/reject application
const reviewApplication = async (req, res) => {
  try {
    const { status, reviewNotes, rejectionReason, requiredCorrections } = req.body;

    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }

    const application = await applicationQueryWithPrivateFields(StoreApplication.findById(req.params.id));

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    if (application.status === 'approved') {
      return res.status(400).json({ message: 'Application already approved' });
    }

    application.status = status;
    application.reviewNotes = reviewNotes || '';
    application.requiredCorrections = requiredCorrections || [];
    application.reviewedBy = req.user.id;
    application.reviewedAt = new Date();
    application.reviewHistory.push({
      action: status === 'requires_more_info' ? 'needs_correction' : status,
      actor: req.user.id,
      notes: reviewNotes || rejectionReason || '',
      sections: requiredCorrections || []
    });

    if (status === 'rejected') {
      application.rejectionReason = rejectionReason || '';
    } else if (status === 'approved') {
      const applicant = await User.findOne({
        _id: application.applicant,
        isActive: { $ne: false },
        isDeleted: { $ne: true }
      });

      if (!applicant) {
        return res.status(409).json({
          message: 'This application cannot be approved because its applicant account is missing, archived, or inactive.'
        });
      }

      if (application.applicationType === 'expansion') {
        // Handle Expansion Approval
        const store = await Store.findOne({ owner: application.applicant });
        if (store) {
          store.operationalModules = application.operationalModules;
          store.staffingConfiguration = application.staffingConfiguration;
          store.staffTypes = application.staffTypes;
          store.supplierNeeds = application.supplierNeeds;
          store.expansionStatus = 'none';
          await store.save();
        }
      } else {
        // Create initial store account
        const store = new Store({
          owner: application.applicant,
          name: application.businessName,
          description: application.businessDescription || 'A new store on Pawzzle.',
          logo: application.storeLogoUrl,
          businessType: application.businessType,
          operationalModules: application.operationalModules || [],
          staffingConfiguration: application.staffingConfiguration,
          staffTypes: application.staffTypes || [],
          legalStructure: application.legalStructure,
          yearsInBusiness: application.yearsInBusiness,
          numberOfEmployees: application.numberOfEmployees,
          hasPhysicalStore: application.hasPhysicalStore,
          slug: application.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + Date.now(),
          contactInfo: {
            phone: application.contactInfo.phone,
            email: application.contactInfo.email,
            address: {
              unitBuilding: application.contactInfo.address.unitBuilding,
              street: application.contactInfo.address.street || 'N/A',
              barangay: application.contactInfo.address.barangay || 'N/A',
              city: application.contactInfo.address.city || 'N/A',
              state: application.contactInfo.address.province || application.contactInfo.address.state || 'N/A',
              zipCode: application.contactInfo.address.zipCode || '4102',
              country: application.contactInfo.address.country || 'PH',
              landmark: application.contactInfo.address.landmark,
              coordinates: application.contactInfo.address.coordinates
            }
          },
          verificationStatus: 'verified',
          businessProfile: {
            registeredBusinessName: application.registeredBusinessName || application.businessRegistration?.registeredName || application.businessName,
            tradeName: application.tradeName || application.businessName,
            legalStructure: application.legalStructure,
            natureOfBusiness: application.natureOfBusiness,
            registrationAuthority: application.businessRegistration?.authority,
            registrationNumber: application.businessRegistration?.certificateNumber,
            registrationDate: application.businessRegistration?.registrationDate,
            registrationExpirationDate: application.businessRegistration?.expirationDate,
            registeredAddress: application.contactInfo?.address,
            registrationVerified: true,
            sourceApplication: application._id
          },
          businessCompliance: {
            status: application.taxProfile?.verificationStatus === 'verified' ? 'verified' : 'unverified',
            representative: application.representative || {},
            lastSubmittedAt: application.submittedAt || application.createdAt,
            lastReviewedAt: new Date(),
            lastVerifiedAt: application.taxProfile?.verificationStatus === 'verified' ? (application.taxProfile?.verifiedAt || new Date()) : undefined,
            documents: [
              application.businessRegistration?.documentUrl ? {
                requirementKey: 'business_registration', label: 'Business Registration', requiredForOperation: true, taxAffecting: false, currentVersion: 1,
                versions: [{ version: 1, documentUrl: application.businessRegistration.documentUrl, issueDate: application.businessRegistration.registrationDate, hasExpiration: Boolean(application.businessRegistration.expirationDate), expirationDate: application.businessRegistration.expirationDate, verificationStatus: 'verified', submittedAt: application.submittedAt || application.createdAt, submittedBy: application.applicant, verifiedAt: new Date(), verifiedBy: req.user.id, sourceApplication: application._id }]
              } : null,
              application.taxProfile?.corDocumentUrl && application.taxProfile?.verificationStatus === 'verified' ? {
                requirementKey: 'bir_certificate', label: 'BIR Certificate of Registration (Form 2303)', requiredForOperation: true, taxAffecting: true, currentVersion: 1,
                versions: [{ version: 1, documentUrl: application.taxProfile.corDocumentUrl, hasExpiration: false, verificationStatus: 'verified', submittedAt: application.taxProfile.submittedAt || application.createdAt, submittedBy: application.applicant, verifiedAt: application.taxProfile.verifiedAt || new Date(), verifiedBy: application.taxProfile.verifiedBy || req.user.id, sourceApplication: application._id }]
              } : null,
              application.representative?.authorityDocumentUrl ? {
                requirementKey: 'authority_document', label: 'Proof of Authority', requiredForOperation: true, taxAffecting: false, currentVersion: 1,
                versions: [{ version: 1, documentUrl: application.representative.authorityDocumentUrl, hasExpiration: false, verificationStatus: 'verified', submittedAt: application.submittedAt || application.createdAt, submittedBy: application.applicant, verifiedAt: new Date(), verifiedBy: req.user.id, sourceApplication: application._id }]
              } : null
            ].filter(Boolean),
            restrictionReasons: [], reminderLog: [], auditTrail: [{ event: 'initial_application_approved', actor: req.user.id, at: new Date(), reason: 'Seeded from the approved original Store Application.' }]
          },
          taxProfile: {
            birRegistered: application.taxProfile?.birRegistrationStatus === 'registered',
            declaredTaxStatus: application.taxProfile?.declaredTaxStatus || null,
            verifiedTaxStatus: application.taxProfile?.verifiedTaxStatus || null,
            verificationStatus: application.taxProfile?.verificationStatus || 'unverified',
            tin: application.taxProfile?.tin,
            branchCode: application.taxProfile?.branchCode,
            registeredName: application.taxProfile?.registeredName,
            registeredAddress: application.taxProfile?.registeredAddress,
            lineOfBusiness: application.taxProfile?.lineOfBusiness,
            corDocumentUrl: application.taxProfile?.corDocumentUrl,
            sourceApplication: application._id,
            submittedAt: application.taxProfile?.submittedAt,
            verifiedAt: application.taxProfile?.verifiedAt,
            verifiedBy: application.taxProfile?.verifiedBy,
            verificationNotes: application.taxProfile?.verificationNotes
          },
          taxConfiguration: application.taxProfile?.verificationStatus === 'verified' ? {
            isConfigured: true,
            taxStatus: application.taxProfile.verifiedTaxStatus === 'vat_registered' ? 'vat_registered' : 'non_vat',
            pricingMode: 'inclusive',
            vatRatePercent: application.taxProfile.verifiedTaxStatus === 'vat_registered' ? 12 : 0,
            deliveryFeeTaxable: false,
            configuredAt: application.taxProfile.verifiedAt,
            configuredBy: application.taxProfile.verifiedBy
          } : {
            isConfigured: false,
            taxStatus: 'non_vat',
            pricingMode: 'inclusive',
            vatRatePercent: 0,
            deliveryFeeTaxable: false,
            configuredAt: null
          },
          socialMedia: application.socialMedia,
          payoutMethods: [
            {
              type: 'bank_transfer',
              accountName: application.paymentInfo?.bankAccountName || '',
              accountNumber: application.paymentInfo?.bankAccountNumber || '',
              bankName: application.paymentInfo?.bankName || '',
              isDefault: true
            },
            ...(application.paymentInfo?.alternativePaymentMethod?.accountNumber ? [{
              type: application.paymentInfo.alternativePaymentMethod.provider?.toLowerCase() === 'gcash' ? 'gcash' : 'maya',
              accountName: application.paymentInfo.bankAccountName || '',
              accountNumber: application.paymentInfo.alternativePaymentMethod.accountNumber,
              isDefault: false
            }] : [])
          ]
        });

        const existingStore = await Store.findOne({ owner: applicant._id, isDeleted: { $ne: true } });
        if (existingStore) {
          return res.status(409).json({ message: 'This applicant already owns a store. Review the existing store instead.' });
        }

        const savedStore = await store.save();
        application.approvedStore = savedStore._id;

        // Update user role and link store
        await User.findByIdAndUpdate(applicant._id, {
          role: 'admin',
          store: savedStore._id
        });
      }
    }

    await application.save();

    res.json({
      message: `Application ${status} successfully`,
      application
    });

    // Notify applicant
    await createNotification({
      recipient: application.applicant,
      sender: req.user.id,
      type: 'store_application',
      title: `Store Application ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      message: status === 'approved'
        ? 'Congratulations! Your store application has been approved. You can now access the admin panel.'
        : `Your application has been ${status}. Reason: ${rejectionReason || 'No specific reason provided.'}`,
      relatedId: application._id,
      relatedModel: 'StoreApplication'
    });
  } catch (error) {
    console.error('Review application error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Platform Admin explicitly verifies the tax declaration independently from
// store approval. This is the only path that makes tax settings authoritative.
const verifyTaxProfile = async (req, res) => {
  try {
    const { decision, notes = '', rejectionReason = '', acknowledgeMismatch = false } = req.body;
    if (!['vat_registered', 'non_vat_registered', 'rejected'].includes(decision)) {
      return res.status(400).json({ message: 'Choose VAT, Non-VAT, or reject the tax information.' });
    }

    const application = await applicationQueryWithPrivateFields(StoreApplication.findById(req.params.id));
    if (!application || application.isDeleted) return res.status(404).json({ message: 'Application not found.' });
    if (application.applicationType !== 'new_store') return res.status(400).json({ message: 'Tax verification applies to the original store application.' });

    const tax = application.taxProfile || {};
    if (decision !== 'rejected') {
      if (tax.birRegistrationStatus !== 'registered' || !tax.tin || !tax.branchCode || !tax.corDocumentUrl) {
        return res.status(400).json({ message: 'Complete BIR details and Form 2303 are required before tax verification.' });
      }
      if (tax.declaredTaxStatus !== decision && (acknowledgeMismatch !== true || !String(notes).trim())) {
        return res.status(400).json({
          message: 'The verified status differs from the applicant declaration. Acknowledge the mismatch and add review notes.'
        });
      }
    } else if (!String(rejectionReason).trim()) {
      return res.status(400).json({ message: 'A rejection or correction reason is required.' });
    }

    const now = new Date();
    tax.verificationStatus = decision === 'rejected' ? 'rejected' : 'verified';
    tax.verifiedTaxStatus = decision === 'rejected' ? null : decision;
    tax.verifiedAt = now;
    tax.verifiedBy = req.user.id;
    tax.verificationNotes = String(notes).trim();
    tax.rejectionReason = decision === 'rejected' ? String(rejectionReason).trim() : '';
    application.markModified('taxProfile');
    application.reviewHistory.push({
      action: decision === 'rejected' ? 'tax_rejected' : 'tax_verified',
      actor: req.user.id,
      notes: decision === 'rejected' ? tax.rejectionReason : tax.verificationNotes,
      sections: ['taxProfile']
    });
    if (decision === 'rejected' && application.status !== 'approved') {
      application.status = 'requires_more_info';
      application.requiredCorrections = Array.from(new Set([...(application.requiredCorrections || []), 'taxProfile']));
    }
    await application.save();

    const storeCandidates = [{ owner: application.applicant, isDeleted: { $ne: true } }];
    if (application.approvedStore) storeCandidates.unshift({ _id: application.approvedStore });
    const store = await Store.findOne({ $or: storeCandidates })
      .select('+taxProfile.tin +taxProfile.branchCode +taxProfile.corDocumentUrl +taxProfile.verifiedBy +taxProfile.rejectionReason +taxProfile.verificationNotes +taxConfiguration.auditLog');

    if (store) {
      const previous = store.taxConfiguration?.toObject ? store.taxConfiguration.toObject() : { ...(store.taxConfiguration || {}) };
      store.taxProfile = {
        birRegistered: tax.birRegistrationStatus === 'registered',
        declaredTaxStatus: tax.declaredTaxStatus || null,
        verifiedTaxStatus: tax.verifiedTaxStatus || null,
        verificationStatus: tax.verificationStatus,
        tin: tax.tin,
        branchCode: tax.branchCode,
        registeredName: tax.registeredName,
        registeredAddress: tax.registeredAddress,
        lineOfBusiness: tax.lineOfBusiness,
        corDocumentUrl: tax.corDocumentUrl,
        sourceApplication: application._id,
        submittedAt: tax.submittedAt,
        verifiedAt: now,
        verifiedBy: req.user.id,
        rejectionReason: tax.rejectionReason,
        verificationNotes: tax.verificationNotes
      };
      const next = decision === 'rejected' ? {
        isConfigured: false,
        taxStatus: 'non_vat',
        pricingMode: 'inclusive',
        vatRatePercent: 0,
        deliveryFeeTaxable: false,
        configuredAt: null,
        configuredBy: req.user.id
      } : {
        isConfigured: true,
        taxStatus: decision === 'vat_registered' ? 'vat_registered' : 'non_vat',
        pricingMode: 'inclusive',
        vatRatePercent: decision === 'vat_registered' ? 12 : 0,
        deliveryFeeTaxable: false,
        configuredAt: now,
        configuredBy: req.user.id
      };
      const auditLog = store.taxConfiguration?.auditLog || [];
      auditLog.push({ changedBy: req.user.id, changedAt: now, previous, next });
      store.taxConfiguration = { ...next, auditLog: auditLog.slice(-50) };
      if (decision !== 'rejected' && tax.corDocumentUrl) {
        store.businessCompliance = store.businessCompliance || {};
        if (!Array.isArray(store.businessCompliance.documents)) store.businessCompliance.documents = [];
        let cor = store.businessCompliance.documents.find(document => document.requirementKey === 'bir_certificate');
        if (!cor) {
          store.businessCompliance.documents.push({ requirementKey: 'bir_certificate', label: 'BIR Certificate of Registration (Form 2303)', requiredForOperation: true, taxAffecting: true, currentVersion: 1, versions: [] });
          cor = store.businessCompliance.documents[store.businessCompliance.documents.length - 1];
        }
        const alreadyCurrent = (cor.versions || []).some(version => Number(version.version) === Number(cor.currentVersion) && version.verificationStatus === 'verified');
        if (!alreadyCurrent) {
          const version = Number(cor.currentVersion || 0) + 1;
          cor.currentVersion = version;
          cor.versions.push({ version, documentUrl: tax.corDocumentUrl, hasExpiration: false, verificationStatus: 'verified', submittedAt: tax.submittedAt || application.createdAt, submittedBy: application.applicant, verifiedAt: now, verifiedBy: req.user.id, sourceApplication: application._id });
        }
        store.businessCompliance.status = 'verified';
        store.businessCompliance.lastVerifiedAt = now;
        store.businessCompliance.auditTrail.push({ event: 'initial_tax_verified', actor: req.user.id, at: now, reason: tax.verificationNotes || 'Tax profile verified from the original Store Application.' });
        store.markModified('businessCompliance');
      }
      await store.save();
    }

    await createNotification({
      recipient: application.applicant,
      sender: req.user.id,
      type: 'store_application',
      title: decision === 'rejected' ? 'Tax Information Needs Correction' : 'Tax Information Verified',
      message: decision === 'rejected'
        ? tax.rejectionReason
        : `Your store tax profile was verified as ${decision === 'vat_registered' ? 'VAT Registered' : 'Non-VAT Registered'}.`,
      relatedId: application._id,
      relatedModel: 'StoreApplication'
    });

    res.json({
      message: decision === 'rejected' ? 'Tax information returned for correction.' : 'Tax information verified.',
      taxProfile: {
        declaredTaxStatus: tax.declaredTaxStatus,
        verifiedTaxStatus: tax.verifiedTaxStatus,
        verificationStatus: tax.verificationStatus,
        verifiedAt: tax.verifiedAt,
        tinMasked: maskTin(tax.tin)
      }
    });
  } catch (error) {
    console.error('Tax verification error:', error);
    res.status(500).json({ message: 'Unable to update tax verification.' });
  }
};

const getApplicationDocument = async (req, res) => {
  try {
    const application = await applicationQueryWithPrivateFields(StoreApplication.findById(req.params.id));
    if (!application || application.isDeleted) return res.status(404).json({ message: 'Application not found.' });
    const ownsApplication = String(application.applicant) === String(req.user._id || req.user.id);
    if (!ownsApplication && !isPlatformAdmin(req.user)) return res.status(403).json({ message: 'You cannot access this application document.' });

    const documents = {
      governmentId: application.governmentIdUrl,
      businessRegistration: application.businessRegistration?.documentUrl || application.businessRegistrationUrl,
      birCertificate: application.taxProfile?.corDocumentUrl || application.birRegistrationUrl,
      authorityDocument: application.representative?.authorityDocumentUrl,
      mayorsPermit: application.mayorsPermitUrl,
      barangayClearance: application.barangayClearanceUrl
    };
    const documentUrl = documents[req.params.documentType];
    if (!documentUrl) return res.status(404).json({ message: 'Document not found.' });
    res.json({ documentUrl });
  } catch (error) {
    res.status(500).json({ message: 'Unable to open the application document.' });
  }
};

// Get user's application status
const getUserApplication = async (req, res) => {
  try {
    const application = await applicationQueryWithPrivateFields(StoreApplication.findOne({ applicant: req.user.id }))
      .sort({ createdAt: -1 })
      .populate('reviewedBy', 'username firstName lastName');

    if (!application) {
      return res.json({ application: null });
    }

    res.json({ application: toApplicationResponse(application, { includeDocuments: true }) });
  } catch (error) {
    console.error('Get user application error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Request additional information
const requestMoreInfo = async (req, res) => {
  try {
    const { requiredInfo, message } = req.body;
    const application = await StoreApplication.findById(req.params.id);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    application.status = 'requires_more_info';
    application.reviewNotes = message;
    application.requiredInfo = requiredInfo;
    application.reviewedBy = req.user.id;
    application.reviewedAt = new Date();
    application.reviewHistory.push({
      action: 'needs_correction',
      actor: req.user.id,
      notes: message,
      sections: requiredInfo || []
    });

    await application.save();

    res.json({
      message: 'Additional information requested',
      application
    });

    // Notify applicant
    await createNotification({
      recipient: application.applicant,
      sender: req.user.id,
      type: 'store_application',
      title: 'Information Requested',
      message: `We need more information for your store application: ${message}`,
      relatedId: application._id,
      relatedModel: 'StoreApplication'
    });
  } catch (error) {
    console.error('Request more info error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Archive application (Soft Delete)
const archiveApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const application = await StoreApplication.findById(id);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    application.isDeleted = true;
    application.deletedAt = new Date();
    await application.save();

    res.json({ 
      success: true, 
      message: 'Application moved to archive successfully',
      id: application._id
    });
  } catch (error) {
    console.error('Archive application error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Restore application from archive
const restoreApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const application = await StoreApplication.findById(id);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    application.isDeleted = false;
    application.deletedAt = null;
    await application.save();

    res.json({ 
      success: true, 
      message: 'Application restored from archive successfully',
      id: application._id
    });
  } catch (error) {
    console.error('Restore application error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Audit count for debugging
const getAuditCount = async (req, res) => {
  try {
    const total = await StoreApplication.countDocuments({ isDeleted: { $ne: true } });
    const deleted = await StoreApplication.countDocuments({ isDeleted: true });
    const statusCounts = await StoreApplication.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
    res.json({ total_records: total, deleted_records: deleted, status_breakdown: statusCounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  submitApplication,
  getAllApplications,
  getApplicationById,
  reviewApplication,
  getUserApplication,
  requestMoreInfo,
  archiveApplication,
  restoreApplication,
  getAuditCount,
  verifyTaxProfile,
  getApplicationDocument,
  applicationValidationErrors,
  maskTin,
  toApplicationResponse,
  submitExpansionRequest,
  resolveAuthoritativeTaxProfile,
  applyAuthoritativeTaxFilters,
  upload
};
