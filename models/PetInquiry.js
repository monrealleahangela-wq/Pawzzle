const mongoose = require('mongoose');

const STATUSES = [
  'submitted', 'awaiting_seller_response', 'seller_responded',
  'additional_information_required', 'resolved', 'cancelled'
];
const EVENT_KINDS = [
  'submitted', 'seller_reply', 'customer_follow_up',
  'information_requested', 'resolved', 'cancelled'
];

const inquiryEventSchema = new mongoose.Schema({
  kind: { type: String, enum: EVENT_KINDS, required: true },
  status: { type: String, enum: STATUSES, required: true },
  body: { type: String, trim: true, maxlength: 2000 },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestKey: { type: String, required: true },
  createdAt: { type: Date, required: true }
}, { _id: true });

const petInquirySchema = new mongoose.Schema({
  pet: { type: mongoose.Schema.Types.ObjectId, ref: 'Pet', required: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  petSnapshot: {
    name: { type: String, required: true },
    image: String
  },
  subject: { type: String, required: true, trim: true, maxlength: 160 },
  question: { type: String, required: true, trim: true, maxlength: 2000 },
  submissionKey: { type: String, required: true },
  status: { type: String, enum: STATUSES, default: 'submitted', required: true },
  events: { type: [inquiryEventSchema], default: [] },
  lastActivityAt: { type: Date, required: true, default: Date.now }
}, { timestamps: true });

petInquirySchema.index({ customer: 1, submissionKey: 1 }, { unique: true });
petInquirySchema.index({ customer: 1, lastActivityAt: -1 });
petInquirySchema.index({ store: 1, lastActivityAt: -1 });

module.exports = mongoose.model('PetInquiry', petInquirySchema);
