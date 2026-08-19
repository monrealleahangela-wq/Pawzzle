const Review = require('../models/Review');
const PlatformFeedback = require('../models/PlatformFeedback');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Pet = require('../models/Pet');
const Store = require('../models/Store');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const AdoptionRequest = require('../models/AdoptionRequest');
const User = require('../models/User');
const { canOperateStore } = require('../utils/authorizationPolicy');
const resolveStore = require('../utils/resolveStore');
const { isOperationalStaff } = require('../config/permissions');

const STAFF_COMPLIMENT_TAGS = new Set(['friendly', 'professional', 'gentle_with_pets', 'fast_service', 'clean_facility']);

// Store-profile reviews are intentionally limited to one review per customer
// and store. Keep this eligibility check shared by the button preflight and
// review creation so the interface cannot offer an action the API will deny.
const getStoreReviewEligibility = async (userId, storeId) => {
    const store = await Store.findById(storeId).select('owner');
    if (!store) return { isEligible: false, reason: 'store_not_found' };
    if (String(store.owner) === String(userId)) return { isEligible: false, reason: 'own_store' };

    const existingReview = await Review.exists({
        user: userId,
        targetType: 'Store',
        targetId: storeId
    });
    if (existingReview) return { isEligible: false, reason: 'already_reviewed' };

    const [order, booking, adoption] = await Promise.all([
        Order.findOne({ customer: userId, store: storeId, status: { $in: ['delivered', 'completed'] }, 'reviewStatus.isRated': { $ne: true } }).select('_id'),
        Booking.findOne({ customer: userId, store: storeId, status: 'completed', 'reviewStatus.isRated': { $ne: true } }).select('_id'),
        AdoptionRequest.findOne({ customer: userId, seller: storeId, status: 'delivered' }).select('_id')
    ]);

    return {
        isEligible: Boolean(order || booking || adoption),
        reason: order || booking || adoption ? null : 'no_completed_transaction'
    };
};

