const mongoose = require('mongoose');

const reservationCheckInEventSchema = new mongoose.Schema({
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  method: { type: String, enum: ['qr', 'backup_code'], required: true },
  outcome: { type: String, enum: ['verified', 'rejected', 'checked_in'], required: true },
  reason: { type: String, enum: ['too_early', 'window_expired', 'cancelled', 'unconfirmed', 'already_checked_in', 'payment_required', 'ineligible', 'credential_invalid', 'authorization_denied', 'transaction_failed'] },
  occurredAt: { type: Date, required: true, default: Date.now }
}, { timestamps: false, strict: 'throw' });

reservationCheckInEventSchema.index({ store: 1, occurredAt: -1 });
reservationCheckInEventSchema.pre('findOneAndUpdate', function rejectMutation(next) { next(new Error('Check-in audit events are append-only.')); });
reservationCheckInEventSchema.pre('updateOne', function rejectMutation(next) { next(new Error('Check-in audit events are append-only.')); });
reservationCheckInEventSchema.pre('deleteOne', function rejectMutation(next) { next(new Error('Check-in audit events are append-only.')); });
reservationCheckInEventSchema.pre('deleteMany', function rejectMutation(next) { next(new Error('Check-in audit events are append-only.')); });

module.exports = mongoose.models.ReservationCheckInEvent
  || mongoose.model('ReservationCheckInEvent', reservationCheckInEventSchema);
