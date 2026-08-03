const mongoose = require('mongoose');

const petServiceUpdateSchema = new mongoose.Schema({
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
  pet: { type: mongoose.Schema.Types.ObjectId, ref: 'PetProfile', required: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  stage: {
    type: String,
    enum: ['admitted', 'assessed', 'started', 'in_progress', 'ready', 'released', 'incident'],
    required: true
  },
  message: { type: String, required: true, trim: true, maxlength: 2000 },
  mediaUrls: [String],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  readAt: Date
}, { timestamps: true });

module.exports = mongoose.model('PetServiceUpdate', petServiceUpdateSchema);
