const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    targetType: {
        type: String,
        enum: ['Product', 'Pet', 'Store', 'Service', 'PetProfile', 'Booking', 'Delivery'],
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
    orderItemId: {
        type: mongoose.Schema.Types.ObjectId
    },
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking'
    },
    deliveryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Delivery'
    },
    serviceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service'
    },
    staffId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
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
        default: '',
        trim: true,
        maxlength: 1000
    },
    complimentTags: [{
        type: String,
        enum: ['friendly', 'professional', 'gentle_with_pets', 'fast_service', 'clean_facility']
    }],
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
}, {
    // Production review-index changes are performed by the guarded maintenance
    // script. Tests and local development still create indexes normally.
    autoIndex: process.env.NODE_ENV !== 'production'
});

reviewSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

// Product reviews are purchase-line scoped. A customer may review distinct
// products in one order and the same product again after a later purchase.
reviewSchema.index(
    { user: 1, targetType: 1, orderId: 1, orderItemId: 1 },
    {
        name: 'review_product_order_item_unique',
        unique: true,
        partialFilterExpression: {
            targetType: 'Product',
            orderId: { $type: 'objectId' },
            orderItemId: { $type: 'objectId' }
        }
    }
);
// Existing lifetime policies for non-product targets remain independent from
// product-order reviews.
reviewSchema.index(
    { user: 1, targetId: 1, targetType: 1 },
    {
        name: 'review_non_product_user_target_unique',
        unique: true,
        partialFilterExpression: {
            targetType: { $in: ['Store', 'Pet', 'Service', 'PetProfile'] }
        }
    }
);
reviewSchema.index(
    { user: 1, orderId: 1, targetId: 1 },
    {
        name: 'review_product_legacy_lookup',
        partialFilterExpression: {
            targetType: 'Product',
            orderId: { $type: 'objectId' }
        }
    }
);
reviewSchema.index(
    { bookingId: 1, staffId: 1 },
    { unique: true, partialFilterExpression: { targetType: 'Booking' } }
);
reviewSchema.index(
    { deliveryId: 1, staffId: 1 },
    { unique: true, partialFilterExpression: { targetType: 'Delivery' } }
);

module.exports = mongoose.model('Review', reviewSchema);
