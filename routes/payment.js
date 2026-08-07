const express = require('express');
const router = express.Router();
const { createCheckoutSession, createBookingCheckoutSession, createAdoptionCheckoutSession, handleWebhook, verifyPayment, cancelPayment } = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');

// Create PayMongo Checkout Session
router.post('/create-checkout-session/:orderId', authenticate, createCheckoutSession);
router.post('/create-booking-checkout-session/:bookingId', authenticate, createBookingCheckoutSession);
router.post('/create-adoption-checkout-session/:requestId', authenticate, createAdoptionCheckoutSession);

// PayMongo Webhook
router.post('/webhook', handleWebhook);

// Verify Payment Manually
router.get('/verify/:orderId', authenticate, verifyPayment);
router.post('/cancel/:type/:id', authenticate, cancelPayment);

module.exports = router;
