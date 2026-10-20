const mongoose = require('mongoose');

const sessionHistorySchema = new mongoose.Schema({
  sessionId: String,
  checkoutUrl: String,
  status: { type: String, enum: ['active', 'expired'] },
  createdAt: Date
}, { _id: false });

const orderCheckoutBatchSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true }],
  totalAmount: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ['pending_payment', 'paid', 'payment_failed', 'cancelled'],
    default: 'pending_payment'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'cancelled'],
    default: 'pending'
  },
  paymentMethod: { type: String, enum: ['paymongo'], default: 'paymongo' },
  paymentDetails: {
    sessionId: String,
    checkoutUrl: String,
    sessionStatus: { type: String, enum: ['active', 'expired'] },
    sessionVersion: { type: Number, default: 0 },
    sessionCreatedAt: Date,
    sessionHistory: [sessionHistorySchema],
    paymentIntentId: String,
    paymentId: String,
    sourceType: String,
    amountPaid: Number,
    transactionDate: Date,
    failureReason: String
  }
}, { timestamps: true });

module.exports = mongoose.model('OrderCheckoutBatch', orderCheckoutBatchSchema);
