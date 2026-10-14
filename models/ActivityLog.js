const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true
  },
  details: {
    type: String
  },
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    index: true
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  category: {
    type: String,
    enum: ['general', 'employment', 'compensation', 'payroll'],
    default: 'general',
    index: true
  },
  changes: {
    type: {
      before: mongoose.Schema.Types.Mixed,
      after: mongoose.Schema.Types.Mixed,
      effectiveDate: Date,
      reason: { type: String, trim: true, maxlength: 500 }
    },
    select: false
  },
  ipAddress: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('ActivityLog', activityLogSchema);
