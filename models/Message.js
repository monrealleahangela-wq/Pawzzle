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
  // Supplier chat has per-account read state; legacy customer chat retains read.
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  clientMessageId: { type: String, default: undefined },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

messageSchema.index({ conversation: 1, createdAt: 1 });
messageSchema.index({ conversation: 1, sender: 1, clientMessageId: 1 }, {
  unique: true, partialFilterExpression: { clientMessageId: { $type: 'string' } }
});

// Automatically update conversation's lastMessage when a new message is saved
messageSchema.post('save', async function (doc) {
  // Supplier messages update lastMessage with an ordered conditional write.
  if (doc.clientMessageId) return;
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
