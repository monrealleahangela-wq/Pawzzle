import api from './apiService';

// Chat services — all backed by real API endpoints
export const chatService = {
  // Get all conversations for current user
  getConversations: async () => {
    const response = await api.get('/chats');
    return response;
  },

  // Get messages for a specific conversation
  getMessages: async (conversationId) => {
    const response = await api.get(`/chats/${conversationId}/messages`);
    return response;
  },

  // Send a message
  sendMessage: async (conversationId, messageData) => {
    const response = await api.post(`/chats/${conversationId}/messages`, {
      content: messageData.content,
      type: messageData.type || 'text'
    });
    return response;
  },

  // Create new conversation
  createConversation: async (conversationData) => {
    const response = await api.post('/chats', conversationData);
    return response;
  },

  // Mark messages as read
  markAsRead: async (conversationId) => {
    const response = await api.patch(`/chats/${conversationId}/read`);
    return response;
  },

  // Get unread count
  getUnreadCount: async () => {
    const response = await api.get('/chats/unread-count');
    return response;
  },

  // Get conversation by pet ID
  getConversationByPet: async (petId) => {
    const response = await api.get(`/chats/pet/${petId}`);
    return response;
  },

  // Get all conversations for admin (all customer-seller chats)
  getAdminChats: async () => {
    const response = await api.get('/admin/chats');
    return response;
  },

  // Update adoption status
  updateAdoptionStatus: async (conversationId, status) => {
    const response = await api.patch(`/chats/${conversationId}/adoption-status`, { status });
    return response;
  },

  // Admin send message (uses the same endpoint — auth determines access)
  adminSendMessage: async (conversationId, messageData) => {
    return chatService.sendMessage(conversationId, messageData);
  },
  
  // Get archived conversations
  getArchivedConversations: async () => {
    const response = await api.get('/chats/archived');
    return response;
  },

  // Archive conversation
  archiveConversation: async (conversationId) => {
    const response = await api.patch(`/chats/${conversationId}/archive`);
    return response;
  },

  // Delete conversation
  deleteConversation: async (conversationId) => {
    const response = await api.delete(`/chats/${conversationId}`);
    return response;
  },

  // Restore conversation
  restoreConversation: async (conversationId) => {
    const response = await api.patch(`/chats/${conversationId}/restore`);
    return response;
  }
};
