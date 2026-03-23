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
  params: {
    folder: 'pawzzle',
    allowed_formats: ['jpeg', 'jpg', 'png', 'gif', 'webp'],
    transformation: [{ quality: 'auto', fetch_format: 'auto' }]
  }
});

// Cloudinary storage for multiple images
const multipleStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'pawzzle',
    allowed_formats: ['jpeg', 'jpg', 'png', 'gif', 'webp'],
    transformation: [{ quality: 'auto', fetch_format: 'auto' }]
  }
});

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

// Cloudinary storage for documents (PDF, Doc)
const documentStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'pawzzle/documents',
    resource_type: 'auto', // Support PDF, DOCX, etc.
    allowed_formats: ['jpeg', 'jpg', 'png', 'pdf', 'doc', 'docx']
  }
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

// Handle upload errors
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File too large. Maximum size is 5MB.' });
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
  uploadDoc,
  handleUploadError
};
