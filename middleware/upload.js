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

// Attendance evidence contains employee information and is never stored as a
// public Cloudinary asset. Access is granted later through short-lived signed
// URLs after a fresh authorization check.
const attendanceEvidenceStorage = new CloudinaryStorage({
  cloudinary,
  params: (req) => ({
    folder: 'pawzzle/attendance-evidence',
    type: 'authenticated',
    resource_type: 'image',
    allowed_formats: ['jpeg', 'jpg', 'png', 'webp'],
    context: { owner: String(req.user?._id || '') }
  })
});

// Return cases may contain condition photos or short videos. They are private
// authenticated assets; callers receive short-lived links only after an
// authorization check against the case.
const returnEvidenceStorage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => ({
    folder: 'pawzzle/order-return-evidence',
    type: 'authenticated',
    resource_type: String(file.mimetype || '').startsWith('video/') ? 'video' : 'image',
    allowed_formats: ['jpeg', 'jpg', 'png', 'webp', 'mp4', 'mov', 'webm'],
    context: { owner: String(req.user?._id || '') }
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

attendanceEvidenceStorage._removeFile = procurementEvidenceStorage._removeFile;
returnEvidenceStorage._removeFile = (req, file, callback) => {
  cloudinary.uploader.destroy(file.filename, {
    resource_type: String(file.mimetype || '').startsWith('video/') ? 'video' : 'image',
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

const liveCameraProofUpload = multer({
  storage: singleStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const isJpeg = String(file.mimetype || '').toLowerCase() === 'image/jpeg';
    const hasCaptureName = /^delivery-live-proof-\d+\.jpg$/i.test(String(file.originalname || ''));
    if (!isJpeg || !hasCaptureName) {
      const error = new Error('Delivery confirmation requires a new live-camera JPEG capture.');
      error.statusCode = 400;
      return cb(error);
    }
    return cb(null, true);
  }
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

const attendanceEvidenceUpload = multer({
  storage: attendanceEvidenceStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
    const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(String(file.mimetype || '').toLowerCase())) {
      const error = new Error('Evidence must be a JPG, PNG, or WEBP image.');
      error.statusCode = 400;
      return cb(error);
    }
    return cb(null, true);
  }
});

// Registration identity images remain in memory. The ID is encrypted before
// persistence and the live selfie is discarded after the stateless face match.
const registrationIdentityUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) => {
    const mimeType = String(file.mimetype || '').toLowerCase();
    const extension = path.extname(file.originalname || '').toLowerCase();
    const validField = ['governmentIdImage', 'selfieImage'].includes(file.fieldname);
    const validImage = ['image/jpeg', 'image/png'].includes(mimeType) && ['.jpg', '.jpeg', '.png'].includes(extension);
    const validSelfie = file.fieldname !== 'selfieImage'
      || (mimeType === 'image/jpeg' && /^identity-live-selfie-\d+\.jpg$/i.test(String(file.originalname || '')));
    if (!validField || !validImage || !validSelfie) {
      const error = new Error(file.fieldname === 'selfieImage'
        ? 'Identity verification requires a new live-camera JPEG selfie.'
        : 'Government ID must be a JPG or PNG image.');
      error.statusCode = 400;
      return cb(error);
    }
    return cb(null, true);
  }
});

// Store-document OCR is stateless: the image is held only long enough to send
// it to Textract and the controller clears the buffer before returning.
const storeDocumentOcrUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const mimeType = String(file.mimetype || '').toLowerCase();
    const extension = path.extname(file.originalname || '').toLowerCase();
    const validImage = ['image/jpeg', 'image/png'].includes(mimeType)
      && ['.jpg', '.jpeg', '.png'].includes(extension);
    if (!validImage || file.fieldname !== 'document') {
      const error = new Error('OCR requires a JPG or PNG document image.');
      error.statusCode = 400;
      return cb(error);
    }
    return cb(null, true);
  }
});

const returnEvidenceUpload = multer({
  storage: returnEvidenceStorage,
  limits: { fileSize: 25 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.webm']);
    const allowedMimeTypes = new Set([
      'image/jpeg', 'image/png', 'image/webp',
      'video/mp4', 'video/quicktime', 'video/webm'
    ]);
    if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(String(file.mimetype || '').toLowerCase())) {
      const error = new Error('Evidence must be a JPG, PNG, WEBP, MP4, MOV, or WEBM file.');
      error.statusCode = 400;
      return cb(error);
    }
    return cb(null, true);
  }
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
const uploadLiveCameraProof = liveCameraProofUpload.single('image');
const uploadMultiple = uploadMulti.array('images', 10);
const uploadProcurementEvidence = procurementEvidenceUpload.array('images', 10);
const uploadAttendanceEvidence = attendanceEvidenceUpload.single('evidence');
const uploadReturnEvidence = returnEvidenceUpload.array('evidence', 6);
const uploadRegistrationIdentity = registrationIdentityUpload.fields([
  { name: 'governmentIdImage', maxCount: 1 },
  { name: 'selfieImage', maxCount: 1 }
]);
const uploadStoreDocumentOcr = storeDocumentOcrUpload.single('document');
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
    return res.status(err.statusCode || 500).json({ message: err.message });
  }
  next();
};

module.exports = {
  cloudinary,
  uploadSingle,
  uploadLiveCameraProof,
  uploadMultiple,
  uploadProcurementEvidence,
  uploadAttendanceEvidence,
  uploadReturnEvidence,
  uploadRegistrationIdentity,
  uploadStoreDocumentOcr,
  uploadServicePhotos,
  uploadDoc,
  handleUploadError
};
