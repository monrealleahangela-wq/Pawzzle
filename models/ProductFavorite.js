const mongoose = require('mongoose');

const productFavoriteSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure a user can favorite a product only once
productFavoriteSchema.index({ user: 1, product: 1 }, { unique: true });

module.exports = mongoose.model('ProductFavorite', productFavoriteSchema);
