const mongoose = require('mongoose');

// One active claim per Store/employee/civil work date. Claims for pending,
// approved, and cancellation-requested leave are held until rejection or
// confirmed cancellation. The unique key serializes overlapping requests.
const leaveOverlapClaimSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  workDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  leaveRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest', required: true },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

leaveOverlapClaimSchema.index({ store: 1, employee: 1, workDate: 1 }, { unique: true });
leaveOverlapClaimSchema.index({ leaveRequest: 1 });

module.exports = mongoose.models.LeaveOverlapClaim
  || mongoose.model('LeaveOverlapClaim', leaveOverlapClaimSchema);
