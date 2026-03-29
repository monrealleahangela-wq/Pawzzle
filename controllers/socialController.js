const Follow = require('../models/Follow');
const ProductFavorite = require('../models/ProductFavorite');
const User = require('../models/User');
const Product = require('../models/Product');

// Following Logic
const followUser = async (req, res) => {
  try {
    const { followingId } = req.body;
    const followerId = req.user._id;

    if (followerId.toString() === followingId.toString()) {
      return res.status(400).json({ message: 'You cannot follow yourself' });
    }

    const existingFollow = await Follow.findOne({ follower: followerId, following: followingId });
    if (existingFollow) {
      return res.status(400).json({ message: 'Already following this user' });
    }

    const follow = new Follow({ follower: followerId, following: followingId });
    await follow.save();

    res.status(201).json({ message: 'Followed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const unfollowUser = async (req, res) => {
  try {
    const { followingId } = req.params;
    const followerId = req.user._id;

    await Follow.findOneAndDelete({ follower: followerId, following: followingId });

    res.json({ message: 'Unfollowed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getFollowers = async (req, res) => {
  try {
    const { userId } = req.params;
    const followers = await Follow.find({ following: userId })
      .populate('follower', 'firstName lastName username avatar role');
    res.json({ followers: followers.map(f => f.follower) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getFollowing = async (req, res) => {
  try {
    const { userId } = req.params;
    const following = await Follow.find({ follower: userId })
      .populate('following', 'firstName lastName username avatar role');
    res.json({ following: following.map(f => f.following) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Favorites Logic
const toggleFavorite = async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.user._id;

    const existingFavorite = await ProductFavorite.findOne({ user: userId, product: productId });

    if (existingFavorite) {
      await ProductFavorite.findByIdAndDelete(existingFavorite._id);
      return res.json({ message: 'Removed from favorites', isFavorite: false });
    } else {
      const favorite = new ProductFavorite({ user: userId, product: productId });
      await favorite.save();
      return res.status(201).json({ message: 'Added to favorites', isFavorite: true });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getUserFavorites = async (req, res) => {
  try {
    const userId = req.params.userId || req.user._id;
    const favorites = await ProductFavorite.find({ user: userId })
      .populate({
        path: 'product',
        populate: { path: 'store', select: 'name logo' }
      });
    res.json({ favorites: favorites.map(f => f.product).filter(p => p !== null) });
  } catch (error) {
      console.error('getUserFavorites error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const checkFavoriteStatus = async (req, res) => {
    try {
        const { productId } = req.params;
        const exists = await ProductFavorite.exists({ user: req.user._id, product: productId });
        res.json({ isFavorite: !!exists });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  toggleFavorite,
  getUserFavorites,
  checkFavoriteStatus
};
