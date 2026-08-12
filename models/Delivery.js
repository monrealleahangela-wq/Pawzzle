const mongoose = require('mongoose');
const crypto = require('crypto');

const deliverySchema = new mongoose.Schema({
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    index: true,
    default: null
  },
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
    enum: ['pending', 'unassigned', 'assigned', 'accepted', 'declined',
      'picked_up', 'in_transit', 'arrived', 'delivered', 'failed_attempt',
      'returned_to_store', 'cancelled'],
    default: 'pending'
  },
  riderName: {
    type: String,
    trim: true
  },
  assignedRider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  assignmentType: {
    type: String,
    enum: ['internal', 'third_party', 'unassigned'],
    default: 'unassigned',
    index: true
  },
  thirdPartyRider: {
    name: { type: String, trim: true },
    mobile: { type: String, trim: true },
    company: { type: String, trim: true },
    vehicleType: { type: String, trim: true },
    plateNumber: { type: String, trim: true, uppercase: true },
    referenceNumber: { type: String, trim: true },
    notes: { type: String, trim: true }
  },
  assignmentHistory: [{
    assignmentType: { type: String, enum: ['internal', 'third_party', 'unassigned'] },
    rider: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    thirdPartyRider: {
      name: String, mobile: String, company: String, vehicleType: String,
      plateNumber: String, referenceNumber: String, notes: String
    },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedAt: { type: Date, default: Date.now },
    endedAt: Date
  }],
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  assignedAt: Date,
  feeCalculation: {
    distanceKm: Number,
    distanceMethod: String,
    ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryFeeRule' },
    ruleName: String,
    ruleVersion: Number,
    breakdown: mongoose.Schema.Types.Mixed,
    totalFee: Number,
    calculatedAt: Date,
    overrideReason: String
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
  riderLinkOpenedAt: Date,
  trackingLinkOpenedAt: Date,
  pickedUpAt: {
    type: Date
  },
  deliveredAt: {
    type: Date
  },
  arrivedAt: Date,
  statusHistory: [{
    status: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    notes: String
  }],
  isLive: {
    type: Boolean,
    default: true
  },
  riderVehicleInfo: {
    type: String,
    trim: true
  },
  isRiderVerified: {
    type: Boolean,
    default: false
  },
    complaints: [{
      content: { type: String, required: true },
      type: { type: String, enum: ['suspicious_location', 'damaged_items', 'other'] },
      status: { type: String, enum: ['pending', 'resolved'], default: 'pending' },
      createdAt: { type: Date, default: Date.now },
      resolvedAt: { type: Date },
      resolutionNotes: String,
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],
  proofOfDelivery: {
    photo: { type: String },
    signature: { type: String },
    method: { type: String, enum: ['photo', 'qr', 'otp', 'signature', 'notes'] },
    otpVerified: { type: Boolean, default: false },
    notes: String,
    location: { lat: Number, lng: Number },
    riderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    riderName: String,
    timestamp: { type: Date },
    codPaymentStatus: { type: String, enum: ['cash_received', 'digital_received', 'not_received'] }
  },
  deliveryAttempts: [{
    reason: { type: String, enum: ['customer_unavailable', 'cannot_contact', 'incorrect_address', 'customer_refused', 'establishment_closed', 'address_inaccessible', 'other'], required: true },
    notes: String,
    photo: String,
    location: { lat: Number, lng: Number },
    timestamp: { type: Date, default: Date.now },
    resolutionStatus: { type: String, enum: ['open', 'resolved'], default: 'open' },
    resolutionNotes: String,
    resolvedAt: Date,
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }]
}, {
  timestamps: true
});

// Middleware to disable link after delivery
deliverySchema.pre('save', function(next) {
  if (this.assignmentType === 'unassigned' && this.assignedRider) this.assignmentType = 'internal';
  if (this.assignmentType === 'unassigned' && this.thirdPartyRider?.name) this.assignmentType = 'third_party';
  if (this.status === 'delivered') {
    this.isLive = false;
    if (!this.deliveredAt) this.deliveredAt = new Date();
  }
  next();
});

module.exports = mongoose.model('Delivery', deliverySchema);
