const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
    createAdoptionRequest,
    updateAdoptionStatus,
    getMyAdoptionRequests,
    getAdoptionByConversation,
    cancelAdoptionRequest,
    sendPaymentRequest,
    updatePaymentStatus
} = require('../controllers/adoptionController');

// All adoption routes require authentication
router.use(authenticate);

// Request adoption (customer)
router.post('/request', createAdoptionRequest);

// Update status (seller/admin)
router.patch('/status/:requestId', updateAdoptionStatus);

// Cancel adoption (customer)
router.patch('/cancel/:requestId', cancelAdoptionRequest);

// List requests for user (customer or seller)
router.get('/my-requests', getMyAdoptionRequests);

// Find adoption status by conversation
router.get('/conversation/:conversationId', getAdoptionByConversation);

// Payment Requests
router.post('/payment-request/:requestId', sendPaymentRequest);
router.patch('/payment-status/:requestId', updatePaymentStatus);

module.exports = router;
