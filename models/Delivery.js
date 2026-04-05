const mongoose = require('mongoose');
const crypto = require('crypto');

const deliverySchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },
  riderToken: {
    type: String,
    unique: true,
    required: true,
    default: () => crypto.randomBytes(32).toString('hex')
  },
  trackingToken: {
    type: String,
    unique: true,
    required: true,
    default: () => crypto.randomBytes(32).toString('hex')
  },
  status: {
    type: String,
    enum: ['pending', 'picked_up', 'in_transit', 'delivered'],
    default: 'pending'
  },
  riderName: {
    type: String,
    trim: true
  },
  riderPhone: {
    type: String,
    trim: true
  },
  riderLocation: {
    lat: { type: Number },
    lng: { type: Number },
    heading: { type: Number },
    speed: { type: Number },
    lastUpdated: { type: Date }
  },
  locationHistory: [{
    lat: { type: Number },
    lng: { type: Number },
    timestamp: { type: Date, default: Date.now }
  }],
  chat: [{
    sender: { type: String, enum: ['customer', 'rider', 'system'] },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
  }],
  estimatedDelivery: {
    type: Date
  },
  pickedUpAt: {
    type: Date
  },
  deliveredAt: {
    type: Date
  },
  isLive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Middleware to disable link after delivery
deliverySchema.pre('save', function(next) {
  if (this.status === 'delivered') {
    this.isLive = false;
    if (!this.deliveredAt) this.deliveredAt = new Date();
  }
  next();
});

module.exports = mongoose.model('Delivery', deliverySchema);
