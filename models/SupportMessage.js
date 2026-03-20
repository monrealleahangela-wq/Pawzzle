const mongoose = require('mongoose');

const supportMessageSchema = new mongoose.Schema({
    email: { type: String, required: true },
    subject: { type: String, default: 'Account Recovery' },
    message: { type: String, required: true },
    status: { type: String, enum: ['pending', 'in_review', 'resolved', 'closed'], default: 'pending' },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    adminNotes: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

supportMessageSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('SupportMessage', supportMessageSchema);
