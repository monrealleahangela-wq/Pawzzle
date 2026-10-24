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
    getPickupPolicy,
    markPickupMissed,
    recordPickupContactAttempt,
    reschedulePickup,
    cancelForPickupNoShow
} = require('../controllers/adoptionController');

// All adoption routes require authentication
router.use(authenticate);

router.get('/pickup-policy', getPickupPolicy);

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

router.patch('/pickup/:requestId/missed', markPickupMissed);
router.post('/pickup/:requestId/contact-attempts', recordPickupContactAttempt);
router.patch('/pickup/:requestId/reschedule', reschedulePickup);
router.patch('/pickup/:requestId/no-show-cancel', cancelForPickupNoShow);

module.exports = router;
