const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
    createAdoptionRequest,
    updateAdoptionStatus,
    getMyAdoptionRequests,
    getAdoptionByConversation,
    cancelAdoptionRequest
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

module.exports = router;
