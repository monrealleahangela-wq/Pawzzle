const express = require('express');
const router = express.Router();
const { createCheckoutSession, handleWebhook } = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');

// Create PayMongo Checkout Session
router.post('/create-checkout-session/:orderId', authenticate, createCheckoutSession);

// PayMongo Webhook
router.post('/webhook', handleWebhook);

module.exports = router;
