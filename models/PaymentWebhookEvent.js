const mongoose = require('mongoose');

const paymentWebhookEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  eventType: { type: String, required: true },
  status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing', index: true },
  attempts: { type: Number, default: 1 },
  lastError: String,
  processedAt: Date
}, { timestamps: true });

module.exports = mongoose.model('PaymentWebhookEvent', paymentWebhookEventSchema);
