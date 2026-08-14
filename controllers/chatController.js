const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Booking = require('../models/Booking');
const { hasPermission } = require('../config/permissions');
const Pet = require('../models/Pet');
const Store = require('../models/Store');
const { isPlatformAdmin } = require('../config/permissions');
const {
  canAccessConversation,
  canManageAdoptionConversation,
  normalizeConversationParticipantRole
} = require('../utils/conversationAuthorization');

const canAccessServiceConversation = async (user, conversation) => {
  if (conversation.type !== 'service' || !conversation.booking) return true;
  const booking = await Booking.findById(conversation.booking).populate('store', 'owner');
  if (!booking || booking.isDeleted) return false;
  const userId = String(user._id);
  if (String(booking.customer) === userId) return true;
  if (['super_admin', 'platform_admin'].includes(user.role)) return true;
  if (['admin', 'store_owner'].includes(user.role) && String(booking.store?.owner || '') === userId) return true;
  const sameStore = user.store && String(booking.store?._id || booking.store) === String(user.store);
  if (user.role !== 'staff' || !sameStore) return false;
  return [booking.staff, booking.serviceProvider].some(value => value && String(value) === userId)
    || hasPermission(user, 'bookings.manage');
};

const filterAccessibleServiceConversations = async (user, conversations) => {
  const allowed = await Promise.all(conversations.map(conversation => canAccessConversation(user, conversation)));
  return conversations.filter((_conversation, index) => allowed[index]);
};

