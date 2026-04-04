const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
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
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },
  staff: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },
  pet: {
    name: { type: String, required: true },
    type: { type: String, required: true },
    breed: { type: String, required: true },
    size: { type: String, enum: ['Small', 'Medium', 'Large', 'Extra Large'], default: 'Small' },
    age: { type: Number, required: true },
    weight: { type: Number, required: true },
    specialNotes: { type: String, default: '' },
    allergies: { type: String, default: 'None' },
    medicalConditions: { type: String, default: 'None' },
    groomingPreferences: { type: String, default: 'None' },
    behaviorNotes: { type: String, default: 'Normal' }
  },
  bookingDate: {
    type: Date,
    required: true
  },
  startTime: {
    type: String, // HH:MM format
    required: true
  },
  endTime: {
    type: String, // HH:MM format
    required: true
  },
  isHomeService: {
    type: Boolean,
    default: false
  },
  serviceAddress: {
    street: String,
    city: String,
    province: String,
    barangay: String,
    zipCode: String,
    country: String,
    notes: String
  },
  status: {
    type: String,
    // pending -> approved -> (QR SCAN) -> processing -> finished (wait for review) -> completed
    enum: ['pending', 'confirmed', 'approved', 'processing', 'finished', 'completed', 'cancelled', 'no_show'],
    default: 'pending'
  },
  qrCode: {
    type: String, // Stringified unique ID or secure hash
    default: null
  },
  isScanned: {
    type: Boolean,
    default: false
  },
  servicePhotos: [{
    type: String // URLs of photos uploaded by staff/groomers after service
  }],
  paymentMethod: {
    type: String,
    enum: ['online', 'in_person', 'pending'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'refunded'],
    default: 'pending'
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0
  },
  voucher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Voucher'
  },
  discountAmount: {
    type: Number,
    default: 0
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
  notes: {
    type: String,
    default: ''
  },
  adminNotes: {
    type: String,
    default: ''
  },
  reviewStatus: {
    isRated: { type: Boolean, default: false },
    reviewId: { type: mongoose.Schema.Types.ObjectId, ref: 'Review' }
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

bookingSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Booking', bookingSchema);
