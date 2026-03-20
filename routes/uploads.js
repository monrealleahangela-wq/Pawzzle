const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { uploadSingle, uploadMultiple, handleUploadError } = require('../middleware/upload');
const { uploadImage, uploadMultipleImages, deleteImage } = require('../controllers/uploadController');

// Single image upload
router.post('/single', authenticate, uploadSingle, handleUploadError, uploadImage);

// Multiple images upload
router.post('/multiple', authenticate, uploadMultiple, handleUploadError, uploadMultipleImages);

// Delete image
router.delete('/:filename', authenticate, deleteImage);

module.exports = router;
