const mongoose = require('mongoose');

const adoptionRequestSchema = new mongoose.Schema({
    purchaseRequestId: {
        type: String,
        trim: true,
        maxlength: 120
    },
    purchaseFingerprint: {
        type: String,
        select: false
    },
    isActivePurchase: {
        type: Boolean,
        default: true
    },
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
    paymentDetails: {
        method: {
            type: String,
            enum: ['gcash', 'maya', 'bank_transfer', 'cash_on_pickup', 'paymongo']
        },
        paymentStatus: {
            type: String,
            enum: ['unpaid', 'payment_pending', 'payment_cancelled', 'partially_paid', 'deposit_paid', 'paid_in_full', 'payment_failed', 'refunded', 'awaiting_confirmation'],
            default: 'unpaid'
        },
        pricingBreakdown: {
            totalPrice: Number,
            depositAmount: { type: Number, default: 0 },
            paidAmount: { type: Number, default: 0 },
            balanceDue: { type: Number, default: 0 }
        },
        paymentProof: String, // URL to receipt photo
        sessionId: String,
        checkoutUrl: String,
        sessionStatus: { type: String, enum: ['active', 'expired'] },
        sessionVersion: { type: Number, default: 0 },
        sessionCreatedAt: Date,
        sessionHistory: [{
            sessionId: String,
            checkoutUrl: String,
            status: { type: String, enum: ['active', 'expired'] },
            createdAt: Date
        }],
        paidAmount: { type: Number, default: 0 },
        paidAt: Date,
        history: [{
            status: String,
            amount: Number,
            paymentId: String,
            description: String,
            timestamp: { type: Date, default: Date.now }
        }]
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
    refundPolicySnapshot: {
        type: {
            type: String,
            enum: ['full_refund', 'conditional_refund', 'no_refund']
        },
        summary: String,
        conditions: String,
        capturedAt: Date
    },
    refundPolicyAcknowledgment: {
        required: { type: Boolean, default: false },
        acknowledged: { type: Boolean, default: false },
        acknowledgedAt: Date,
        acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
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
// Index for performance (Removed unique constraint to allow re-inquiring after cancellation)
adoptionRequestSchema.index({ pet: 1, customer: 1 });
adoptionRequestSchema.index(
    { customer: 1, purchaseRequestId: 1 },
    { unique: true, partialFilterExpression: { purchaseRequestId: { $type: 'string' } } }
);
adoptionRequestSchema.index(
    { pet: 1, customer: 1, isActivePurchase: 1 },
    { unique: true, partialFilterExpression: { isActivePurchase: true } }
);
adoptionRequestSchema.index({ seller: 1, status: 1 });
adoptionRequestSchema.index({ customer: 1, status: 1 });

module.exports = mongoose.model('AdoptionRequest', adoptionRequestSchema);
