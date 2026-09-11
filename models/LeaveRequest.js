const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  leaveTypeKey: { type: String, required: true, trim: true, lowercase: true },
  leaveTypeName: { type: String, required: true, trim: true },
  isPaid: { type: Boolean, required: true },
  startDate: { type: Date, required: true, index: true },
  endDate: { type: Date, required: true, index: true },
  reason: { type: String, required: true, trim: true, maxlength: 1500 },
  attachmentUrl: { type: String, trim: true, default: '' },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending',
    index: true
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  reviewComment: { type: String, trim: true, maxlength: 1000, default: '' },
  cancelledAt: Date,
  history: [{
    action: { type: String, enum: ['submitted', 'approved', 'rejected', 'cancelled'], required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now },
    comment: { type: String, maxlength: 1000, default: '' }
  }]
}, { timestamps: true });

leaveRequestSchema.index({ store: 1, employee: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
