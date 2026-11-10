const mongoose = require('mongoose');

const storeSubscriptionPaymentSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  previousTier: { type: String, required: true },
  targetTier: { type: String, enum: ['starter', 'growth', 'professional'], required: true },
  planSnapshot: {
    name: { type: String, required: true },
    monthlyPrice: { type: Number, required: true, min: 0 },
    listingLimit: { type: Number, default: null },
    staffLimit: { type: Number, required: true, min: 0 },
    termDays: { type: Number, required: true, min: 1 },
    features: [{ type: String }]
  },
  amount: { type: Number, required: true, min: 0 },
  amountCentavos: { type: Number, required: true, min: 1 },
  currency: { type: String, enum: ['PHP'], default: 'PHP' },
  status: {
    type: String,
    enum: ['pending_payment', 'paid', 'failed', 'cancelled', 'expired'],
    default: 'pending_payment',
    index: true
  },
  activeKey: { type: String },
  periodStart: Date,
  periodEnd: Date,
  paymentDetails: {
    provider: { type: String, enum: ['paymongo'], default: 'paymongo' },
    sessionId: String,
    checkoutUrl: String,
    sessionStatus: { type: String, enum: ['active', 'expired', 'paid', 'failed'] },
    sessionVersion: { type: Number, default: 1 },
    sessionCreatedAt: Date,
    paymentId: String,
    paymentIntentId: String,
    paidAt: Date,
    failureReason: String
  }
}, { timestamps: true });

storeSubscriptionPaymentSchema.index(
  { activeKey: 1 },
  { unique: true, partialFilterExpression: { activeKey: { $type: 'string' } }, name: 'store_subscription_active_checkout_unique' }
);
storeSubscriptionPaymentSchema.index(
  { 'paymentDetails.sessionId': 1 },
  { unique: true, partialFilterExpression: { 'paymentDetails.sessionId': { $type: 'string' } }, name: 'store_subscription_session_unique' }
);
storeSubscriptionPaymentSchema.index(
  { 'paymentDetails.paymentId': 1 },
  { unique: true, partialFilterExpression: { 'paymentDetails.paymentId': { $type: 'string' } }, name: 'store_subscription_payment_unique' }
);

module.exports = mongoose.model('StoreSubscriptionPayment', storeSubscriptionPaymentSchema);
