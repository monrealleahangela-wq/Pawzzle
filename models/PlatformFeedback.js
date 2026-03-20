const mongoose = require('mongoose');

const platformFeedbackSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    comment: {
        type: String,
        required: true,
        trim: true,
        maxlength: 2000
    },
    category: {
        type: String,
        enum: ['UI/UX', 'Performance', 'Features', 'Bug Report', 'General', 'Customer Service'],
        default: 'General'
    },
    deviceInfo: {
        browser: String,
        os: String,
        platform: String
    },
    status: {
        type: String,
        enum: ['pending', 'reviewed', 'implemented', 'dismissed'],
        default: 'pending'
    },
    isAdminNote: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    isDeleted: {
        type: Boolean,
        default: false
    }
});

module.exports = mongoose.model('PlatformFeedback', platformFeedbackSchema);
