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
        ref: 'User'
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

const cartSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    items: [cartItemSchema],
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
