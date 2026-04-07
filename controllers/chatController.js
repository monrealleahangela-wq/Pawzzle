const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const User = require('../models/User');

// Get all conversations for the current user
const getConversations = async (req, res) => {
  try {
    console.log('💬 getConversations called for user:', req.user._id, 'Role:', req.user.role);

    // Filter to only show conversations with at least one message
    let filter = {
      'participants.user': req.user._id,
      'lastMessage.content': { $exists: true, $ne: null }
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
      const conversationsWithUnread = await Promise.all(
        adminConversations.map(async (conv) => {
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
    const conversationsWithUnread = await Promise.all(
      conversations.map(async (conv) => {
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

    // Filter to only show conversations with at least one message
    let filter = { 'lastMessage.content': { $exists: true, $ne: null } };

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

      const conversationsWithUnread = await Promise.all(
        adminConversations.map(async (conv) => {
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

    const conversationsWithUnread = await Promise.all(
      conversations.map(async (conv) => {
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

    const isParticipant = conversation.participants.some(
      p => p.user.toString() === req.user._id.toString()
    );
    const isAdmin = ['admin', 'super_admin', 'staff'].includes(req.user.role);

    if (!isParticipant && !isAdmin) {
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

    // Verify user is participant or admin/staff
    const isParticipant = conversation.participants.some(
      p => p.user.toString() === req.user._id.toString()
    );
    const isAdmin = ['admin', 'super_admin', 'staff'].includes(req.user.role);

    if (!isParticipant && !isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // If admin is sending and not already a participant, add them
    if (isAdmin && !isParticipant) {
      conversation.participants.push({
        user: req.user._id,
        role: req.user.role
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

    // participantIds should be an array of user IDs to chat with
    // The current user is always added as a participant
    const User = require('../models/User');

    // Build participants array
    const participants = [{
      user: req.user._id,
      role: req.user.role
    }];

    if (participantIds && participantIds.length > 0) {
      for (const id of participantIds) {
        if (id === req.user._id.toString()) continue; // skip self
        const user = await User.findById(id).select('role lastSeen');
        if (user) {
          participants.push({ user: id, role: user.role });
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

module.exports = {
  getConversations,
  getAdminChats,
  getMessages,
  sendMessage,
  createConversation,
  getConversationByPet,
  markAsRead,
  getUnreadCount,
  updateAdoptionStatus
};
