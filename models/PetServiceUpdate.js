const mongoose = require('mongoose');

const petServiceUpdateSchema = new mongoose.Schema({
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
  pet: { type: mongoose.Schema.Types.ObjectId, ref: 'PetProfile', default: null, index: true },
  petSnapshot: {
    name: { type: String, required: true, trim: true },
    type: { type: String, default: '', trim: true }
  },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  entryType: {
    type: String,
    enum: ['update', 'photo', 'internal_note', 'aftercare', 'reminder'],
    default: 'update',
    required: true
  },
  visibility: {
    type: String,
    enum: ['customer', 'internal'],
    default: 'customer',
    required: true,
    index: true
  },
  category: {
    type: String,
    enum: ['general', 'observation', 'follow_up', 'pickup', 'incident'],
    default: 'general'
  },
  stage: {
    type: String,
    enum: ['scheduled', 'pet_arrived', 'assessed', 'service_started', 'in_progress', 'ready_for_pickup', 'completed', 'aftercare', 'cancelled', 'incident', 'general'],
    required: true
  },
  message: { type: String, default: '', trim: true, maxlength: 2000 },
  mediaUrls: [String],
  media: [{
    url: { type: String, required: true },
    publicId: String,
    originalName: String,
    mimeType: String,
    size: Number,
    category: { type: String, enum: ['before', 'during', 'after', 'result', 'documentation', 'other'], default: 'other' }
  }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  readAt: Date
}, { timestamps: true });

petServiceUpdateSchema.index({ booking: 1, createdAt: 1 });

module.exports = mongoose.model('PetServiceUpdate', petServiceUpdateSchema);
