const express = require('express');
const router = express.Router();
const {
    createReview,
    getTargetReviews,
    createPlatformFeedback,
    getAllPlatformFeedback,
    updatePlatformFeedbackStatus,
    deletePlatformFeedback,
    replyToReview,
    getShopReviews,
    checkReviewEligibility,
    toggleReviewStatus
} = require('../controllers/reviewController');
const { authenticate, adminOnly, superAdminOnly, adminOrStaff } = require('../middleware/auth');

// Administrative & Specialized Review Routes
router.get('/platform/all', authenticate, superAdminOnly, getAllPlatformFeedback);
router.patch('/platform/:id', authenticate, superAdminOnly, updatePlatformFeedbackStatus);
router.delete('/platform/:id', authenticate, superAdminOnly, deletePlatformFeedback);
router.get('/shop', authenticate, adminOrStaff, getShopReviews);
router.post('/platform', authenticate, createPlatformFeedback);

// Public/Authenticated Item Review Routes
router.get('/eligibility/:targetType/:targetId', authenticate, checkReviewEligibility);
router.get('/:targetType/:targetId', getTargetReviews);
router.post('/', authenticate, createReview);
router.post('/:reviewId/reply', authenticate, adminOrStaff, replyToReview);
router.patch('/:reviewId/status', authenticate, adminOrStaff, toggleReviewStatus);

module.exports = router;
