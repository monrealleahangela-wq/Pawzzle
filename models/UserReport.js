const mongoose = require('mongoose');

const UserReportSchema = new mongoose.Schema({
    reporter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reportedUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reason: {
        type: String,
        required: true,
        enum: ['Scamming', 'Harassment', 'Inappropriate Content', 'Fake Account', 'Spam', 'Other']
    },
    description: {
        type: String,
        required: true
    },
    evidence: [{
        type: String // URLs to images/screenshots
    }],
    status: {
        type: String,
        enum: ['pending', 'investigating', 'resolved', 'dismissed'],
        default: 'pending'
    },
    adminNotes: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('UserReport', UserReportSchema);
