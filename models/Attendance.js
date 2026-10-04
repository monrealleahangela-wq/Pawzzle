const mongoose = require('mongoose');

const attendancePointSchema = new mongoose.Schema({
  at: { type: Date, required: true },
  coordinates: {
    lat: { type: Number },
    lng: { type: Number }
  },
  accuracyMeters: { type: Number, min: 0 },
  distanceMeters: { type: Number, min: 0 },
  validationStatus: {
    type: String,
    enum: ['valid', 'outside_geofence', 'poor_accuracy', 'system_generated'],
    required: true
  },
  userAgent: { type: String, maxlength: 500 },
  ipAddress: { type: String, maxlength: 100 }
}, { _id: false });

const attendanceSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  workDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  schedule: {
    isWorkDay: { type: Boolean, required: true },
    start: String,
    end: String,
    breakMinutes: { type: Number, min: 0, default: 0 },
    timezone: { type: String, default: 'Asia/Manila' }
  },
  timeIn: attendancePointSchema,
  timeOut: attendancePointSchema,
  status: {
    type: String,
    enum: ['present', 'late', 'undertime', 'absent', 'on_leave', 'rest_day', 'incomplete'],
    default: 'incomplete',
    index: true
  },
  workedMinutes: { type: Number, min: 0, default: 0 },
  lateMinutes: { type: Number, min: 0, default: 0 },
  undertimeMinutes: { type: Number, min: 0, default: 0 },
  overtimeMinutes: { type: Number, min: 0, default: 0 },
  locationFlagged: { type: Boolean, default: false },
  locationReviews: [{
    punchType: { type: String, enum: ['time_in', 'time_out'], required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', required: true },
    employeeReason: { type: String, required: true, trim: true, maxlength: 1000 },
    evidenceReasons: [{ type: String, maxlength: 300 }],
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    reviewerNote: { type: String, trim: true, maxlength: 1000 },
    history: [{
      status: { type: String, enum: ['approved', 'rejected'], required: true },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      reviewedAt: { type: Date, required: true },
      reviewerNote: { type: String, required: true, trim: true, maxlength: 1000 }
    }]
  }],
  autoClockOutReview: {
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'corrected'] },
    generatedAt: Date,
    maximumShiftMinutes: { type: Number, min: 60, max: 1440 },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    reviewerNote: { type: String, trim: true, maxlength: 1000 },
    history: [{
      status: { type: String, enum: ['approved', 'rejected', 'corrected'], required: true },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      reviewedAt: { type: Date, required: true },
      reviewerNote: { type: String, required: true, trim: true, maxlength: 1000 }
    }]
  },
  locationReview: {
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    reason: { type: String, maxlength: 1000 }
  },
  suspiciousReasons: [{ type: String, maxlength: 300 }],
  leaveRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest', default: null },
  corrections: [{
    field: { type: String, required: true },
    originalValue: mongoose.Schema.Types.Mixed,
    correctedValue: mongoose.Schema.Types.Mixed,
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

attendanceSchema.index({ store: 1, employee: 1, workDate: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
