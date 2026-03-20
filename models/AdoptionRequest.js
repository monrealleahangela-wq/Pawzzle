const mongoose = require('mongoose');

const adoptionRequestSchema = new mongoose.Schema({
    pet: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Pet',
        required: true
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    store: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Store'
    },
    conversation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'reserved', 'approved', 'rejected', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled'],
        default: 'pending'
    },
    notes: {
        type: String,
        default: ''
    },
    history: [{
        status: String,
        updatedAt: {
            type: Date,
            default: Date.now
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        reason: String
    }],
    isDeleted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Index for performance
adoptionRequestSchema.index({ pet: 1, customer: 1 }, { unique: true });
adoptionRequestSchema.index({ seller: 1, status: 1 });
adoptionRequestSchema.index({ customer: 1, status: 1 });

module.exports = mongoose.model('AdoptionRequest', adoptionRequestSchema);
