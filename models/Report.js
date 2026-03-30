const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
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
        enum: ['scam', 'spam', 'harassment', 'fraud', 'suspicious_activity', 'offensive_content', 'inappropriate_behavior', 'fake_account', 'other']
    },
    details: {
        type: String,
        required: true
    },
    evidence: [{
        type: String // URLs to images/screenshots
    }],
    status: {
        type: String,
        enum: ['pending', 'investigating', 'reviewed', 'resolved', 'dismissed', 'action_taken', 'appealed'],
        default: 'pending'
    },
    appeal: {
        content: { type: String, default: '' },
        evidence: [{ type: String }],
        submittedAt: { type: Date },
        status: { 
            type: String, 
            enum: ['none', 'pending', 'reviewed', 'accepted', 'rejected'],
            default: 'none'
        }
    },
    adminNotes: {
        type: String,
        default: ''
    },
    actionTaken: {
        type: String,
        enum: ['none', 'warning', 'suspension', 'ban'],
        default: 'none'
    },
    reportType: {
        type: String,
        enum: ['customer_reporting_seller', 'seller_reporting_customer', 'customer_reporting_customer', 'other'],
        default: 'other'
    },
    store: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Store',
        required: false // Optional for customer reports
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

reportSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Report', reportSchema);
