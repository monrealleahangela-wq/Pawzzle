const router = require('express').Router();
const { authenticate, requirePasswordChangeCompleted } = require('../middleware/auth');
const controller = require('../controllers/supplierChatController');
const { supplierChatRateLimit } = require('../middleware/supplierChatRateLimit');

router.use(authenticate, requirePasswordChangeCompleted);
router.get('/conversations', controller.listConversations);
router.post('/conversations', supplierChatRateLimit(20), controller.createConversation);
router.get('/conversations/:id/messages', controller.listMessages);
router.post('/conversations/:id/messages', supplierChatRateLimit(30), controller.sendMessage);
router.patch('/conversations/:id/read', controller.markRead);

module.exports = router;