// Get all conversations for the current user
const getConversations = async (req, res) => {
  try {
    console.log('💬 getConversations called for user:', req.user._id, 'Role:', req.user.role);

    // Filter to only show conversations with at least one message and NOT archived or deleted
    let filter = {
      'participants.user': req.user._id,
      'lastMessage.content': { $exists: true, $ne: null },
      status: 'active',
      isDeleted: false
    };

    // Multi-tenant isolation for admins/staff: only show conversations related to their store
    if (req.user.role === 'admin' || req.user.role === 'staff') {
      console.log(`🔒 Multi-tenant isolation for ${req.user.role} chats - filtering by store access`);

      // For staff, we MUST use their store. For admins, use store or fallback to addedBy.
      let storeId = req.user.store;
      
      const conversations = await Conversation.find(filter)
        .populate('participants.user', 'firstName lastName email role lastSeen')
        .populate('pet', 'name breed species images price addedBy store')
        .sort({ updatedAt: -1 });

      // Filter conversations to only include those where the pet belongs to this store/admin
      const adminConversations = conversations.filter(conv => {
        // Include conversations without pets (general/support) - maybe?
        // Actually for staff, they probably only care about store-related chats.
        if (!conv.pet) return true;

        if (storeId && conv.pet.store && conv.pet.store.toString() === storeId.toString()) return true;
        if (req.user.role === 'admin' && conv.pet.addedBy && conv.pet.addedBy.toString() === req.user._id.toString()) return true;

        return false;
      });

      console.log('📊 Found conversations:', conversations.length, 'Admin conversations:', adminConversations.length);

      // Add unread count for each conversation
      const accessibleConversations = await filterAccessibleServiceConversations(req.user, adminConversations);
      const conversationsWithUnread = await Promise.all(
        accessibleConversations.map(async (conv) => {
          const unreadCount = await Message.countDocuments({
            conversation: conv._id,
            sender: { $ne: req.user._id },
            read: false
          });
          return { ...conv.toObject(), unreadCount };
        })
      );

      return res.json({ conversations: conversationsWithUnread });
    }

    // For customers and super admins, show all their conversations
    const conversations = await Conversation.find(filter)
      .populate('participants.user', 'firstName lastName email role lastSeen')
      .populate('pet', 'name breed species images price')
      .sort({ updatedAt: -1 });

    // Add unread count for each conversation
    const accessibleConversations = await filterAccessibleServiceConversations(req.user, conversations);
    const conversationsWithUnread = await Promise.all(
      accessibleConversations.map(async (conv) => {
        const unreadCount = await Message.countDocuments({
          conversation: conv._id,
          sender: { $ne: req.user._id },
          read: false
        });
        return { ...conv.toObject(), unreadCount };
      })
    );

    res.json({ conversations: conversationsWithUnread });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all conversations (admin view)
const getAdminChats = async (req, res) => {
  try {
    console.log('💬 getAdminChats called for user:', req.user._id, 'Role:', req.user.role);

    // Filter to only show conversations with at least one message and NOT deleted
    let filter = { 
      'lastMessage.content': { $exists: true, $ne: null },
      isDeleted: false
    };

    // Multi-tenant isolation for admins/staff: only show conversations related to their store
    if (req.user.role === 'admin' || req.user.role === 'staff') {
      console.log(`🔒 Filtering ${req.user.role} chats to their own pets/store/participation`);
      
      let storeId = req.user.store;

      const conversations = await Conversation.find(filter)
        .populate('participants.user', 'firstName lastName email role lastSeen')
        .populate('pet', 'name breed species images price addedBy store')
        .sort({ updatedAt: -1 });

      const adminConversations = conversations.filter(conv => {
        // 1. If the user is a participant, show it
        const isParticipant = conv.participants.some(p =>
          (p.user?._id?.toString() || p.user?.toString()) === req.user._id.toString()
        );
        if (isParticipant) return true;

        // 2. If it's a chat about ONE OF THEIR PETS or their STORE, show it
        if (storeId && conv.pet?.store?.toString() === storeId.toString()) return true;
        if (req.user.role === 'admin' && conv.pet?.addedBy?.toString() === req.user._id.toString()) return true;

        return false;
      });

      console.log('📊 Admin chats found:', adminConversations.length);

      const accessibleConversations = await filterAccessibleServiceConversations(req.user, adminConversations);
      const conversationsWithUnread = await Promise.all(
        accessibleConversations.map(async (conv) => {
          const unreadCount = await Message.countDocuments({
            conversation: conv._id,
            sender: { $ne: req.user._id },
            read: false
          });
          return { ...conv.toObject(), unreadCount };
        })
      );

      return res.json({ conversations: conversationsWithUnread });
    }

    // For Super Admin or other roles (though this is an admin route)
    const conversations = await Conversation.find(filter)
      .populate('participants.user', 'firstName lastName email role lastSeen')
      .populate('pet', 'name breed species images price addedBy')
      .sort({ updatedAt: -1 });

    const accessibleConversations = await filterAccessibleServiceConversations(req.user, conversations);
    const conversationsWithUnread = await Promise.all(
      accessibleConversations.map(async (conv) => {
        const unreadCount = await Message.countDocuments({
          conversation: conv._id,
          sender: { $ne: req.user._id },
          read: false
        });
        return { ...conv.toObject(), unreadCount };
      })
    );

    res.json({ conversations: conversationsWithUnread });
  } catch (error) {
    console.error('Get admin chats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get messages for a conversation
const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;

    // Verify user is participant (or admin)
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!(await canAccessServiceConversation(req.user, conversation))) {
      return res.status(403).json({ message: 'You are no longer authorized to access this service conversation.' });
    }

    if (!(await canAccessConversation(req.user, conversation))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const messages = await Message.find({ conversation: conversationId })
      .populate('sender', 'firstName lastName role lastSeen')
      .sort({ createdAt: 1 });

    res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Send a message
const sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, type } = req.body;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!(await canAccessServiceConversation(req.user, conversation))) {
      return res.status(403).json({ message: 'You are no longer authorized to message about this service.' });
    }

    // Verify user is participant or admin/staff
    const isParticipant = conversation.participants.some(
      p => p.user.toString() === req.user._id.toString()
    );
    if (!(await canAccessConversation(req.user, conversation))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // If admin is sending and not already a participant, add them
    if (!isParticipant) {
      conversation.participants.push({
        user: req.user._id,
        role: normalizeConversationParticipantRole(req.user)
      });
    }

    const message = new Message({
      conversation: conversationId,
      sender: req.user._id,
      content,
      type: type || 'text'
    });

    await message.save();

    // Update conversation last message
    conversation.lastMessage = {
      content: message.type === 'image' ? 'Sent an image' : content,
      type: message.type,
      sender: req.user._id,
      timestamp: message.createdAt
    };
    await conversation.save();

    // Create notifications for other participants
    const otherParticipants = conversation.participants.filter(
      p => p.user.toString() !== req.user._id.toString()
    );

    for (const participant of otherParticipants) {
      try {
        const notification = new Notification({
          recipient: participant.user,
          sender: req.user._id,
          type: 'chat_message',
          title: `New Message from ${req.user.firstName || 'Customer'}`,
          message: message.type === 'image' ? 'Sent an image' : content.substring(0, 50) + (content.length > 50 ? '...' : ''),
          relatedId: conversation._id,
          relatedModel: 'Conversation'
        });
        await notification.save();
      } catch (notifError) {
        console.error('Error creating chat notification:', notifError);
        // Don't fail the message send if notification fails
      }
    }

    // Populate sender info before returning
    await message.populate('sender', 'firstName lastName role lastSeen');

    // Emit real-time message via socket.io
    const io = req.app.get('socketio');
    if (io) {
      io.to(`conversation_${conversationId}`).emit('newMessage', message);
    }

    res.status(201).json({ message });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create a new conversation
const createConversation = async (req, res) => {
  try {
    const { participantIds, petId, type } = req.body;
    if (type === 'service') return res.status(400).json({ message: 'Service conversations must be opened from an authorized booking.' });

    // participantIds should be an array of user IDs to chat with
    // The current user is always added as a participant
    const User = require('../models/User');

    // Build participants array
    const participants = [{
      user: req.user._id,
      role: normalizeConversationParticipantRole(req.user)
    }];

    if (petId) {
      const pet = await Pet.findById(petId).select('addedBy store isDeleted');
      if (!pet || pet.isDeleted) return res.status(404).json({ message: 'Pet not found' });
      if (String(pet.addedBy) === String(req.user._id)) {
        return res.status(400).json({ message: 'Pet owners must reply through an existing customer conversation.' });
      }
      const seller = await User.findById(pet.addedBy).select('role lastSeen');
      if (!seller) return res.status(404).json({ message: 'Pet owner account not found' });
      participants.push({ user: seller._id, role: normalizeConversationParticipantRole(seller) });
    } else if (participantIds && participantIds.length > 0) {
      const uniqueTargets = [...new Set(participantIds.map(String))].filter(id => id !== String(req.user._id));
      if (req.user.role !== 'customer' || uniqueTargets.length !== 1) {
        return res.status(403).json({ message: 'A new conversation must be opened through a legitimate store or pet relationship.' });
      }
      for (const id of uniqueTargets) {
        if (id === req.user._id.toString()) continue; // skip self
        const user = await User.findById(id).select('role lastSeen');
        if (user) {
          const ownsActiveStore = await Store.exists({ owner: user._id, isActive: true, isDeleted: { $ne: true } });
          const isSupportTarget = type === 'support' && isPlatformAdmin(user);
          if (!ownsActiveStore && !isSupportTarget) {
            return res.status(403).json({ message: 'The selected account is not an authorized store or support contact.' });
          }
          participants.push({ user: id, role: normalizeConversationParticipantRole(user) });
        }
      }
    }

    // Check for existing conversation with same participants and pet
    if (petId) {
      const participantUserIds = participants.map(p => p.user.toString());
      const existing = await Conversation.findOne({
        pet: petId,
        'participants.user': { $all: participantUserIds },
        status: 'active'
      });

      if (existing) {
        await existing.populate('participants.user', 'firstName lastName email role lastSeen');
        await existing.populate('pet', 'name breed species images price');
        return res.json({ conversation: existing });
      }
    }

    const conversation = new Conversation({
      participants,
      pet: petId || null,
      type: type || 'general',
      status: 'active'
    });

    await conversation.save();
    await conversation.populate('participants.user', 'firstName lastName email role lastSeen');
    await conversation.populate('pet', 'name breed species images price');

    res.status(201).json({ conversation });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get conversation by pet ID for current user
const getConversationByPet = async (req, res) => {
  try {
    const { petId } = req.params;

    const conversation = await Conversation.findOne({
      pet: petId,
      'participants.user': req.user._id,
      status: 'active'
    })
      .populate('participants.user', 'firstName lastName email role')
      .populate('pet', 'name breed species images price');

    res.json({ conversation: conversation || null });
  } catch (error) {
    console.error('Get conversation by pet error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Mark messages as read
const markAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    if (!(await canAccessConversation(req.user, conversation))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await Message.updateMany(
      {
        conversation: conversationId,
        sender: { $ne: req.user._id },
        read: false
      },
      { read: true }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get total unread count for current user
const getUnreadCount = async (req, res) => {
  try {
    // Get all conversations the user is part of
    const conversations = await Conversation.find({
      'participants.user': req.user._id,
      'lastMessage.content': { $exists: true, $ne: null }
    }).select('_id');

    const conversationIds = conversations.map(c => c._id);

    const count = await Message.countDocuments({
      conversation: { $in: conversationIds },
      sender: { $ne: req.user._id },
      read: false
    });

    res.json({ count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update adoption status on a conversation
const updateAdoptionStatus = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { status } = req.body;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    if (conversation.type === 'service') return res.status(409).json({ message: 'Service conversations cannot be changed through adoption actions.' });
    if (!(await canManageAdoptionConversation(req.user, conversation))) {
      return res.status(403).json({ message: 'Only the pet owner or authorized store owner can update adoption status.' });
    }

    conversation.status = status === 'confirmed' ? 'closed' : conversation.status;
    await conversation.save();

    // Send a system message about the status change
    const systemMessage = new Message({
      conversation: conversationId,
      sender: req.user._id,
      content: status === 'confirmed' ? 'Adoption has been confirmed!' : `Adoption status updated to: ${status}`,
      type: 'system'
    });
    await systemMessage.save();

    res.json({ success: true, status });
  } catch (error) {
    console.error('Update adoption status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Archive a conversation
const archiveConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    if (!(await canAccessConversation(req.user, conversation))) return res.status(403).json({ message: 'Access denied' });
    if (conversation.type === 'service') return res.status(409).json({ message: 'Booking service conversations are retained with the service record.' });
    await Conversation.findByIdAndUpdate(conversationId, { status: 'archived' });
    res.json({ success: true, message: 'Conversation archived' });
  } catch (error) {
    console.error('Archive conversation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Permanently delete a conversation (soft delete)
const deleteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    if (!(await canAccessConversation(req.user, conversation))) return res.status(403).json({ message: 'Access denied' });
    if (conversation.type === 'service') return res.status(409).json({ message: 'Booking service conversations are retained with the service record.' });
    await Conversation.findByIdAndUpdate(conversationId, { isDeleted: true });
    res.json({ success: true, message: 'Conversation deleted' });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Restore an archived conversation
const restoreConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    if (!(await canAccessConversation(req.user, conversation))) return res.status(403).json({ message: 'Access denied' });
    if (conversation.type === 'service') return res.status(409).json({ message: 'Booking service conversations are managed from the booking.' });
    await Conversation.findByIdAndUpdate(conversationId, { status: 'active' });
    res.json({ success: true, message: 'Conversation restored' });
  } catch (error) {
    console.error('Restore conversation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get archived conversations
const getArchivedConversations = async (req, res) => {
  try {
    let filter = {
      'participants.user': req.user._id,
      status: 'archived',
      isDeleted: false
    };

    const conversations = await Conversation.find(filter)
      .populate('participants.user', 'firstName lastName email role lastSeen')
      .populate('pet', 'name breed species images price')
      .sort({ updatedAt: -1 });

    res.json({ conversations });
  } catch (error) {
    console.error('Get archived conversations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getConversations,
  getAdminChats,
  getMessages,
  sendMessage,
  createConversation,
  getConversationByPet,
  markAsRead,
  getUnreadCount,
  updateAdoptionStatus,
  archiveConversation,
  deleteConversation,
  restoreConversation,
  getArchivedConversations
};
