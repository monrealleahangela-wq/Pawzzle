const express = require('express');
const router = express.Router();
const socialController = require('../controllers/socialController');
const { authenticate } = require('../middleware/auth');

// Following Routes
router.post('/follow', authenticate, socialController.followUser);
router.delete('/follow/:followingId', authenticate, socialController.unfollowUser);
router.get('/followers/:userId', socialController.getFollowers);
router.get('/following/:userId', socialController.getFollowing);

// Favorites Routes
router.post('/favorites/toggle', authenticate, socialController.toggleFavorite);
router.get('/favorites/:userId', socialController.getUserFavorites);
router.get('/favorites/check/:productId', authenticate, socialController.checkFavoriteStatus);

module.exports = router;
