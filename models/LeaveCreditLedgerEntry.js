const mongoose = require('mongoose');

const ENTRY_TYPES = [
  'opening_balance', 'accrual', 'reservation', 'reservation_release', 'consumption',
  'manual_adjustment', 'carryover', 'expiry', 'reversal'
];
const SOURCE_TYPES = ['leave_request', 'accrual_period', 'manual_adjustment', 'ledger_entry', 'opening_balance', 'carryover_period', 'expiry_period'];

const leaveCreditLedgerEntrySchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  leaveTypeKey: { type: String, required: true, trim: true, lowercase: true, match: /^[a-z0-9][a-z0-9_-]{0,59}$/ },
  policyVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'LeavePolicyVersion', required: true },
  entryType: { type: String, enum: ENTRY_TYPES, required: true },
  // Integer minutes. Policy unitsPerDay is snapshotted on policy, default 480.
  units: { type: Number, required: true, validate: { validator: Number.isSafeInteger, message: 'Leave units must be a safe integer number of minutes.' } },
  effectiveDate: { type: Date, required: true },
  sourceType: { type: String, enum: SOURCE_TYPES, required: true },
  sourceReference: { type: mongoose.Schema.Types.ObjectId, required: true },
  idempotencyKey: { type: String, required: true, trim: true, minlength: 8, maxlength: 200 },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, trim: true, maxlength: 1000, required: true },
  reversalOf: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveCreditLedgerEntry', default: null },
  authorizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  unitsPerDaySnapshot: { type: Number, required: true, min: 1, validate: Number.isInteger },
  createdAt: { type: Date, default: Date.now, immutable: true }
}, { versionKey: false, timestamps: false });

leaveCreditLedgerEntrySchema.index({ store: 1, employee: 1, leaveTypeKey: 1, idempotencyKey: 1 }, { unique: true });
leaveCreditLedgerEntrySchema.index({ store: 1, employee: 1, leaveTypeKey: 1, effectiveDate: 1, createdAt: 1 });
leaveCreditLedgerEntrySchema.index({ store: 1, employee: 1, leaveTypeKey: 1, sourceReference: 1 }, {
  unique: true,
  partialFilterExpression: { entryType: 'accrual' },
  name: 'one_accrual_per_source'
});
leaveCreditLedgerEntrySchema.index({ store: 1, employee: 1, leaveTypeKey: 1, sourceReference: 1 }, {
  unique: true,
  partialFilterExpression: { entryType: 'reservation' },
  name: 'one_reservation_per_request'
});
leaveCreditLedgerEntrySchema.index({ store: 1, employee: 1, leaveTypeKey: 1, sourceReference: 1 }, {
  unique: true,
  partialFilterExpression: { entryType: 'consumption' },
  name: 'one_consumption_per_request'
});
leaveCreditLedgerEntrySchema.index({ store: 1, employee: 1, leaveTypeKey: 1, sourceReference: 1 }, {
  unique: true,
  partialFilterExpression: { entryType: 'manual_adjustment' },
  name: 'one_manual_adjustment_per_reference'
});
leaveCreditLedgerEntrySchema.index({ reversalOf: 1 }, {
  unique: true,
  partialFilterExpression: { entryType: 'reversal', reversalOf: { $type: 'objectId' } },
  name: 'one_reversal_per_entry'
});

leaveCreditLedgerEntrySchema.pre('validate', function validateLedgerEntry(next) {
  if (this.entryType === 'manual_adjustment') {
    if (!Number.isSafeInteger(this.units) || this.units === 0) this.invalidate('units', 'Manual adjustments must be a non-zero signed integer number of minutes.');
    if (!this.authorizedBy || String(this.actor) === String(this.authorizedBy)) this.invalidate('authorizedBy', 'Manual adjustments require a distinct independent authorizer.');
    if (this.sourceType !== 'manual_adjustment') this.invalidate('sourceType', 'Manual adjustments must use a manual_adjustment source.');
  } else if (!Number.isSafeInteger(this.units) || this.units <= 0) {
    this.invalidate('units', 'Ledger entries other than signed manual adjustments require positive integer minutes.');
  }
  if (this.entryType === 'reversal') {
    if (!this.reversalOf || this.sourceType !== 'ledger_entry' || !this.authorizedBy || String(this.actor) === String(this.authorizedBy)) {
      this.invalidate('reversalOf', 'A reversal must reference one prior entry and carry independent authorization.');
    }
  } else if (this.reversalOf) {
    this.invalidate('reversalOf', 'Only reversal entries may set reversalOf.');
  }
  if (['reservation', 'reservation_release', 'consumption'].includes(this.entryType) && this.sourceType !== 'leave_request') {
    this.invalidate('sourceType', 'Reservation, release, and consumption entries must reference a leave request.');
  }
  if (this.entryType === 'accrual' && this.sourceType !== 'accrual_period') {
    this.invalidate('sourceType', 'Accrual entries must reference an accrual period.');
  }
  if (['opening_balance', 'carryover', 'expiry'].includes(this.entryType) && !['opening_balance', 'carryover_period', 'expiry_period'].includes(this.sourceType)) {
    this.invalidate('sourceType', 'Opening, carryover, and expiry entries require their matching period source.');
  }
  next();
});

const appendOnly = function appendOnly(next) { next(new Error('Leave credit ledger entries are append-only and cannot be updated or deleted.')); };
leaveCreditLedgerEntrySchema.pre('save', function onlyCreate(next) {
  if (!this.isNew) return appendOnly(next);
  next();
});
['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndRemove'].forEach(hook => {
  leaveCreditLedgerEntrySchema.pre(hook, appendOnly);
});
leaveCreditLedgerEntrySchema.pre('deleteOne', { document: true, query: false }, appendOnly);
leaveCreditLedgerEntrySchema.statics.bulkWrite = function appendOnlyBulkWrite(operations, options) {
  const writes = Array.isArray(operations) ? operations : [];
  if (writes.some(operation => !operation?.insertOne)) {
    return Promise.reject(new Error('Leave credit ledger bulk updates, replacements, and deletes are prohibited; append a compensating entry instead.'));
  }
  return mongoose.Model.bulkWrite.call(this, writes, options);
};

module.exports = mongoose.models.LeaveCreditLedgerEntry
  || mongoose.model('LeaveCreditLedgerEntry', leaveCreditLedgerEntrySchema);
