const express = require('express');
const router = express.Router();

const {
  getConversations,
  getAdminChats,
  getMessages,
  sendMessage,
  createConversation,
  getConversationByPet,
  markAsRead,
  getUnreadCount,
  updateAdoptionStatus
} = require('../controllers/chatController');
const { authenticate } = require('../middleware/auth');

// All chat routes require authentication
router.use(authenticate);

// User routes
router.get('/', getConversations);
router.post('/', createConversation);
router.get('/unread-count', getUnreadCount);
router.get('/pet/:petId', getConversationByPet);
router.get('/:conversationId/messages', getMessages);
router.post('/:conversationId/messages', sendMessage);
router.patch('/:conversationId/read', markAsRead);
router.patch('/:conversationId/adoption-status', updateAdoptionStatus);

module.exports = router;
