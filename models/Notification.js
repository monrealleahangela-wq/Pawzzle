const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    type: {
        type: String,
        enum: [
            'order_status',
            'new_order',
            'booking_status',
            'new_booking',
            'store_application',
            'low_stock',
            'system',
            'report',
            'user_action',
            'new_follow',
            'chat_message'
        ],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    relatedId: {
        type: mongoose.Schema.Types.ObjectId, // Can be OrderId, BookingId, etc.
        index: true
    },
    relatedModel: {
        type: String, // 'Order', 'Booking', 'StoreApplication', etc.
        enum: ['Order', 'Booking', 'StoreApplication', 'Inventory', 'Report', 'User', 'Conversation']
    },
    targetUrl: {
        type: String // Optional: Pre-calculated dynamic URL for convenience
    },
    isRead: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    isDeleted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Notification', notificationSchema);
