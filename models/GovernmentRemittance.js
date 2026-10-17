const mongoose = require('mongoose');

const governmentRemittanceSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  payrollPeriod: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollPeriod', required: true },
  agency: { type: String, enum: ['SSS', 'PhilHealth', 'Pag-IBIG', 'BIR'], required: true },
  contributionMonth: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  employeeAmount: { type: Number, min: 0, required: true },
  employerAmount: { type: Number, min: 0, required: true },
  totalAmount: { type: Number, min: 0, required: true },
  status: { type: String, enum: ['pending', 'for_confirmation', 'processing', 'paid', 'failed', 'on_hold'], default: 'pending' },
  paymentReference: { type: String, trim: true, maxlength: 160, default: '' },
  paymentDate: Date,
  notes: { type: String, trim: true, maxlength: 1000, default: '' },
  preparedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  confirmedAt: Date,
  history: [{
    status: { type: String, enum: ['pending', 'for_confirmation', 'processing', 'paid', 'failed', 'on_hold'], required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now },
    note: { type: String, trim: true, maxlength: 1000, default: '' }
  }]
}, { timestamps: true });

module.exports = mongoose.model('GovernmentRemittance', governmentRemittanceSchema);
