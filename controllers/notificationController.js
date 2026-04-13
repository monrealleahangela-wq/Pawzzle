const Notification = require('../models/Notification');

// Get all notifications for the logged-in user
const getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ recipient: req.user.id, isDeleted: { $ne: true } })
            .sort({ createdAt: -1 })
            .limit(50);

        res.json({ notifications });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Server error while fetching notifications' });
    }
};

// Mark a single notification as read
const markAsRead = async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, recipient: req.user.id },
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
            { recipient: req.user.id, isRead: false },
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
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, recipient: req.user.id },
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

// Helper function to create notification (for internal use)
const createNotification = async (data) => {
    try {
        const notification = new Notification(data);
        await notification.save();
        return notification;
    } catch (error) {
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
    notifyStoreStaff
};
