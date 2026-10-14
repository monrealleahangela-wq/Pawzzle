const mongoose = require('mongoose');

const encryptedValueSchema = new mongoose.Schema({
  iv: { type: String, required: true },
  tag: { type: String, required: true },
  ciphertext: { type: String, required: true }
}, { _id: false });

const reservationCredentialSchema = new mongoose.Schema({
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  revisionFingerprint: { type: String, required: true },
  version: { type: Number, min: 1, default: 1, required: true },
  qrDigest: { type: String, required: true, unique: true, select: false },
  backupDigest: { type: String, required: true, unique: true, select: false },
  encryptedQr: { type: encryptedValueSchema, required: true, select: false },
  encryptedBackup: { type: encryptedValueSchema, required: true, select: false },
  active: { type: Boolean, default: true, required: true },
  issuedAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  usedAt: { type: Date, default: null }
}, { timestamps: true, strict: 'throw' });

reservationCredentialSchema.index({ booking: 1, revisionFingerprint: 1 }, { unique: true });
reservationCredentialSchema.index({ booking: 1, active: 1 });

module.exports = mongoose.models.ReservationCredential
  || mongoose.model('ReservationCredential', reservationCredentialSchema);
