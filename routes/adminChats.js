const express = require('express');
const router = express.Router();
const { getAdminChats } = require('../controllers/chatController');
const { authenticate, adminOrStaff } = require('../middleware/auth');

// GET /api/admin/chats - get all conversations (admin view)
router.get('/', authenticate, adminOrStaff, getAdminChats);

module.exports = router;
