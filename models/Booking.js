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
  serviceProvider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  staffRoleSnapshot: { type: String, default: '' },
  staffSpecialtySnapshot: { type: String, default: '' },
  staffAssignmentHistory: [{
    staff: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    source: { type: String, enum: ['admin', 'staff', 'customer', 'automatic'], default: 'admin' },
    assignedAt: { type: Date, default: Date.now }
  }],
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },
  pet: {
    name: { type: String, required: true },
    type: { type: String, required: true },
    breed: { type: String, default: '' },
    size: { type: String, enum: ['Unknown', 'Small', 'Medium', 'Large', 'Extra Large'], default: 'Unknown' },
    age: { type: Number, min: 0, default: null },
    gender: { type: String, enum: ['Male', 'Female'] },
    weight: { type: Number, min: 0, default: null },
    color: { type: String, default: '' },
    photo: { type: String, default: null },
    vaccinationStatus: { type: String, default: 'Pending' },
    specialNotes: { type: String, default: '' },
    allergies: { type: String, default: 'None' },
    medicalConditions: { type: String, default: 'None' },
    groomingPreferences: { type: String, default: 'None' },
    behaviorNotes: { type: String, default: 'Normal' }
  },
  petProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PetProfile',
    default: null,
    index: true
  },

  // ── Selected Add-Ons ──────────────────────────
  selectedAddOns: [{
    addOnId:  { type: mongoose.Schema.Types.ObjectId },
    name:     { type: String, required: true },
    price:    { type: Number, required: true },
    duration: { type: Number, default: 0 }
  }],

  // ── Condition Flags (selected by customer during booking) ──
  selectedConditions: [{
    condition: { type: String },
    label:     { type: String },
    fee:       { type: Number }
  }],

  // ── Pricing Breakdown (snapshot at booking time) ──
  pricingBreakdown: {
    calculationVersion: { type: Number },
    basePrice:        { type: Number, default: 0 },
    sizeSurcharge:    { type: Number, default: 0 },
    weightSurcharge:  { type: Number, default: 0 },
    breedSurcharge:   { type: Number, default: 0 },
    conditionFees:    { type: Number, default: 0 },
    timePremium:      { type: Number, default: 0 },
    addOnsTotal:      { type: Number, default: 0 },
    homeServiceFee:   { type: Number, default: 0 },
    subtotal:         { type: Number, default: 0 },
    discount:         { type: Number, default: 0 },
    discountedSubtotal: { type: Number, default: 0 },
    deliveryFee:      { type: Number, default: 0 },
    deliveryFeeTaxable: { type: Boolean, default: false },
    taxStatus:        { type: String, enum: ['non_vat', 'vat_registered', 'vat_exempt', 'zero_rated'], default: 'non_vat' },
    pricingMode:      { type: String, enum: ['inclusive', 'exclusive'], default: 'inclusive' },
    vatRatePercent:   { type: Number, default: 0 },
    vatExclusiveAmount: { type: Number, default: 0 },
    vatAmount:        { type: Number, default: 0 },
    nonTaxableAmount: { type: Number, default: 0 },
    finalPrice:       { type: Number, default: 0 },
    configuredAt:     { type: Date }
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
    // Legacy `approved` records remain valid. New bookings use the explicit
    // customer-approval/payment states before becoming confirmed.
    enum: [
      'pending', 'awaiting_customer_confirmation', 'awaiting_payment',
      'confirmed', 'approved', 'processing', 'finished', 'completed',
      'cancelled', 'confirmation_expired', 'rejected', 'no_show'
    ],
    default: 'pending'
  },
  lifecycle: {
    proposedAt: Date,
    proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    customerConfirmedAt: Date,
    confirmationExpiresAt: Date,
    confirmedAt: Date,
    completedAt: Date,
    cancelledAt: Date,
    cancellationSource: { type: String, enum: ['customer', 'admin', 'staff', 'system'] }
  },
  proposal: {
    estimatedDurationMinutes: { type: Number, min: 1, max: 1440 },
    specialInstructions: { type: String, trim: true, maxlength: 2000, default: '' },
    revision: { type: Number, min: 0, default: 0 },
    specialistChangedAt: Date
  },
  serviceProgress: {
    status: {
      type: String,
      enum: ['scheduled', 'pet_arrived', 'service_started', 'in_progress', 'ready_for_pickup', 'completed', 'cancelled'],
      default: 'scheduled'
    },
    scheduledAt: Date,
    arrivedAt: Date,
    startedAt: Date,
    readyAt: Date,
    completedAt: Date,
    cancelledAt: Date
  },
  careSummary: {
    aftercareInstructions: { type: String, trim: true, maxlength: 4000, default: '' },
    serviceNotes: { type: String, trim: true, maxlength: 4000, default: '' },
    aftercareProvidedAt: Date,
    aftercareProvidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  reminders: {
    twentyFourHourSentAt: Date,
    twoHourSentAt: Date
  },
  serviceConversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    default: null
  },
  qrCode: {
    type: String, // Stringified unique ID or secure hash
    default: null
  },
  isScanned: {
    type: Boolean,
    default: false
  },
  scannedAt: {
    type: Date,
    default: null
  },
  scannedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  servicePhotos: [{
    type: String // URLs of photos uploaded by staff/groomers after service
  }],
  paymentMethod: {
    type: String,
    enum: ['paymongo', 'gcash', 'maya', 'bank_transfer', 'pending'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'cancelled', 'refunded'],
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
  paymentDetails: {
    sessionId: { type: String },
    checkoutUrl: { type: String },
    sessionStatus: { type: String, enum: ['active', 'expired'] },
    sessionVersion: { type: Number, default: 0 },
    sessionCreatedAt: { type: Date },
    sessionHistory: [{
      sessionId: String,
      checkoutUrl: String,
      status: { type: String, enum: ['active', 'expired'] },
      createdAt: Date
    }],
    paymentId: { type: String },
    paymentIntentId: { type: String },
    amountPaid: { type: Number, min: 0 },
    transactionDate: { type: Date },
    duplicatePaymentIds: [{ type: String }],
    sourceType: { type: String },
    failureReason: { type: String }
  },
  invoiceSnapshot: {
    issuedAt: Date,
    sellerName: String,
    sellerAddress: String,
    sellerTaxStatus: String,
    pricingBreakdown: { type: mongoose.Schema.Types.Mixed }
  },
  refundPolicySnapshot: {
    type: { type: String, enum: ['full_refund', 'conditional_refund', 'no_refund'] },
    summary: String,
    conditions: String,
    capturedAt: Date
  },
  refundPolicyAcknowledgment: {
    required: { type: Boolean, default: false },
    acknowledged: { type: Boolean, default: false },
    acknowledgedAt: Date,
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
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
