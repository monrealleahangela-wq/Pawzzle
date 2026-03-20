const path = require('path');
const fs = require('fs');

// Upload single image
const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    // Generate URL for the uploaded image
    const imageUrl = `/uploads/images/${req.file.filename}`;

    res.json({
      message: 'Image uploaded successfully',
      url: imageUrl,
      imageUrl: imageUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size
    });
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ message: 'Failed to upload image' });
  }
};

// Upload multiple images
const uploadMultipleImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No image files provided' });
    }

    // Generate URLs for all uploaded images
    const imageUrls = req.files.map(file => `/uploads/images/${file.filename}`);

    res.json({
      message: 'Images uploaded successfully',
      urls: imageUrls,
      imageUrls: imageUrls,
      files: req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        size: file.size
      }))
    });
  } catch (error) {
    console.error('Multiple image upload error:', error);
    res.status(500).json({ message: 'Failed to upload images' });
  }
};

// Delete image
const deleteImage = async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '..', 'uploads', 'images', filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Image not found' });
    }

    // Delete file
    fs.unlinkSync(filePath);

    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Image delete error:', error);
    res.status(500).json({ message: 'Failed to delete image' });
  }
};

module.exports = {
  uploadImage,
  uploadMultipleImages,
  deleteImage
};
