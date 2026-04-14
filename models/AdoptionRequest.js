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
    // Structured Inquiry Form Data
    inquiryData: {
        fullName: String,
        contactNumber: String,
        cityArea: String,
        preferredPickupDate: Date,
        interestReason: String,
        previousExperience: String,
        pickupConfirmation: { type: Boolean, default: false }
    },
    // Scheduling
    scheduling: {
        confirmedDate: Date,
        timeSlot: String,
        notes: String
    },
    status: {
        type: String,
        enum: [
            'inquiry_submitted', 
            'under_review', 
            'reserved', 
            'approved', 
            'pickup_scheduling', 
            'pickup_confirmed', 
            'completed', 
            'cancelled', 
            'declined', 
            'expired'
        ],
        default: 'inquiry_submitted'
    },
    notes: {
        type: String,
        default: ''
    },
    history: [{
        status: String,
        description: String,
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
    reservationExpiresAt: Date,
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
