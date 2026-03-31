const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    targetType: {
        type: String,
        enum: ['Product', 'Pet', 'Store', 'Service', 'PetProfile'],
        required: true
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'targetType'
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order'
    },
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking'
    },
    storeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Store',
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
        maxlength: 1000
    },
    images: [{
        type: String
    }],
    isApproved: {
        type: Boolean,
        default: true
    },
    isAnonymous: {
        type: Boolean,
        default: false
    },
    reply: {
        comment: String,
        createdAt: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    isDeleted: {
        type: Boolean,
        default: false
    }
});

reviewSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

// Compound index to prevent multiple reviews from same user on same target
reviewSchema.index({ user: 1, targetId: 1, targetType: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
