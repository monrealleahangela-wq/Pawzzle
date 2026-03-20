const express = require('express');
const router = express.Router();
const {
    getNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification
} = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');

// All notification routes require authentication
router.use(authenticate);

// GET all notifications for the user
router.get('/', getNotifications);

// PUT mark all as read
router.put('/mark-all-read', markAllAsRead);

// PUT mark specific as read
router.put('/:id/read', markAsRead);

// DELETE notification
router.delete('/:id', deleteNotification);

module.exports = router;
