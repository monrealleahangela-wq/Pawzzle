const express = require('express');
const router = express.Router();
const {
    createReview,
    getTargetReviews,
    createPlatformFeedback,
    getAllPlatformFeedback,
    replyToReview,
    getShopReviews,
    checkReviewEligibility,
    toggleReviewStatus
} = require('../controllers/reviewController');
const { authenticate, adminOnly, superAdminOnly, adminOrStaff } = require('../middleware/auth');

// Administrative & Specialized Review Routes
router.get('/platform/all', authenticate, superAdminOnly, getAllPlatformFeedback);
router.get('/shop', authenticate, adminOrStaff, getShopReviews);
router.post('/platform', authenticate, createPlatformFeedback);

// Public/Authenticated Item Review Routes
router.get('/eligibility/:targetType/:targetId', authenticate, checkReviewEligibility);
router.get('/:targetType/:targetId', getTargetReviews);
router.post('/', authenticate, createReview);
router.post('/:reviewId/reply', authenticate, adminOrStaff, replyToReview);
router.patch('/:reviewId/status', authenticate, adminOrStaff, toggleReviewStatus);

module.exports = router;