const refreshStaffRating = async staffId => {
    if (!staffId) return;
    const [summary] = await Review.aggregate([
        { $match: { targetType: 'Booking', staffId, isApproved: true, isDeleted: { $ne: true } } },
        { $group: { _id: '$staffId', average: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);
    await User.findByIdAndUpdate(staffId, {
        'professionalProfile.rating': summary ? Number(summary.average.toFixed(2)) : 0,
        'professionalProfile.reviewCount': summary?.count || 0
    });
};

// Create a review for product/pet/store/service
const createReview = async (req, res) => {
    try {
        const { targetType, targetId, rating, comment, images, orderId, bookingId, isAnonymous, complimentTags } = req.body;
        const userId = req.user._id;
        const numericRating = Number(rating);
        if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
            return res.status(400).json({ message: 'Rating must be a whole number from 1 to 5.' });
        }
        if (String(comment || '').length > 1000) return res.status(400).json({ message: 'Review text must be 1000 characters or fewer.' });
        const normalizedCompliments = [...new Set(Array.isArray(complimentTags) ? complimentTags : [])];
        if (normalizedCompliments.some(tag => !STAFF_COMPLIMENT_TAGS.has(tag))) {
            return res.status(400).json({ message: 'One or more compliment tags are invalid.' });
        }
        if (targetType !== 'Booking' && normalizedCompliments.length) {
            return res.status(400).json({ message: 'Compliment tags are only available for completed staff services.' });
        }

        // TRUSTED REVIEW LOGIC: Verify if user has completed the relevant interaction
        let isTrusted = false;
        let storeId;
        let staffId;
        let serviceId;

        if (targetType === 'Product') {
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
        else if (targetType === 'Booking') {
            if (!bookingId || String(bookingId) !== String(targetId)) {
                return res.status(400).json({ message: 'A valid completed booking is required for a staff review.' });
            }
            const completedBooking = await Booking.findOne({
                _id: bookingId,
                customer: userId,
                status: 'completed',
                paymentStatus: 'paid',
                'reviewStatus.isRated': { $ne: true }
            });
            if (!completedBooking) {
                return res.status(403).json({ message: 'You can only review a paid, completed booking that has not already been reviewed.' });
            }
            staffId = completedBooking.serviceProvider || completedBooking.staff;
            if (!staffId) return res.status(409).json({ message: 'The staff member who provided this service was not recorded.' });
            serviceId = completedBooking.service;
            storeId = completedBooking.store;
            isTrusted = true;
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
            const storeEligibility = await getStoreReviewEligibility(userId, targetId);
            if (storeEligibility.reason === 'store_not_found') return res.status(404).json({ message: 'Store not found' });
            if (!storeEligibility.isEligible) {
                return res.status(403).json({
                    message: storeEligibility.reason === 'already_reviewed'
                        ? 'You have already reviewed this store.'
                        : 'Complete a purchase or service from this store before leaving a review.'
                });
            }
            storeId = targetId;
            isTrusted = true;
        }

        if (!isTrusted) {
            return res.status(403).json({
                message: `Verification Failed: You can only review ${targetType.toLowerCase()}s after a completed purchase, booking, or adoption.`
            });
        }

        if (!storeId) {
            return res.status(400).json({ message: 'Target store not found' });
        }

        // Optional source IDs must point to the same completed transaction used to
        // qualify this review; never let a review mark an unrelated record as rated.
        if (orderId) {
            const sourceOrder = await Order.findOne({ _id: orderId, customer: userId, status: 'delivered' });
            const matchesTarget = sourceOrder
                && String(sourceOrder.store) === String(storeId)
                && (targetType === 'Store'
                    || (targetType === 'Product' && sourceOrder.items?.some(item => String(item.itemId) === String(targetId))));
            if (!matchesTarget) return res.status(403).json({ message: 'The supplied order does not qualify this review.' });
        }
        if (bookingId && targetType !== 'Booking') {
            const sourceBooking = await Booking.findOne({ _id: bookingId, customer: userId, status: 'completed' });
            const matchesTarget = sourceBooking
                && String(sourceBooking.store) === String(storeId)
                && (targetType === 'Store'
                    || (targetType === 'Service' && String(sourceBooking.service) === String(targetId)));
            if (!matchesTarget) return res.status(403).json({ message: 'The supplied booking does not qualify this review.' });
        }

        const review = new Review({
            user: userId,
            targetType,
            targetId,
            storeId,
            rating: numericRating,
            comment: String(comment || '').trim(),
            images,
            orderId,
            bookingId,
            serviceId,
            staffId,
            isAnonymous: !!isAnonymous,
            complimentTags: targetType === 'Booking' ? normalizedCompliments : []
        });

        await review.save();

        // Mark the source transaction as rated if provided
        if (orderId) {
            await Order.findByIdAndUpdate(orderId, {
                'reviewStatus.isRated': true,
                'reviewStatus.reviewId': review._id
            });
        }
        if (bookingId) {
            await Booking.findByIdAndUpdate(bookingId, {
                'reviewStatus.isRated': true,
                'reviewStatus.reviewId': review._id
            });
        }

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
        if (targetType === 'Booking') await refreshStaffRating(staffId);

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
        const storeId = await resolveStore(req);
        const store = storeId ? await Store.findById(storeId) : null;

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

const getStaffReviews = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const staff = await User.findOne({ _id: req.params.staffId, isDeleted: false, 'professionalProfile.isPublic': { $ne: false } })
            .select('firstName lastName avatar role staffType professionalProfile.professionalTitle professionalProfile.specialty');
        if (!staff || !isOperationalStaff(staff)) return res.status(404).json({ message: 'Staff profile not found.' });
        const filter = { targetType: 'Booking', staffId: staff._id, isApproved: true, isDeleted: { $ne: true } };
        const [reviews, total, summary] = await Promise.all([
            Review.find(filter).populate('user', 'firstName lastName avatar').select('user rating comment complimentTags isAnonymous createdAt').sort({ createdAt: -1 })
                .skip((Number(page) - 1) * Number(limit)).limit(Math.min(Number(limit), 50)).lean(),
            Review.countDocuments(filter),
            Review.aggregate([{ $match: filter }, { $group: { _id: '$staffId', average: { $avg: '$rating' }, count: { $sum: 1 } } }])
        ]);
        res.json({
            staff,
            averageRating: summary[0] ? Number(summary[0].average.toFixed(1)) : 0,
            reviewCount: summary[0]?.count || 0,
            reviews: reviews.map(item => ({ ...item, user: item.isAnonymous ? null : item.user })),
            pagination: { currentPage: Number(page), totalPages: Math.ceil(total / Number(limit)), totalReviews: total }
        });
    } catch (error) {
        res.status(error.name === 'CastError' ? 404 : 500).json({ message: error.name === 'CastError' ? 'Staff profile not found.' : 'Unable to load staff reviews.' });
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

        if (targetType === 'Booking') {
            const booking = await Booking.findOne({
                _id: targetId,
                customer: userId,
                status: 'completed',
                paymentStatus: 'paid',
                $or: [{ 'reviewStatus.isRated': { $ne: true } }, { reviewStatus: { $exists: false } }]
            });
            if (booking && (booking.serviceProvider || booking.staff)) isEligible = true;
        }
        else if (targetType === 'Product') {
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
            const storeEligibility = await getStoreReviewEligibility(userId, targetId);
            return res.json(storeEligibility);
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

        if (!(await canOperateStore(req.user, review.storeId, ['customers.manage', 'pets.manage']))) {
            return res.status(403).json({ message: 'You cannot manage reviews for another store.' });
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

        if (!(await canOperateStore(req.user, review.storeId, ['customers.manage', 'pets.manage']))) {
            return res.status(403).json({ message: 'You cannot moderate reviews for another store.' });
        }

        review.isApproved = !review.isApproved;
        await review.save();
        if (review.targetType === 'Booking') await refreshStaffRating(review.staffId);

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
    toggleReviewStatus,
    getStaffReviews
};
