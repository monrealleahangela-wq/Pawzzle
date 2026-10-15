const Notification = require('../models/Notification');

const notificationQuery = userId => ({ recipient: userId, isDeleted: { $ne: true } });
const unreadQuery = userId => ({ ...notificationQuery(userId), isRead: { $ne: true } });

// Get all notifications for the logged-in user
const getNotifications = async (req, res) => {
    try {
        const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
        const limit = Math.max(1, Math.min(50, Number.parseInt(req.query.limit, 10) || 10));
        const query = notificationQuery(req.user.id);
        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);
        const [total, unreadCount] = await Promise.all([
            Notification.countDocuments(query),
            Notification.countDocuments(unreadQuery(req.user.id))
        ]);

        res.json({ notifications, unreadCount, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Server error while fetching notifications' });
    }
};

// Mark a single notification as read
const markAsRead = async (req, res) => {
    try {
        if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: 'Invalid notification ID' });
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, ...notificationQuery(req.user.id) },
            { isRead: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        res.json({ message: 'Notification marked as read', notification });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Mark all notifications as read for the logged-in user
const markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            unreadQuery(req.user.id),
            { isRead: true }
        );

        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Delete a notification
const deleteNotification = async (req, res) => {
    try {
        if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: 'Invalid notification ID' });
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, ...notificationQuery(req.user.id) },
            { isDeleted: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        res.json({ message: 'Notification deleted' });
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

let notificationSocket = null;
const setNotificationSocket = io => { notificationSocket = io || null; };

// Helper function to create notification (for internal use)
const createNotification = async (data, io = notificationSocket) => {
    try {
        const notification = new Notification(data);
        await notification.save();
        if (io && data.recipient) {
            io.to(`user_${String(data.recipient)}`).emit('newNotification', notification);
        }
        return notification;
    } catch (error) {
        if (error.code === 11000 && data.dedupeKey) return null;
        console.error('Error creating notification:', error);
        return null;
    }
};

/**
 * Notify all staff of a store based on their operational role
 * @param {String} storeId - ID of the store
 * @param {String|Array} staffTypes - One or more staff roles (e.g., 'order_staff')
 * @param {Object} data - Notification template (sender, type, title, message, etc.)
 */
const notifyStoreStaff = async (storeId, staffTypes, data) => {
    try {
        const User = require('../models/User'); // Dynamic import to avoid circular dep
        
        const types = Array.isArray(staffTypes) ? staffTypes : [staffTypes];
        
        // Find all staff matching the roles for this specific store
        const staff = await User.find({
            store: storeId,
            role: 'staff',
            staffType: { $in: types },
            isActive: true,
            isDeleted: false
        });

        // Collect recipients (Staff + the Store Owner)
        const recipients = staff.map(s => s._id);
        
        // Find owner of the store to ensure they are always looped in
        const Store = require('../models/Store');
        const storeDoc = await Store.findById(storeId);
        if (storeDoc && storeDoc.owner) {
            recipients.push(storeDoc.owner);
        }

        // Create unique notifications for all relevant stakeholders
        const uniqueRecipients = [...new Set(recipients.map(id => id.toString()))];
        
        const notificationPromises = uniqueRecipients.map(recipientId => {
            return createNotification({
                ...data,
                recipient: recipientId
            });
        });

        await Promise.all(notificationPromises);
        console.log(`📡 Broadcasted role-based notification to ${uniqueRecipients.length} stakeholders for store ${storeId}`);
    } catch (error) {
        console.error('Error in notifyStoreStaff:', error);
    }
};

module.exports = {
    getNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    createNotification,
    setNotificationSocket,
    notifyStoreStaff
};
