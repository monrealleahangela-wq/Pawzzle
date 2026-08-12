const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['customer', 'admin', 'staff', 'store_owner', 'super_admin', 'platform_admin'],
      required: true
    }
  }],
  pet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pet'
  },
  adoptionRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdoptionRequest'
  },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null, index: true },
  service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', default: null },
  petProfile: { type: mongoose.Schema.Types.ObjectId, ref: 'PetProfile', default: null },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null, index: true },
  type: {
    type: String,
    enum: ['adoption', 'inquiry', 'support', 'general', 'service'],
    default: 'general'
  },
  status: {
    type: String,
    enum: ['active', 'closed', 'archived'],
    default: 'active'
  },
  lastMessage: {
    content: String,
    type: {
      type: String,
      enum: ['text', 'image', 'system'],
      default: 'text'
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for fast lookup by participant
conversationSchema.index({ 'participants.user': 1 });
conversationSchema.index({ pet: 1, 'participants.user': 1 });
conversationSchema.index({ booking: 1, type: 1 }, { unique: true, partialFilterExpression: { type: 'service' } });

module.exports = mongoose.model('Conversation', conversationSchema);
