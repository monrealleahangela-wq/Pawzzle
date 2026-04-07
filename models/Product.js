const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  shortDescription: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0.01
  },
  stockQuantity: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  stockStatus: {
    type: String,
    enum: ['in_stock', 'out_of_stock'],
    default: 'in_stock'
  },
  lowStockThreshold: {
    type: Number,
    default: 5
  },
  maxOrderQuantity: {
    type: Number
  },
  sku: {
    type: String,
    trim: true,
    unique: true,
    required: true
  },
  images: [{
    type: String,
    required: true
  }],
  coverImage: {
    type: String
  },
  video: {
    type: String
  },
  brand: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  collectionGroup: {
    type: String,
    trim: true
  },
  visibility: {
    type: String,
    enum: ['published', 'draft', 'hidden'],
    default: 'published'
  },
  fulfillmentType: {
    type: String,
    enum: ['pickup_only'],
    default: 'pickup_only'
  },
  pickupInstructions: {
    type: String,
    trim: true
  },
  // Additional Details
  warrantyInfo: String,
  returnPolicy: String,
  expiryDate: Date,
  ingredients: String,
  usageInstructions: String,
  // Variants
  variants: [{
    combination: String, // e.g., "Red - Large"
    price: Number,
    stock: Number,
    sku: String,
    type: {
      type: String,
      enum: ['Size', 'Color', 'Weight', 'Volume', 'Other']
    }
  }],
  suitableFor: [{
    type: String,
    enum: ['dog', 'cat', 'bird', 'fish', 'rabbit', 'hamster', 'reptile', 'all']
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store'
  },
  ratings: {
    average: {
      type: Number,
      default: 0
    },
    count: {
      type: Number,
      default: 0
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
});

productSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Product', productSchema);
