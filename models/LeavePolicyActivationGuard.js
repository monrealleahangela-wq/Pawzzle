const mongoose = require('mongoose');

// One serialization point per Store and stable leave type. All employee-category
// scopes share the guard because a Store-wide policy intersects every category.
const leavePolicyActivationGuardSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  leaveTypeKey: { type: String, required: true, trim: true, lowercase: true },
  revision: { type: Number, required: true, default: 0, min: 0 }
}, { versionKey: false, timestamps: true });

leavePolicyActivationGuardSchema.index({ store: 1, leaveTypeKey: 1 }, { unique: true, name: 'one_policy_activation_guard_per_scope' });

module.exports = mongoose.models.LeavePolicyActivationGuard
  || mongoose.model('LeavePolicyActivationGuard', leavePolicyActivationGuardSchema);
