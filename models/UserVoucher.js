const mongoose = require('mongoose');

const userVoucherSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    voucher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Voucher',
        required: true
    },
    status: {
        type: String,
        enum: ['claimed', 'used'],
        default: 'claimed'
    },
    claimedAt: {
        type: Date,
        default: Date.now
    },
    usedAt: {
        type: Date
    }
});

// Compound unique index to prevent duplicate claims
userVoucherSchema.index({ user: 1, voucher: 1 }, { unique: true });

module.exports = mongoose.model('UserVoucher', userVoucherSchema);
