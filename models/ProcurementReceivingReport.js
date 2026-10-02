const mongoose = require('mongoose');

const lotDetailsSchema = new mongoose.Schema({
  lotNumber: String,
  manufacturer: String,
  expiresAt: Date,
  isVaccine: Boolean,
  vaccineType: String,
  storageNotes: String
}, { _id: false });

const receivingItemSchema = new mongoose.Schema({
  purchaseOrderItem: { type: mongoose.Schema.Types.ObjectId, required: true },
  itemType: { type: String, enum: ['pet_supply', 'product', 'live_pet'], required: true },
  expectedQuantity: { type: Number, required: true, min: 1 },
  receivedQuantity: { type: Number, required: true, min: 0 },
  damagedQuantity: { type: Number, default: 0, min: 0 },
  incorrectQuantity: { type: Number, default: 0, min: 0 },
  acceptedQuantity: { type: Number, required: true, min: 0 },
  missingQuantity: { type: Number, required: true, min: 0 },
  condition: {
    type: String,
    enum: ['acceptable', 'damaged', 'incorrect', 'missing', 'mixed'],
    default: 'acceptable'
  },
  notes: { type: String, trim: true, maxlength: 1000 },
  lotDetails: lotDetailsSchema,
  inventoryApplied: { type: Boolean, default: false },
  processingError: String
}, { _id: true });

const evidenceSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: String,
  deliveryType: {
    type: String,
    enum: ['upload', 'authenticated', 'private'],
    default: 'upload'
  },
  resourceType: { type: String, enum: ['image'], default: 'image' },
  format: String,
  originalName: String,
  size: Number,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uploadedAt: { type: Date, default: Date.now }
}, { _id: true });

const resolutionItemSchema = new mongoose.Schema({
  purchaseOrderItem: { type: mongoose.Schema.Types.ObjectId, required: true },
  unresolvedQuantity: { type: Number, required: true, min: 1 },
  proposedQuantity: { type: Number, required: true, min: 1 }
}, { _id: false });

const resolutionSubmissionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['replacement', 'return_correction', 'refund_credit'],
    required: true
  },
  items: { type: [resolutionItemSchema], required: true },
  notes: { type: String, trim: true, maxlength: 2000 },
  status: {
    type: String,
    enum: ['submitted', 'accepted', 'rejected', 'awaiting_replacement', 'replacement_delivered', 'resolved'],
    default: 'submitted'
  },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  submittedAt: { type: Date, default: Date.now },
  decisionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  decisionAt: Date,
  decisionNotes: { type: String, trim: true, maxlength: 2000 },
  replacementDeliveredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  replacementDeliveredAt: Date,
  replacementNotes: { type: String, trim: true, maxlength: 2000 },
  financialProposal: {
    adjustmentType: { type: String, enum: ['refund', 'credit'] },
    proposedAmount: { type: Number, min: 0.01 }
  },
  financialAdjustment: {
    status: {
      type: String,
      enum: ['not_required', 'pending_finance_review', 'approved', 'rejected'],
      default: 'not_required'
    },
    approvedAmount: { type: Number, min: 0 },
    financeRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'ProcurementPayment' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    notes: { type: String, trim: true, maxlength: 2000 }
  }
}, { _id: true });

const reinspectionItemSchema = new mongoose.Schema({
  purchaseOrderItem: { type: mongoose.Schema.Types.ObjectId, required: true },
  expectedQuantity: { type: Number, required: true, min: 1 },
  receivedQuantity: { type: Number, required: true, min: 0 },
  damagedQuantity: { type: Number, default: 0, min: 0 },
  incorrectQuantity: { type: Number, default: 0, min: 0 },
  acceptedQuantity: { type: Number, required: true, min: 0 },
  receivedQuantityTarget: { type: Number, required: true, min: 0 },
  missingQuantity: { type: Number, required: true, min: 0 },
  condition: {
    type: String,
    enum: ['acceptable', 'damaged', 'incorrect', 'missing', 'mixed'],
    required: true
  },
  notes: { type: String, trim: true, maxlength: 1000 },
  lotDetails: lotDetailsSchema,
  inventoryApplied: { type: Boolean, default: false },
  processingError: String
}, { _id: true });

const reinspectionSchema = new mongoose.Schema({
  resolutionSubmission: { type: mongoose.Schema.Types.ObjectId, required: true },
  inspectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  inspectedAt: Date,
  items: { type: [reinspectionItemSchema], required: true },
  evidence: { type: [evidenceSchema], default: [] },
  notes: { type: String, trim: true, maxlength: 2000 },
  outcome: { type: String, enum: ['accepted', 'partially_accepted', 'issue_reported'], required: true },
  processingStatus: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
  processingError: String
}, { _id: true });

const resolutionHistorySchema = new mongoose.Schema({
  status: { type: String, required: true },
  action: { type: String, required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actorRole: String,
  resolutionSubmission: mongoose.Schema.Types.ObjectId,
  notes: { type: String, trim: true, maxlength: 2000 },
  timestamp: { type: Date, default: Date.now }
}, { _id: true });

const procurementReceivingReportSchema = new mongoose.Schema({
  purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true, unique: true, index: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receivedAt: Date,
  outcome: {
    type: String,
    enum: ['accepted', 'partially_accepted', 'issue_reported'],
    required: true,
    index: true
  },
  items: { type: [receivingItemSchema], required: true },
  evidence: { type: [evidenceSchema], default: [] },
  notes: { type: String, trim: true, maxlength: 2000 },
  paymentReady: { type: Boolean, default: false },
  payableAmount: { type: Number, default: 0, min: 0 },
  resolutionStatus: {
    type: String,
    enum: ['not_required', 'pending_supplier_resolution', 'resolution_submitted', 'resolution_accepted', 'resolution_rejected', 'awaiting_replacement', 'reinspection', 'reinspection_processing', 'resolved'],
    default: 'not_required'
  },
  resolutionSubmissions: { type: [resolutionSubmissionSchema], default: [] },
  reinspections: { type: [reinspectionSchema], default: [] },
  resolutionHistory: { type: [resolutionHistorySchema], default: [] },
  approvedAdjustmentTotal: { type: Number, default: 0, min: 0 },
  processingStatus: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'processing',
    index: true
  },
  processingError: String
}, { timestamps: true });

procurementReceivingReportSchema.index({ store: 1, createdAt: -1 });
procurementReceivingReportSchema.index({ supplier: 1, createdAt: -1 });

module.exports = mongoose.model('ProcurementReceivingReport', procurementReceivingReportSchema);
