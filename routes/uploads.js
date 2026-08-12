const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { uploadSingle, uploadMultiple, uploadDoc, handleUploadError } = require('../middleware/upload');
const { uploadImage, uploadMultipleImages, uploadDocument, deleteImage } = require('../controllers/uploadController');

// Single image upload
router.post('/single', authenticate, uploadSingle, handleUploadError, uploadImage);

// Multiple images upload
router.post('/multiple', authenticate, uploadMultiple, handleUploadError, uploadMultipleImages);

// Registration certificates and other supported pet documents
router.post('/document', authenticate, uploadDoc.single('document'), handleUploadError, uploadDocument);

// Delete image
router.delete('/:filename', authenticate, deleteImage);

module.exports = router;
