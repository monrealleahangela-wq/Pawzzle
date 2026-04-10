const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  itemType: {
    type: String,
    enum: ['pet', 'product'],
    required: true
  },
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  image: {
    type: String
  }
});

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
  items: [orderItemSchema],
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  platformFee: {
    type: Number,
    default: 0
  },
  netAmount: {
    type: Number,
    default: 0
  },
  isRevenueRecorded: {
    type: Boolean,
    default: false
  },
  voucher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Voucher'
  },
  discountAmount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'completed', 'finalized', 'cancelled'],
    default: 'pending'
  },
  deliveryMethod: {
    type: String,
    enum: ['delivery', 'pickup'],
    required: true,
    default: 'delivery'
  },
  shippingAddress: {
    street: { type: String },
    city: { type: String },
    province: { type: String },
    barangay: { type: String },
    zipCode: { type: String },
    country: { type: String },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number }
    }
  },
  phoneNumber: {
    type: String,
    required: true,
    trim: true
  },
  shippingFee: {
    type: Number,
    default: 0
  },
  paymentMethod: {
    type: String,
    enum: ['gcash', 'maya', 'bank_transfer', 'pending'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  trackingNumber: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  },
  orderDate: {
    type: Date,
    default: Date.now
  },
  deliveryDate: {
    type: Date
  },
  paymentDetails: {
    sessionId: { type: String },
    checkoutUrl: { type: String },
    paymentIntentId: { type: String }
  },
  platformCommission: {
    type: Number,
    default: 0
  },
  payoutStatus: {
    type: String,
    enum: ['pending', 'held', 'released', 'disputed', 'refunded'],
    default: 'pending'
  },
  pickupSession: {
    code: { type: String },
    verifiedAt: { type: Date },
    scheduledDate: { type: Date },
    instructions: { type: String },
    location: { type: String }
  },
  reviewStatus: {
    isRated: { type: Boolean, default: false },
    reviewId: { type: mongoose.Schema.Types.ObjectId, ref: 'Review' }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  delivery: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Delivery'
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

// Generate unique order number
orderSchema.pre('save', async function (next) {
  if (this.isNew) {
    const count = await this.constructor.countDocuments();
    this.orderNumber = `ORD${Date.now()}${count.toString().padStart(3, '0')}`;
  }
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Order', orderSchema);
