const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
    store: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Store',
        required: true
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 1
    },
    payoutMethod: {
        type: {
            type: String,
            enum: ['gcash', 'maya', 'bank_transfer'],
            required: true
        },
        accountName: { type: String, required: true },
        accountNumber: { type: String, required: true },
        bankName: String // Required if bank_transfer
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'rejected'],
        default: 'pending'
    },
    referenceNumber: {
        type: String,
        unique: true
    },
    adminNotes: String,
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    processedAt: Date,
    requestedAt: {
        type: Date,
        default: Date.now
    }
});

// Generate a reference number before saving
payoutSchema.pre('save', function (next) {
    if (!this.referenceNumber) {
        this.referenceNumber = 'PAY-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    }
    next();
});

module.exports = mongoose.model('Payout', payoutSchema);
