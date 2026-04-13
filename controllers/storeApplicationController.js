const { validationResult } = require('express-validator');
const StoreApplication = require('../models/StoreApplication');
const User = require('../models/User');
const Store = require('../models/Store');
const multer = require('multer');
const path = require('path');
const { createNotification } = require('./notificationController');
const { uploadDoc, cloudinary } = require('../middleware/upload');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

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

    if (mimetype || extname) {
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
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check if user already has a pending or approved application
    const existingApplication = await StoreApplication.findOne({
      applicant: req.user.id,
      status: { $in: ['under_review', 'approved'] }
    });

    if (existingApplication) {
      return res.status(400).json({
        message: 'You already have an application under review or approved'
      });
    }

    const applicationData = {
      ...req.body,
      applicant: req.user.id,
      businessLicense: safeParse(req.body.businessLicense) || {},
      contactInfo: safeParse(req.body.contactInfo),
      socialMedia: safeParse(req.body.socialMedia),
      references: safeParse(req.body.references),
      certifications: safeParse(req.body.certifications),
      insurance: safeParse(req.body.insurance),
      emergencyContact: safeParse(req.body.emergencyContact),
      yearsInBusiness: parseInt(req.body.yearsInBusiness) || 0,
      numberOfEmployees: parseInt(req.body.numberOfEmployees) || 1,
      hasPhysicalStore: req.body.hasPhysicalStore === 'true' || req.body.hasPhysicalStore === true
    };

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
        applicationData.businessRegistrationUrl = req.files.businessRegistration[0].path || req.files.businessRegistration[0].secure_url;
      }
      if (req.files.birRegistration) {
        applicationData.birRegistrationUrl = req.files.birRegistration[0].path || req.files.birRegistration[0].secure_url;
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

    applicationData.paymentInfo = safeParse(req.body.paymentInfo);
    applicationData.productsOffered = safeParse(req.body.productsOffered);

    const application = new StoreApplication(applicationData);

    // Run automatic verification to provide a score for the Super Admin
    application.autoVerify();

    // All applications now require manual review by Super Admin
    // We set status to under_review to ensure it appears in the admin dashboard
    application.status = 'under_review';
    application.reviewNotes = application.verificationScore >= 60 
      ? 'Application submitted and awaiting manual review'
      : 'Application submitted but may require additional documentation due to low verification score';

    await application.save();

    res.status(201).json({
      message: 'Application submitted successfully',
      application: {
        id: application._id,
        status: application.status,
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

// Get all applications (Super Admin only)
const getAllApplications = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const filter = { isDeleted: false };
    if (status) {
      if (status === 'under_review' || status === 'pending') {
        filter.status = { $in: ['pending', 'under_review', 'under review', 'submitted'] };
      } else if (status === 'archived') {
        filter.isDeleted = true;
      } else {
        filter.status = status;
      }
    }

    const skip = (page - 1) * limit;
    const applications = await StoreApplication.find(filter)
      .populate('applicant', 'username firstName lastName email')
      .populate('reviewedBy', 'username firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await StoreApplication.countDocuments(filter);

    res.json({
      applications,
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
    const application = await StoreApplication.findById(req.params.id)
      .populate('applicant', 'username firstName lastName email phone address')
      .populate('reviewedBy', 'username firstName lastName');

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    res.json({ application });
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

    const application = await StoreApplication.findById(req.params.id);

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

    if (status === 'rejected') {
      application.rejectionReason = rejectionReason || '';
    } else if (status === 'approved') {
      // Create store account
      const store = new Store({
        owner: application.applicant,
        name: application.businessName,
        description: application.businessDescription || 'A new store on Pawzzle.',
        logo: application.storeLogoUrl,
        businessType: application.businessType,
        legalStructure: application.legalStructure,
        yearsInBusiness: application.yearsInBusiness,
        numberOfEmployees: application.numberOfEmployees,
        hasPhysicalStore: application.hasPhysicalStore,
        slug: application.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + Date.now(),
        contactInfo: {
          phone: application.contactInfo.phone,
          email: application.contactInfo.email,
          address: {
            street: application.contactInfo.address.street || 'N/A',
            barangay: application.contactInfo.address.barangay || 'N/A',
            city: application.contactInfo.address.city || 'N/A',
            state: application.contactInfo.address.province || application.contactInfo.address.state || 'N/A',
            zipCode: application.contactInfo.address.zipCode || '4102',
            country: application.contactInfo.address.country || 'PH'
          }
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

      const savedStore = await store.save();

      // Update user role and link store
      await User.findByIdAndUpdate(application.applicant, {
        role: 'admin',
        store: savedStore._id
      });
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

// Get user's application status
const getUserApplication = async (req, res) => {
  try {
    const application = await StoreApplication.findOne({ applicant: req.user.id })
      .sort({ createdAt: -1 })
      .populate('reviewedBy', 'username firstName lastName');

    if (!application) {
      return res.json({ application: null });
    }

    res.json({ application });
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
    const total = await StoreApplication.countDocuments({});
    const deleted = await StoreApplication.countDocuments({ isDeleted: true });
    const statusCounts = await StoreApplication.aggregate([
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
  upload
};
