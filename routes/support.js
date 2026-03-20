const express = require('express');
const router = express.Router();
const {
    createSupportMessage,
    getAllSupportMessages,
    updateSupportMessageStatus
} = require('../controllers/supportController');
const { authenticate, superAdminOnly } = require('../middleware/auth');

// Public: Send support message (for account recovery or general guest inquiries)
router.post('/guest', createSupportMessage);

// Private: Super Admin management
router.get('/all', authenticate, superAdminOnly, getAllSupportMessages);
router.patch('/:messageId', authenticate, superAdminOnly, updateSupportMessageStatus);

module.exports = router;
