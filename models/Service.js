const mongoose = require('mongoose');

// ── Pricing Rule Sub-Schemas ──────────────────────────────────────────────

const petSizePricingSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  small:       { type: Number, default: 0 },   // adjustment (can be 0 = base)
  medium:      { type: Number, default: 50 },
  large:       { type: Number, default: 100 },
  extraLarge:  { type: Number, default: 150 }
}, { _id: false });

const weightRangeSchema = new mongoose.Schema({
  minWeight: { type: Number, required: true },
  maxWeight: { type: Number, required: true },
  adjustment: { type: Number, required: true }  // price increment
}, { _id: false });

const petWeightPricingSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  ranges: [weightRangeSchema]
}, { _id: false });

const breedPricingEntrySchema = new mongoose.Schema({
  breed:      { type: String, required: true },
  adjustment: { type: Number, required: true }
}, { _id: false });

const breedPricingSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  breeds:  [breedPricingEntrySchema]
}, { _id: false });

const conditionFeeEntrySchema = new mongoose.Schema({
  condition:   { type: String, required: true },  // e.g., 'matted_fur', 'fleas_ticks', 'aggressive', 'special_handling'
  label:       { type: String, required: true },  // Human-readable label
  fee:         { type: Number, required: true }
}, { _id: false });

const conditionPricingSchema = new mongoose.Schema({
  enabled:    { type: Boolean, default: false },
  conditions: [conditionFeeEntrySchema]
}, { _id: false });

const timePricingSchema = new mongoose.Schema({
  enabled:       { type: Boolean, default: false },
  weekdayRate:   { type: Number, default: 0 },   // adjustment from base (0 = no change)
  weekendRate:   { type: Number, default: 0 },
  holidayRate:   { type: Number, default: 0 },
  peakHoursRate: { type: Number, default: 0 },
  peakHoursStart: { type: String, default: '10:00' },  // HH:MM
  peakHoursEnd:   { type: String, default: '14:00' },
  holidays:       [{ type: Date }]  // specific holiday dates
}, { _id: false });

// ── Add-On Sub-Schema ─────────────────────────────────────────────────────

const addOnSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: { type: String, default: '' },
  price:       { type: Number, required: true, min: 0 },
  duration:    { type: Number, default: 0 },  // additional minutes
  isActive:    { type: Boolean, default: true }
});

// ── Booking Rules Sub-Schema ──────────────────────────────────────────────

const bookingRulesSchema = new mongoose.Schema({
  minBookingNotice:   { type: Number, default: 0 },     // minutes before booking
  maxDailyBookings:   { type: Number, default: 0 },     // 0 = unlimited
  capacityPerSlot:    { type: Number, default: 1 }
}, { _id: false });

// ── Per-Service Schedule Override ─────────────────────────────────────────

const dayScheduleSchema = new mongoose.Schema({
  open:   { type: String, default: '09:00' },
  close:  { type: String, default: '17:00' },
  closed: { type: Boolean, default: false }
}, { _id: false });

const serviceScheduleSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },  // false = use store schedule
  monday:    { type: dayScheduleSchema, default: () => ({}) },
  tuesday:   { type: dayScheduleSchema, default: () => ({}) },
  wednesday: { type: dayScheduleSchema, default: () => ({}) },
  thursday:  { type: dayScheduleSchema, default: () => ({}) },
  friday:    { type: dayScheduleSchema, default: () => ({}) },
  saturday:  { type: dayScheduleSchema, default: () => ({}) },
  sunday:    { type: dayScheduleSchema, default: () => ({}) },
  breakTimes: [{
    start: { type: String },  // HH:MM
    end:   { type: String }
  }],
  blackoutDates: [{ type: Date }]
}, { _id: false });

// ── Main Service Schema ───────────────────────────────────────────────────

const serviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: String,
    enum: ['grooming', 'health_wellness', 'boarding_hotel', 'pet_services', 'training', 'home_services', 'other'],
    required: true
  },
  subCategory: {
    type: String,
    required: true
  },
  duration: {
    type: Number, // in minutes
    required: true
  },
  bufferTime: {
    type: Number, // buffer minutes between bookings
    default: 0
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },

  // ── Dynamic Pricing Rules ─────────────────────
  pricingRules: {
    petSize:    { type: petSizePricingSchema,   default: () => ({}) },
    petWeight:  { type: petWeightPricingSchema,  default: () => ({}) },
    breed:      { type: breedPricingSchema,      default: () => ({}) },
    condition:  { type: conditionPricingSchema,  default: () => ({}) },
    timeBased:  { type: timePricingSchema,       default: () => ({}) }
  },

  // ── Add-On Services ───────────────────────────
  addOns: [addOnSchema],

  // ── Booking Rules ─────────────────────────────
  bookingRules: { type: bookingRulesSchema, default: () => ({}) },

  // ── Staff Assignment ──────────────────────────
  assignedStaff: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // ── Per-Service Schedule Override ─────────────
  schedule: { type: serviceScheduleSchema, default: () => ({}) },

  // ── Legacy / Existing Fields ──────────────────
  homeServiceAvailable: {
    type: Boolean,
    default: false
  },
  homeServicePrice: {
    type: Number,
    default: 0
  },
  maxPetsPerSession: {
    type: Number,
    default: 1
  },
  requirements: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  },
  images: [{
    type: String
  }],
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
  },
  ratings: {
    average: { type: Number, default: 0 },
    count: { type: Number, default: 0 }
  }
});

serviceSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Service', serviceSchema);
