const Review = require('../models/Review');
const PlatformFeedback = require('../models/PlatformFeedback');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Pet = require('../models/Pet');
const Store = require('../models/Store');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const AdoptionRequest = require('../models/AdoptionRequest');

// Create a review for product/pet/store/service
const createReview = async (req, res) => {
    try {
        const { targetType, targetId, rating, comment, images, orderId, isAnonymous } = req.body;
        const userId = req.user._id;

        // TRUSTED REVIEW LOGIC: Verify if user has completed the relevant interaction
        let isTrusted = false;
        let storeId;

            const product = await Product.findById(targetId).populate('store');
            if (!product) return res.status(404).json({ message: 'Product not found' });
            
            // PREVENT SELF-REVIEW: Check if user is the store owner
            if (product.store?.owner?.toString() === userId.toString()) {
                return res.status(403).json({ message: 'Unauthorized: You cannot review your own products.' });
            }
            storeId = product.store?._id || product.store;

            // Check if user has a DELIVERED order with this product
            const deliveredOrder = await Order.findOne({
                customer: userId,
                status: 'delivered',
                'items.itemId': targetId
            });
            if (deliveredOrder) isTrusted = true;
        }
        else if (targetType === 'Pet') {
            const pet = await Pet.findById(targetId).populate('store');
            if (!pet) return res.status(404).json({ message: 'Pet not found' });

            // PREVENT SELF-REVIEW: Check if user is the store owner
            if (pet.store?.owner?.toString() === userId.toString()) {
                return res.status(403).json({ message: 'Unauthorized: You cannot review your own pets.' });
            }
            storeId = pet.store?._id || pet.store;

            // Check if user has a DELIVERED adoption request for this pet
            const successfulAdoption = await AdoptionRequest.findOne({
                customer: userId,
                pet: targetId,
                status: 'delivered'
            });
            if (successfulAdoption) isTrusted = true;
        }
        else if (targetType === 'Service') {
            const service = await Service.findById(targetId).populate('store');
            if (!service) return res.status(404).json({ message: 'Service not found' });

            // PREVENT SELF-REVIEW: Check if user is the store owner
            if (service.store?.owner?.toString() === userId.toString()) {
                return res.status(403).json({ message: 'Unauthorized: You cannot review your own services.' });
            }
            storeId = service.store?._id || service.store;

            // Check if user has a COMPLETED booking for this service
            const completedBooking = await Booking.findOne({
                customer: userId,
                service: targetId,
                status: 'completed'
            });
            if (completedBooking) isTrusted = true;
        }
        else if (targetType === 'Store') {
            const store = await Store.findById(targetId);
            if (!store) return res.status(404).json({ message: 'Store not found' });

            // PREVENT SELF-REVIEW: Check if user is the store owner
            if (store.owner?.toString() === userId.toString()) {
                return res.status(403).json({ message: 'Unauthorized: You cannot review your own store.' });
            }
            storeId = targetId;
            // Check for ANY completed transaction with this store
            const [order, booking, adoption] = await Promise.all([
                Order.findOne({ customer: userId, store: storeId, status: 'delivered' }),
                Booking.findOne({ customer: userId, store: storeId, status: 'completed' }),
                AdoptionRequest.findOne({ customer: userId, seller: storeId, status: 'delivered' }) // Check via store's owner
            ]);

            if (order || booking || adoption) isTrusted = true;
        }

        if (!isTrusted) {
            return res.status(403).json({
                message: `Verification Failed: You can only review ${targetType.toLowerCase()}s after a completed purchase, booking, or adoption.`
            });
        }

        if (!storeId) {
            return res.status(400).json({ message: 'Target store not found' });
        }

        const review = new Review({
            user: userId,
            targetType,
            targetId,
            storeId,
            rating,
            comment,
            images,
            orderId,
            isAnonymous: !!isAnonymous
        });

        await review.save();

        // Update target rating
        let Model;
        if (targetType === 'Product') Model = Product;
        else if (targetType === 'Pet') Model = Pet;
        else if (targetType === 'Service') Model = Service;
        else if (targetType === 'Store') Model = Store;

        if (Model) {
            const target = await Model.findById(targetId);
            if (target) {
                const currentCount = target.ratings?.count || 0;
                const currentAverage = target.ratings?.average || 0;

                const newCount = currentCount + 1;
                const newAverage = ((currentAverage * currentCount) + rating) / newCount;

                await Model.findByIdAndUpdate(targetId, {
                    'ratings.average': newAverage,
                    'ratings.count': newCount
                });
            }
        }

        const reviewResponse = review.toObject();
        if (reviewResponse.isAnonymous) {
            delete reviewResponse.user;
        }

        res.status(201).json({ message: 'Review submitted successfully', review: reviewResponse });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: 'You have already reviewed this item' });
        }
        console.error('Create review error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get all reviews for a specific shop (Seller only)
const getShopReviews = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;

        // Find store for this user (admin owns it, staff is assigned to it)
        let store;
        if (req.user.role === 'admin') {
            store = await Store.findOne({ owner: req.user._id });
        } else if (req.user.role === 'staff' && req.user.store) {
            store = await Store.findById(req.user.store);
        } else if (req.user.role === 'super_admin') {
            // Super admins don't have a single store to filter by in this context
            // or they might need a specific storeId param. 
            // For now, let's keep existing logic or handle as needed.
            store = await Store.findOne({ owner: req.user._id }); 
        }

        if (!store) {
            return res.status(404).json({ message: 'Store not found' });
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const rawReviews = await Review.find({ storeId: store._id })
            .populate('user', 'firstName lastName avatar username')
            .populate('targetId')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const reviews = rawReviews.map(review => {
            const r = review.toObject();
            if (r.isAnonymous) {
                delete r.user; // Ensure user data is NOT sent over the wire
            }
            return r;
        });

        const total = await Review.countDocuments({ storeId: store._id });

        res.json({
            reviews,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalReviews: total
            }
        });
    } catch (error) {
        console.error('Get shop reviews error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get reviews for a specific target (Product/Pet/Store)
const getTargetReviews = async (req, res) => {
    try {
        const { targetId, targetType } = req.params;
        const { page = 1, limit = 10 } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const rawReviews = await Review.find({ targetId, targetType, isApproved: true })
            .populate('user', 'firstName lastName avatar username')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const reviews = rawReviews.map(review => {
            const r = review.toObject();
            if (r.isAnonymous) {
                delete r.user; // Ensure user data is NOT sent over the wire
            }
            return r;
        });

        const total = await Review.countDocuments({ targetId, targetType, isApproved: true });

        res.json({
            reviews,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalReviews: total
            }
        });
    } catch (error) {
        console.error('Get reviews error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Create platform feedback
const createPlatformFeedback = async (req, res) => {
    try {
        const { rating, comment, category, deviceInfo } = req.body;

        const feedback = new PlatformFeedback({
            user: req.user._id,
            rating,
            comment,
            category,
            deviceInfo
        });

        await feedback.save();
        res.status(201).json({ message: 'Feedback submitted. Thank you!', feedback });
    } catch (error) {
        console.error('Platform feedback error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Admin: Get all platform feedback
const getAllPlatformFeedback = async (req, res) => {
    try {
        const { category, status, page = 1, limit = 10 } = req.query;
        let filter = {};
        if (category) filter.category = category;
        if (status) filter.status = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const feedbacks = await PlatformFeedback.find(filter)
            .populate('user', 'firstName lastName email username')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await PlatformFeedback.countDocuments(filter);

        res.json({
            feedbacks,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalFeedbacks: total
            }
        });
    } catch (error) {
        console.error('Get platform feedback error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Check if user is eligible to review a target
const checkReviewEligibility = async (req, res) => {
    try {
        const { targetType, targetId } = req.params;
        const userId = req.user._id;

        let isEligible = false;

        if (targetType === 'Product') {
            const product = await Product.findById(targetId).populate('store');
            // If user is owner, they are NOT eligible regardless of orders
            if (product?.store?.owner?.toString() === userId.toString()) {
                return res.json({ isEligible: false });
            }

            const deliveredOrder = await Order.findOne({
                customer: userId,
                status: 'delivered',
                'items.itemId': targetId
            });
            if (deliveredOrder) isEligible = true;
        }
        else if (targetType === 'Pet') {
            const pet = await Pet.findById(targetId).populate('store');
            if (pet?.store?.owner?.toString() === userId.toString()) {
                return res.json({ isEligible: false });
            }

            const successfulAdoption = await AdoptionRequest.findOne({
                customer: userId,
                pet: targetId,
                status: 'delivered'
            });
            if (successfulAdoption) isEligible = true;
        }
        else if (targetType === 'Service') {
            const service = await Service.findById(targetId).populate('store');
            if (service?.store?.owner?.toString() === userId.toString()) {
                return res.json({ isEligible: false });
            }

            const completedBooking = await Booking.findOne({
                customer: userId,
                service: targetId,
                status: 'completed'
            });
            if (completedBooking) isEligible = true;
        }
        else if (targetType === 'Store') {
            const store = await Store.findById(targetId);
            if (store?.owner?.toString() === userId.toString()) {
                return res.json({ isEligible: false });
            }

            const [order, booking, adoption] = await Promise.all([
                Order.findOne({ customer: userId, store: targetId, status: 'delivered' }),
                Booking.findOne({ customer: userId, store: targetId, status: 'completed' }),
                AdoptionRequest.findOne({ customer: userId, seller: targetId, status: 'delivered' })
            ]);
            if (order || booking || adoption) isEligible = true;
        }

        res.json({ isEligible });
    } catch (error) {
        console.error('Check eligibility error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const replyToReview = async (req, res) => {
    try {
        const { comment } = req.body;
        const review = await Review.findById(req.params.reviewId);

        if (!review) {
            return res.status(404).json({ message: 'Review not found' });
        }

        // Only the store owner or super admin can reply
        // We'd need to verify the storeId of the review matching the user's store
        // For now, basic implementation:
        review.reply = {
            comment,
            createdAt: new Date()
        };

        await review.save();
        res.json({ message: 'Reply sent successfully', review });
    } catch (error) {
        console.error('Reply to review error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
const toggleReviewStatus = async (req, res) => {
    try {
        const review = await Review.findById(req.params.reviewId);
        if (!review) return res.status(404).json({ message: 'Review not found' });

        review.isApproved = !review.isApproved;
        await review.save();

        res.json({ message: `Review ${review.isApproved ? 'approved' : 'rejected'} successfully`, review });
    } catch (error) {
        console.error('Toggle review status error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const updatePlatformFeedbackStatus = async (req, res) => {
    try {
        const { status, isAdminNote } = req.body;
        const feedback = await PlatformFeedback.findById(req.params.id);
        if (!feedback) return res.status(404).json({ message: 'Feedback not found' });

        if (status) feedback.status = status;
        if (isAdminNote !== undefined) feedback.isAdminNote = isAdminNote;

        await feedback.save();
        res.json({ message: 'Feedback status updated successfully', feedback });
    } catch (error) {
        console.error('Update platform feedback error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const deletePlatformFeedback = async (req, res) => {
    try {
        const feedback = await PlatformFeedback.findById(req.params.id);
        if (!feedback) return res.status(404).json({ message: 'Feedback not found' });

        // Soft delete
        feedback.isDeleted = true;
        await feedback.save();

        res.json({ message: 'Feedback deleted successfully' });
    } catch (error) {
        console.error('Delete platform feedback error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    createReview,
    getShopReviews,
    getTargetReviews,
    createPlatformFeedback,
    getAllPlatformFeedback,
    updatePlatformFeedbackStatus,
    deletePlatformFeedback,
    replyToReview,
    checkReviewEligibility,
    toggleReviewStatus
};
