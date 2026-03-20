const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'image', 'system'],
    default: 'text'
  },
  read: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

messageSchema.index({ conversation: 1, createdAt: 1 });

// Automatically update conversation's lastMessage when a new message is saved
messageSchema.post('save', async function (doc) {
  try {
    const Conversation = mongoose.model('Conversation');
    await Conversation.findByIdAndUpdate(doc.conversation, {
      lastMessage: {
        content: doc.type === 'image' ? '📷 Image shared' : (doc.type === 'system' ? `⚙️ ${doc.content}` : doc.content),
        type: doc.type,
        sender: doc.sender,
        timestamp: doc.createdAt
      }
    });
  } catch (error) {
    console.error('Error updating lastMessage in post-save hook:', error);
  }
});

module.exports = mongoose.model('Message', messageSchema);
