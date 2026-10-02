const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const path = require('path');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// File filter for images
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
  }
};

// Cloudinary storage for single images
const singleStorage = new CloudinaryStorage({
  cloudinary,
  params: (req) => ({
    folder: 'pawzzle',
    allowed_formats: ['jpeg', 'jpg', 'png', 'gif', 'webp'],
    transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    context: { owner: String(req.user?._id || '') }
  })
});

// Cloudinary storage for multiple images
const multipleStorage = new CloudinaryStorage({
  cloudinary,
  params: (req) => ({
    folder: 'pawzzle',
    allowed_formats: ['jpeg', 'jpg', 'png', 'gif', 'webp'],
    transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    context: { owner: String(req.user?._id || '') }
  })
});

// Procurement receiving evidence is intentionally isolated from Pawzzle's
// public image uploads. Cloudinary's authenticated delivery type prevents the
// asset URL returned at upload time from being used as a public delivery URL.
const procurementEvidenceStorage = new CloudinaryStorage({
  cloudinary,
  params: (req) => ({
    folder: 'pawzzle/procurement-evidence',
    type: 'authenticated',
    resource_type: 'image',
    allowed_formats: ['jpeg', 'jpg', 'png', 'gif', 'webp'],
    context: {
      owner: String(req.user?._id || ''),
      purchaseOrder: String(req.receivingInspectionOrderId || '')
    }
  })
});

// multer-storage-cloudinary removes files using the default `upload` type.
// Override cleanup for this isolated authenticated storage so failed multipart
// requests do not leave an authenticated asset behind.
procurementEvidenceStorage._removeFile = (req, file, callback) => {
  cloudinary.uploader.destroy(file.filename, {
    resource_type: 'image',
    type: 'authenticated',
    invalidate: true
  }, callback);
};

// Configure multer upload (single)
const upload = multer({
  storage: singleStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter
});

// Configure multer upload (multiple)
const uploadMulti = multer({
  storage: multipleStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter
});

const procurementEvidenceUpload = multer({
  storage: procurementEvidenceStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter
});

// Cloudinary storage for documents (PDF, Doc)
const documentStorage = new CloudinaryStorage({
  cloudinary,
  params: (req) => ({
    folder: 'pawzzle/documents',
    resource_type: 'auto', // Support PDF, DOCX, etc.
    allowed_formats: ['jpeg', 'jpg', 'png', 'pdf', 'doc', 'docx'],
    context: { owner: String(req.user?._id || '') }
  })
});

// Configure multer for documents
const uploadDoc = multer({
  storage: documentStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype || extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images, PDFs, and Word documents are allowed'));
    }
  }
});

// Middleware exports
const uploadSingle = upload.single('image');
const uploadMultiple = uploadMulti.array('images', 10);
const uploadProcurementEvidence = procurementEvidenceUpload.array('images', 10);
const uploadServicePhotos = uploadMulti.fields([
  { name: 'images', maxCount: 5 },
  { name: 'image', maxCount: 1 }
]);

// Handle upload errors
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File too large. Please upload a smaller file.' });
    }
    return res.status(400).json({ message: err.message });
  } else if (err) {
    return res.status(500).json({ message: err.message });
  }
  next();
};

module.exports = {
  cloudinary,
  uploadSingle,
  uploadMultiple,
  uploadProcurementEvidence,
  uploadServicePhotos,
  uploadDoc,
  handleUploadError
};
