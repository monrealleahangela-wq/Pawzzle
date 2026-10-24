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
            enum: ['unpaid', 'payment_pending', 'payment_cancelled', 'partially_paid', 'deposit_paid', 'paid_in_full', 'payment_failed', 'refunded', 'awaiting_confirmation', 'refund_review_required', 'no_show_fees_applied'],
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
    pickupAgreement: {
        version: { type: String, trim: true },
        title: { type: String, trim: true },
        accepted: { type: Boolean, default: false },
        acceptedAt: Date,
        acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        termsHash: { type: String, trim: true },
        terms: [{ type: String, trim: true }],
        policy: {
            graceHours: Number,
            cancellationAfterDays: Number,
            minimumContactAttempts: Number,
            dailyCareFee: Number,
            careFeeCapDays: Number,
            noShowFeeRate: Number,
            noShowFeeCap: Number,
            freeReschedules: Number
        },
        acceptanceEvidence: {
            ipHash: { type: String, select: false },
            userAgentHash: { type: String, select: false }
        }
    },
    pickupCompliance: {
        status: {
            type: String,
            enum: ['scheduled', 'pickup_missed', 'rescheduled', 'completed', 'no_show_cancelled'],
            default: 'scheduled'
        },
        scheduledFor: Date,
        missedAt: Date,
        graceEndsAt: Date,
        cancellationEligibleAt: Date,
        rescheduleCount: { type: Number, min: 0, default: 0 },
        contactAttempts: [{
            attemptedAt: { type: Date, default: Date.now },
            attemptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            channel: { type: String, enum: ['chat', 'phone', 'email', 'other'], default: 'chat' },
            note: { type: String, trim: true, maxlength: 500 }
        }],
        settlement: {
            careFeeDays: { type: Number, min: 0, default: 0 },
            careFee: { type: Number, min: 0, default: 0 },
            noShowFee: { type: Number, min: 0, default: 0 },
            statedDeductions: { type: Number, min: 0, default: 0 },
            deductionTotal: { type: Number, min: 0, default: 0 },
            refundDue: { type: Number, min: 0, default: 0 },
            refundStatus: { type: String, enum: ['not_required', 'review_required', 'processing', 'completed'], default: 'not_required' },
            calculatedAt: Date,
            refundReference: { type: String, trim: true, maxlength: 200 }
        },
        cancelledAt: Date,
        cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        cancellationReason: { type: String, trim: true, maxlength: 1000 }
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
            'pickup_missed',
            'no_show_cancelled',
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
adoptionRequestSchema.index({ status: 1, 'pickupCompliance.cancellationEligibleAt': 1 });

module.exports = mongoose.model('AdoptionRequest', adoptionRequestSchema);
