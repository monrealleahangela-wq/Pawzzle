const { cloudinary } = require('../middleware/upload');

// Upload single image to Cloudinary
const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    // Cloudinary returns the URL directly in req.file.path
    const imageUrl = req.file.path;

    res.json({
      message: 'Image uploaded successfully',
      url: imageUrl,
      imageUrl: imageUrl,
      publicId: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size
    });
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ message: 'Failed to upload image' });
  }
};

// Upload multiple images to Cloudinary
const uploadMultipleImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No image files provided' });
    }

    // Cloudinary returns the URL directly in each file's .path
    const imageUrls = req.files.map(file => file.path);

    res.json({
      message: 'Images uploaded successfully',
      urls: imageUrls,
      imageUrls: imageUrls,
      files: req.files.map(file => ({
        filename: file.filename,
        url: file.path,
        originalName: file.originalname,
        size: file.size
      }))
    });
  } catch (error) {
    console.error('Multiple image upload error:', error);
    res.status(500).json({ message: 'Failed to upload images' });
  }
};

// Delete image from Cloudinary by public_id
const deleteImage = async (req, res) => {
  try {
    const { filename } = req.params;

    // filename here is the Cloudinary public_id (e.g. "pawzzle/abc123")
    const result = await cloudinary.uploader.destroy(filename);

    if (result.result === 'ok') {
      res.json({ message: 'Image deleted successfully' });
    } else {
      res.status(404).json({ message: 'Image not found or already deleted' });
    }
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
