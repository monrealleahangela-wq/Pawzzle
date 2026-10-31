const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
    itemId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        // Refers dynamically to Pet, Product, or Service depending on itemType
        refPath: 'items.itemType'
    },
    itemType: {
        type: String,
        required: true,
        enum: ['pet', 'product', 'service']
    },
    productVariant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProductVariant',
        default: undefined
    },
    variantSnapshot: {
        sku: String,
        attributes: [{ code: String, label: String, valueCode: String, valueLabel: String }],
        image: String,
        weight: Number,
        weightUnit: String
    },
    requiresReselection: { type: Boolean, default: false },
    name: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    selected: {
        type: Boolean,
        default: true
    },
    image: {
        type: String,
        default: null
    },
    storeName: {
        type: String,
        default: null
    },
    storeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Store'
    },
    storeAddress: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    addedAt: {
        type: Date,
        default: Date.now
    }
});

cartItemSchema.index({ itemType: 1, itemId: 1, productVariant: 1 });

const cartSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    items: [cartItemSchema],
    processedCheckoutKeys: [{
        key: { type: String, required: true },
        processedAt: { type: Date, default: Date.now }
    }],
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

cartSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Cart', cartSchema);
