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
            'chat_message',
            'service_update',
            'schedule_change',
            'service_start',
            'service_complete',
            'supplier_verification',
            'supplier_product_review',
            'purchase_order',
            'supply_alert',
            'delivery_update',
            'restock_alert',
            'attendance_update',
            'leave_update',
            'payroll_update'
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
        enum: ['Order', 'Booking', 'Delivery', 'Store', 'StoreApplication', 'StoreComplianceRequest', 'Inventory', 'Report', 'User', 'Conversation', 'Service', 'Supplier', 'SupplierProduct', 'PurchaseOrder', 'ServiceSupply', 'Attendance', 'AttendanceCorrectionRequest', 'LeaveRequest', 'PayrollPeriod', 'Payslip', 'PetInquiry', 'AdoptionRequest']
    },
    targetUrl: {
        type: String // Optional: Pre-calculated dynamic URL for convenience
    },
    dedupeKey: { type: String, default: undefined },
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

notificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Notification', notificationSchema);
