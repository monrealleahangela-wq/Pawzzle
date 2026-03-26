const mongoose = require('mongoose');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const Pet = require('../models/Pet');
const Product = require('../models/Product');
const AdoptionRequest = require('../models/AdoptionRequest');
const User = require('../models/User');
const Store = require('../models/Store');
const Review = require('../models/Review');
const Service = require('../models/Service');

// ===== CUSTOMER DSS =====
const getCustomerInsights = async (req, res) => {
    try {
        const userId = req.user._id;
        const userObjectId = new mongoose.Types.ObjectId(userId);

        // Spending analytics
        const orders = await Order.find({ customer: userId, isDeleted: { $ne: true } });
        const activeOrders = orders.filter(o => o.status !== 'cancelled');
        const totalSpent = activeOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        const completedOrders = orders.filter(o => o.status === 'delivered');
        const cancelledOrders = orders.filter(o => o.status === 'cancelled');
        const pendingOrders = orders.filter(o => ['pending', 'confirmed', 'processing', 'shipped'].includes(o.status));

        // Monthly spending trend (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const monthlySpending = await Order.aggregate([
            { $match: { customer: userObjectId, createdAt: { $gte: sixMonthsAgo }, status: { $ne: 'cancelled' }, isDeleted: { $ne: true } } },
            { $group: { _id: { $month: '$createdAt' }, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
            { $sort: { '_id': 1 } }
        ]);

        // Top categories purchased
        const categoryBreakdown = {};
        orders.forEach(o => {
            (o.items || []).forEach(item => {
                const cat = item.itemType || 'other';
                categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + (item.price * item.quantity);
            });
        });

        // Booking analytics
        const bookings = await Booking.find({ customer: userId, isDeleted: { $ne: true } });
        const completedBookings = bookings.filter(b => b.status === 'completed');
        const upcomingBookings = bookings.filter(b => ['pending', 'confirmed'].includes(b.status));
        const bookingSpend = bookings.filter(b => b.status !== 'cancelled').reduce((s, b) => s + (b.totalPrice || 0), 0);

        // Collect user's pets for personalized suggestions
        // 1. From Adoptions (any non-cancelled)
        const adoptions = await AdoptionRequest.find({ customer: userId }).populate('pet');
        const approvedAdoptions = adoptions.filter(a => ['approved', 'ready_for_pickup', 'shipped', 'delivered'].includes(a.status));

        const adoptionPets = adoptions
            .filter(a => !['cancelled', 'rejected'].includes(a.status))
            .map(a => {
                if (!a.pet) return null;
                const p = a.pet.toObject ? a.pet.toObject() : a.pet;
                if (!p.name) return null;
                return { ...p, dss_source: 'adoption', dss_status: a.status };
            })
            .filter(Boolean);

        // 2. From direct ownership
        const selfOwnedPets = (await Pet.find({ addedBy: userId, status: 'adopted', isDeleted: { $ne: true } }))
            .map(p => ({ ...p.toObject(), dss_source: 'owned' }));

        // 3. From Bookings - very important since people book for their own pets!
        const bookingPets = bookings
            .filter(b => b.pet && b.pet.name)
            .map(b => ({
                name: b.pet.name,
                species: b.pet.type || 'other',
                breed: b.pet.breed || 'Unknown',
                age: b.pet.age || 0,
                ageUnit: 'years',
                size: (b.pet.weight || 0) > 20 ? 'large' : (b.pet.weight || 0) > 10 ? 'medium' : 'small',
                healthStatus: 'good',
                dss_source: 'booking'
            }));

        // Standardize and merge
        const rawPets = [...adoptionPets, ...selfOwnedPets, ...bookingPets].filter(p => p && p.name);
        const allPets = rawPets.filter((p, index, self) =>
            index === self.findIndex(t => (
                t.name?.toLowerCase() === p.name?.toLowerCase() &&
                t.breed?.toLowerCase() === p.breed?.toLowerCase()
            ))
        );

        // Recommendations System
        const smartRecommendations = [];
        const petPredictions = [];

        // Breed-Specific Risk Matrix
        const BREED_RISKS = {
            'Golden Retriever': ['Hip Dysplasia', 'Obesity'],
            'German Shepherd': ['Joint Issues', 'Digestive Sensitivity'],
            'Bulldog': ['Respiratory Issues', 'Heat Sensitivity'],
            'Shih Tzu': ['Eye Issues', 'Dental Care'],
            'Beagle': ['Ear Infections', 'Weight Management'],
            'Poodle': ['Skin Allergies', 'Eye Conditions'],
            'Siberian Husky': ['Eye Conditions', 'Joint Health'],
            'Dachshund': ['Spinal Health', 'Weight Control']
        };

        // 1. Static/Behavioral Recommendations
        if (completedOrders.length > 5) smartRecommendations.push({ type: 'loyalty', title: 'Loyal Customer', message: `You've completed ${completedOrders.length} orders! Look for loyalty vouchers.`, priority: 'high' });
        if (upcomingBookings.length > 0) smartRecommendations.push({ type: 'info', title: 'Upcoming Bookings', message: `You have ${upcomingBookings.length} upcoming service booking(s). Don't forget!`, priority: 'high' });

        // 2. Personalized Pet Intelligence (Requirement)
        for (const pet of allPets) {
            const petInsights = {
                petName: pet.name,
                petId: pet._id,
                suggestions: [],
                roadmap: [],
                costEstimate: 0
            };

            // Age-based logic
            const ageVal = pet.age || 0;
            const ageUnit = pet.ageUnit || 'years';
            const isYoung = (ageUnit === 'months' && ageVal <= 12) || (ageUnit === 'years' && ageVal < 1);
            const isSenior = (ageUnit === 'years' && ageVal >= 7);

            // ─── Life Phase Advisor ───
            if (isYoung && ageUnit === 'months' && ageVal >= 10) {
                petInsights.roadmap.push({
                    milestone: 'Transition to Adult Food',
                    period: 'In 2-4 months',
                    note: `${pet.name} is approaching adulthood. Start mixing adult kibble gradually.`
                });
            } else if (ageUnit === 'years' && ageVal === 6) {
                petInsights.roadmap.push({
                    milestone: 'Senior Health Screening',
                    period: 'Within 6 months',
                    note: 'Preventative bloodwork is recommended as pets enter their senior years.'
                });
            }

            // ─── Breed-Specific Risk Awareness ───
            const risks = BREED_RISKS[pet.breed] || [];
            if (risks.length > 0) {
                petInsights.suggestions.push({
                    type: 'info',
                    category: 'Preventative',
                    items: [],
                    reason: `Breed Awareness: ${pet.breed}s are prone to ${risks.join(' and ')}. Proactive checkups are advised.`,
                    priority: 'medium'
                });
            }

            // ─── Food Consumption Estimator (Simulation) ───
            const weightFactor = pet.size === 'small' ? 0.2 : pet.size === 'medium' ? 0.5 : pet.size === 'large' ? 1.2 : 1.8;
            const monthlyFoodKg = Math.round(weightFactor * 10);
            petInsights.costEstimate = monthlyFoodKg * 150; // Average 150 per kg

            // Food suggestions based on Age, Breed, Weight
            let species = pet.species || 'pet';
            let foodSearch = species;
            if (isYoung) foodSearch += ' kitten/puppy';
            else if (isSenior) foodSearch += ' senior';
            if (pet.size === 'large' || pet.size === 'extra_large') foodSearch += ' large breed';

            const suggestedProducts = await Product.find({
                suitableFor: new RegExp(species, 'i'),
                category: 'food',
                $or: [
                    { name: { $regex: new RegExp(species, 'i') } },
                    { description: { $regex: new RegExp(foodSearch, 'i') } }
                ],
                isActive: true,
                isDeleted: { $ne: true }
            }).limit(2);

            if (suggestedProducts.length > 0) {
                petInsights.suggestions.push({
                    type: 'food',
                    category: 'Dietary',
                    items: suggestedProducts.map(p => ({ id: p._id, name: p.name, price: p.price })),
                    reason: `Targeted for a ${ageVal} ${ageUnit} old ${pet.breed}. Estimated monthly needs: ${monthlyFoodKg}kg.`
                });
            }

            // ─── Service Recommendations (Enhanced) ───
            const suggestedServices = [];
            const recommendationItems = [];

            // 1. Grooming (Age/Breed based)
            if (['dog', 'cat'].includes(pet.species?.toLowerCase())) {
                const grooming = await Service.findOne({
                    category: 'grooming',
                    isActive: true,
                    isDeleted: { $ne: true }
                });
                if (grooming) {
                    suggestedServices.push('grooming');
                    recommendationItems.push({ id: grooming._id, name: grooming.name, price: grooming.price });
                }
            }

            // 2. Vaccination & Checkups (Age based)
            if (isYoung || isSenior || pet.healthStatus === 'needs_attention') {
                const healthCategories = isYoung ? ['vaccination', 'checkup'] : ['consultation', 'health_check'];
                const medical = await Service.find({
                    category: { $in: healthCategories },
                    isActive: true,
                    isDeleted: { $ne: true }
                }).limit(2);

                medical.forEach(m => {
                    suggestedServices.push(m.category === 'vaccination' ? 'vaccination' : 'pet checkups');
                    recommendationItems.push({ id: m._id, name: m.name, price: m.price });
                });
            }

            // 3. Anti-Tick Treatment (Popularity/Seasonal Simulation)
            if (pet.species?.toLowerCase() === 'dog') {
                const protection = await Service.findOne({
                    $or: [{ name: /tick/i }, { category: /health/i }],
                    name: /tick|protection|treatment/i,
                    isActive: true,
                    isDeleted: { $ne: true }
                });
                if (protection) {
                    suggestedServices.push('anti-tick treatments');
                    recommendationItems.push({ id: protection._id, name: protection.name, price: protection.price });
                }
            }

            // 4. Boarding (Based on user booking behavior - frequently books but no upcoming)
            if (completedBookings.length > 2 && upcomingBookings.length === 0) {
                const boarding = await Service.findOne({
                    category: 'boarding',
                    isActive: true,
                    isDeleted: { $ne: true }
                });
                if (boarding) {
                    suggestedServices.push('pet boarding');
                    recommendationItems.push({ id: boarding._id, name: boarding.name, price: boarding.price });
                }
            }

            // Construct Personalized Recommendation String
            const uniqueServices = [...new Set(suggestedServices)];
            let personalizedAction = "";
            if (uniqueServices.length > 0) {
                const list = uniqueServices.length > 1
                    ? `${uniqueServices.slice(0, -1).join(', ')} and ${uniqueServices.slice(-1)}`
                    : uniqueServices[0];
                personalizedAction = `Based on your pet profile, ${list} are recommended.`;
            }

            if (recommendationItems.length > 0) {
                petInsights.suggestions.push({
                    type: 'service',
                    category: 'Smart Care Recommendations',
                    items: recommendationItems.slice(0, 3),
                    reason: personalizedAction || `Recommended care plan for ${pet.name}'s current profile.`,
                    personalizedString: personalizedAction
                });
            }

            // 5. Similar Pets Popularity (Requirement)
            const speciesSame = allPets.filter(p => p.species === pet.species).length;
            if (speciesSame > 0) {
                petInsights.roadmap.unshift({
                    milestone: 'Popular Recommendation',
                    period: 'Trending',
                    note: `Other ${pet.breed || pet.species} owners frequently book professional grooming during this season.`
                });
            }

            petPredictions.push(petInsights);

            // Add high-priority alerts to main recommendations
            if (pet.healthStatus === 'needs_attention') {
                smartRecommendations.push({
                    type: 'warning',
                    title: `Health Alert: ${pet.name}`,
                    message: `${pet.name} is marked as needing attention. We suggest booking a Veterinary Consultation immediately.`,
                    priority: 'critical'
                });
            }
        }

        // Favorite payment methods
        const paymentMethods = {};
        orders.forEach(o => {
            const m = o.paymentMethod || 'unknown';
            paymentMethods[m] = (paymentMethods[m] || 0) + 1;
        });

        res.json({
            overview: {
                totalOrders: orders.length,
                completedOrders: completedOrders.length,
                cancelledOrders: cancelledOrders.length,
                pendingOrders: pendingOrders.length,
                totalSpent,
                averageOrderValue: orders.length ? Math.round(totalSpent / orders.length) : 0
            },
            bookings: {
                total: bookings.length,
                completed: completedBookings.length,
                upcoming: upcomingBookings.length,
                totalSpent: bookingSpend
            },
            adoptions: {
                total: adoptions.length,
                approved: approvedAdoptions.length,
                pending: adoptions.filter(a => a.status === 'pending').length
            },
            petIntelligence: petPredictions,
            myPets: allPets,
            monthlySpending,
            categoryBreakdown,
            paymentMethods,
            recommendations: smartRecommendations
        });
    } catch (error) {
        console.error('Customer DSS error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// ===== ADMIN (STORE OWNER) DSS =====
const getAdminInsights = async (req, res) => {
    try {
        const { storeId: queryStoreId } = req.query;
        let store;
        
        if (req.user.role === 'staff') {
            if (req.user.store) {
                store = await Store.findById(req.user.store);
            } else {
                return res.status(403).json({ message: 'Staff account not assigned to a store.' });
            }
        } else {
            // Admin or Super Admin
            if (queryStoreId) {
                store = await Store.findOne({ _id: queryStoreId });
                // Verify ownership if not super admin
                if (req.user.role !== 'super_admin' && store && store.owner.toString() !== req.user._id.toString()) {
                    return res.status(403).json({ message: 'Access denied to this store' });
                }
            } else {
                store = await Store.findOne({ owner: req.user._id });
                if (!store && req.user.store) {
                    store = await Store.findById(req.user.store);
                }
            }
        }

        if (!store) return res.status(404).json({ message: 'Store not found' });
        const storeId = store._id;

        // 1. Core Analytics: Revenue & Orders
        const [orders, bookings] = await Promise.all([
            Order.find({ store: storeId, isDeleted: { $ne: true } }),
            Booking.find({ store: storeId, isDeleted: { $ne: true } })
        ]);

        const orderRevenue = orders.filter(o => o.paymentStatus === 'paid').reduce((s, o) => s + (o.totalAmount || 0), 0);
        const bookingRevenue = bookings.filter(b => b.paymentStatus === 'paid').reduce((s, b) => s + (b.totalPrice || 0), 0);
        
        const totalGrossRevenue = orderRevenue + bookingRevenue;

        const orderNet = orders.filter(o => o.paymentStatus === 'paid').reduce((s, o) => s + (o.netAmount || 0), 0);
        const bookingNet = bookings.filter(b => b.paymentStatus === 'paid').reduce((s, b) => s + (b.netAmount || 0), 0);
        const totalNetEarnings = orderNet + bookingNet;

        // 2. Product Sales History & Performance (Filter by PAID)
        const productPerformance = await Order.aggregate([
            { $match: { store: storeId, paymentStatus: 'paid', isDeleted: { $ne: true } } },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.itemId',
                    name: { $first: '$items.name' },
                    itemType: { $first: '$items.itemType' },
                    totalSold: { $sum: '$items.quantity' },
                    revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                    lastSold: { $max: '$createdAt' }
                }
            },
            { $sort: { totalSold: -1 } }
        ]);

        // 3. Inventory Levels & Category Analysis
        const allProducts = await Product.find({ store: storeId, isDeleted: { $ne: true } });
        const allPets = await Pet.find({ store: storeId, isDeleted: { $ne: true } });

        // Enrich performance data with current stock and category
        const enrichedPerformance = productPerformance.map(stat => {
            const product = allProducts.find(p => p._id.toString() === stat._id.toString());
            const pet = allPets.find(p => p._id.toString() === stat._id.toString());
            return {
                ...stat,
                stock: product ? product.stockQuantity : (pet ? (pet.status === 'available' ? 1 : 0) : 0),
                category: product ? product.category : (pet ? pet.species : 'other')
            };
        });

        // Sales Trends per Category
        const categoryTrends = {};
        enrichedPerformance.forEach(item => {
            if (!categoryTrends[item.category]) {
                categoryTrends[item.category] = { revenue: 0, unitsSold: 0, products: 0 };
            }
            categoryTrends[item.category].revenue += item.revenue;
            categoryTrends[item.category].unitsSold += item.totalSold;
            categoryTrends[item.category].products += 1;
        });

        // 4. Customer Purchase Patterns
        const customerPatterns = await Order.aggregate([
            { $match: { store: storeId, status: { $ne: 'cancelled' }, isDeleted: { $ne: true } } },
            {
                $group: {
                    _id: '$customer',
                    orderCount: { $sum: 1 },
                    totalSpent: { $sum: '$totalAmount' },
                    lastOrder: { $max: '$createdAt' }
                }
            },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'userInfo' } },
            { $unwind: '$userInfo' },
            {
                $project: {
                    name: { $concat: ['$userInfo.firstName', ' ', '$userInfo.lastName'] },
                    avatar: '$userInfo.avatar',
                    orderCount: 1,
                    totalSpent: 1,
                    lastOrder: 1,
                    loyaltyLevel: {
                        $cond: [{ $gte: ['$orderCount', 10] }, 'Gold', { $cond: [{ $gte: ['$orderCount', 5] }, 'Silver', 'Bronze'] }]
                    }
                }
            },
            { $sort: { totalSpent: -1 } },
            { $limit: 10 }
        ]);

        // 5. Insights Generation
        const topSelling = enrichedPerformance.slice(0, 5);

        // Slow moving: In stock but low sales in last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const slowMoving = allProducts.filter(p => {
            const performance = enrichedPerformance.find(s => s._id.toString() === p._id.toString());
            const hasLowSales = !performance || performance.totalSold < 5;
            return p.stockQuantity > 10 && hasLowSales;
        }).slice(0, 5);

        // Needs restocking: Stock below threshold (Enhanced Logic)
        const needsRestock = allProducts.filter(p => (p.stockQuantity <= 5 || p.stockQuantity < (p.minStockThreshold || 10)) && p.isActive).slice(0, 10);

        // 6. Recommendations Engine (Enhanced Inventory Intelligence)
        const recommendations = [];

        // Restock Recommendations with Sales Velocity Analysis
        needsRestock.forEach(p => {
            const perf = enrichedPerformance.find(s => s._id.toString() === p._id.toString());

            // Calculate Velocity (Sales per day over 30 days)
            const salesIn30Days = perf ? perf.totalSold : 0;
            const velocityPerDay = salesIn30Days / 30;

            // Calculate "Days of Stock Remaining"
            let daysRemaining = 99; // Default if no sales
            if (velocityPerDay > 0) {
                daysRemaining = Math.max(1, Math.round(p.stockQuantity / velocityPerDay));
            } else if (p.stockQuantity === 0) {
                daysRemaining = 0;
            }

            // Personalized Advisory String (Requirement)
            const personalizedAlert = `${p.name} stock is low. Based on recent sales trends, it is recommended to restock within ${daysRemaining === 0 ? 'immediately' : daysRemaining + ' days'}.`;

            recommendations.push({
                type: 'restock',
                title: 'Smart Inventory Alert',
                productName: p.name,
                message: personalizedAlert,
                priority: daysRemaining <= 3 ? 'critical' : 'high',
                velocity: velocityPerDay.toFixed(2),
                daysUntilOut: daysRemaining,
                action: 'Refill Stock'
            });
        });

        // Increasing Demand Recommendations
        enrichedPerformance.slice(0, 3).forEach(item => {
            if (item.totalSold > 15) {
                recommendations.push({
                    type: 'demand',
                    title: 'Increasing Demand detected',
                    productName: item.name,
                    message: `${item.name} is seeing high acquisition rates. Consider increasing the next purchase order by 20%.`,
                    priority: 'medium',
                    action: 'Adjust Strategy'
                });
            }
        });

        // Promotion/Discount Recommendations
        slowMoving.forEach(p => {
            recommendations.push({
                type: 'promotion',
                title: 'Stagnant Inventory alert',
                productName: p.name,
                message: `${p.name} has been slow-moving for 30+ days. Recommend a 15% discount or bundle with top-sellers.`,
                priority: 'medium',
                action: 'Create Promo'
            });
        });

        // 7. Booking & Review (Legacy but useful)
        // Reuse 'bookings' fetched earlier
        const reviews = await Review.find({ storeId: storeId });
        const avgRating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : 0;

        // Monthly revenue for chart
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const monthlyRevenue = await Order.aggregate([
            { $match: { store: storeId, status: 'delivered', createdAt: { $gte: sixMonthsAgo }, isDeleted: { $ne: true } } },
            { $group: { _id: { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } }, revenue: { $sum: '$totalAmount' } } },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        // 8. Role-Based Tailoring (Requirement)
        let filteredRecommendations = recommendations;
        if (req.user.role === 'staff') {
            switch (req.user.staffType) {
                case 'inventory_staff':
                    filteredRecommendations = recommendations.filter(r => ['restock', 'demand'].includes(r.type));
                    break;
                case 'order_staff':
                    filteredRecommendations = recommendations.filter(r => ['demand', 'promotion'].includes(r.type));
                    break;
                case 'service_staff':
                    // Service staff might just see general alerts or booking trends
                    filteredRecommendations = recommendations.filter(r => r.type === 'demand');
                    break;
            }
        }

        res.json({
            roleProfile: {
                role: req.user.role,
                staffType: req.user.staffType,
                isStaff: req.user.role === 'staff'
            },
            overview: {
                totalGross: totalGrossRevenue,
                totalRevenue: totalNetEarnings, // Store/Seller Net Earnings
                availableBalance: store.balance,
                totalOrders: orders.length,
                activeProducts: allProducts.filter(p => !p.isDeleted).length,
                activePets: allPets.filter(p => p.status === 'available').length,
                avgRating: parseFloat(avgRating)
            },
            salesHistory: {
                topSelling: req.user.role === 'staff' && req.user.staffType === 'service_staff' ? [] : topSelling,
                categoryTrends
            },
            inventory: {
                levels: {
                    healthy: allProducts.filter(p => p.stockQuantity > 20).length,
                    low: allProducts.filter(p => p.stockQuantity <= 20 && p.stockQuantity > 0).length,
                    out: allProducts.filter(p => p.stockQuantity === 0).length
                },
                slowMoving: req.user.role === 'staff' && req.user.staffType === 'order_staff' ? [] : slowMoving.map(p => ({ id: p._id, name: p.name, stock: p.stockQuantity, category: p.category })),
                needsRestock: req.user.role === 'staff' && req.user.staffType === 'service_staff' ? [] : needsRestock.map(p => ({ id: p._id, name: p.name, stock: p.stockQuantity, category: p.category }))
            },
            customers: {
                patterns: req.user.role === 'staff' && req.user.staffType === 'inventory_staff' ? [] : customerPatterns
            },
            recommendations: filteredRecommendations,
            monthlyRevenue: req.user.role === 'staff' && req.user.staffType === 'inventory_staff' ? [] : monthlyRevenue,
            bookings: {
                total: bookings.length,
                completed: bookings.filter(b => b.status === 'completed').length
            },
            conversionRate: orders.length > 0 ? (orders.filter(o => o.status === 'delivered').length / orders.length * 100).toFixed(1) : 0
        });

    } catch (error) {
        console.error('Admin DSS error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// ===== SUPER ADMIN DSS =====
const getSuperAdminInsights = async (req, res) => {
    try {
        const superAdminUsers = await User.find({ role: 'super_admin' }).select('_id');
        const superAdminIds = superAdminUsers.map(u => u._id);

        const totalUsers = await User.countDocuments({ isDeleted: { $ne: true } });
        const totalCustomers = await User.countDocuments({ role: 'customer', isDeleted: { $ne: true } });
        const totalAdmins = await User.countDocuments({ role: 'admin', isDeleted: { $ne: true } });

        const storeFilter = { isDeleted: { $ne: true }, owner: { $nin: superAdminIds } };
        const totalStores = await Store.countDocuments(storeFilter);
        const activeStores = await Store.countDocuments({ ...storeFilter, isActive: true });
        const pendingApplications = await Store.countDocuments({ ...storeFilter, isActive: false });

        // Revenue from PAID transactions
        const allOrders = await Order.find({ paymentStatus: 'paid', isDeleted: { $ne: true } })
            .sort({ createdAt: -1 })
            .populate('customer', 'firstName lastName');
        const recentOrders = allOrders.slice(0, 8);
        
        const allBookings = await Booking.find({ paymentStatus: 'paid', isDeleted: { $ne: true } });
        
        const platformRevenue = allOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);
        const bookingRevenue = allBookings.reduce((s, b) => s + (b.totalPrice || 0), 0);
        const totalGrossRevenue = platformRevenue + bookingRevenue;

        const orderFees = allOrders.reduce((s, o) => s + (o.platformFee || 0), 0);
        const bookingFees = allBookings.reduce((s, b) => s + (b.platformFee || 0), 0);
        const totalPlatformIncome = orderFees + bookingFees;

        // Monthly platform revenue
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const monthlyRevenue = await Order.aggregate([
            { $match: { createdAt: { $gte: sixMonthsAgo }, paymentStatus: 'paid', isDeleted: { $ne: true } } },
            { $group: { _id: { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } }, revenue: { $sum: '$totalAmount' }, fees: { $sum: '$platformFee' }, orders: { $sum: 1 } } },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        // User growth trend
        const userGrowth = await User.aggregate([
            { $match: { createdAt: { $gte: sixMonthsAgo }, isDeleted: { $ne: true } } },
            { $group: { _id: { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } }, count: { $sum: 1 } } },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        // Top performing stores (Excluding super_admin owned stores)
        const storePerformance = await Order.aggregate([
            { $match: { status: 'delivered', isDeleted: { $ne: true } } },
            { $lookup: { from: 'stores', localField: 'store', foreignField: '_id', as: 'storeData' } },
            { $unwind: '$storeData' },
            { $match: { 'storeData.owner': { $nin: superAdminIds } } },
            { $group: { _id: '$store', revenue: { $sum: '$totalAmount' }, orderCount: { $sum: 1 }, storeName: { $first: '$storeData.name' } } },
            { $sort: { revenue: -1 } },
            { $limit: 5 },
            { $project: { storeName: 1, revenue: 1, orderCount: 1 } }
        ]);

        // Platform health indicators
        const totalPets = await Pet.countDocuments({ isDeleted: { $ne: true } });
        const totalProducts = await Product.countDocuments({ isDeleted: { $ne: true } });
        const totalAdoptions = await AdoptionRequest.countDocuments({ isDeleted: { $ne: true } });
        const successfulAdoptions = await AdoptionRequest.countDocuments({ status: { $in: ['approved', 'delivered'] }, isDeleted: { $ne: true } });
        const totalReviews = await Review.countDocuments({ isDeleted: { $ne: true } });
        const avgPlatformRating = await Review.aggregate([
            { $match: { isDeleted: { $ne: true } } },
            { $group: { _id: null, avg: { $avg: '$rating' } } }
        ]);

        // Monthly platform growth (Customers vs Stores)
        const customerGrowth = await User.aggregate([
            { $match: { role: 'customer', createdAt: { $gte: sixMonthsAgo }, isDeleted: { $ne: true } } },
            { $group: { _id: { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } }, count: { $sum: 1 } } },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        const storeGrowth = await Store.aggregate([
            { $match: { createdAt: { $gte: sixMonthsAgo }, isDeleted: { $ne: true }, owner: { $nin: superAdminIds } } },
            { $group: { _id: { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } }, count: { $sum: 1 } } },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        // Most Purchased Product Categories (Popularity by Sales volume)
        const popularCategories = await Order.aggregate([
            { $match: { status: 'delivered', isDeleted: { $ne: true } } },
            { $unwind: '$items' },
            { $group: { _id: '$items.category', salesCount: { $sum: '$items.quantity' }, totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
            { $sort: { salesCount: -1 } },
            { $limit: 10 }
        ]);

        // Order fulfillment rate
        const deliveredOrders = allOrders.filter(o => o.status === 'delivered').length;
        const cancelledOrders = allOrders.filter(o => o.status === 'cancelled').length;
        const fulfillmentRate = allOrders.length ? ((deliveredOrders / allOrders.length) * 100).toFixed(1) : 0;

        // Species distribution (pets)
        const speciesDistribution = await Pet.aggregate([
            { $match: { isDeleted: { $ne: true } } },
            { $group: { _id: '$species', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // Product category distribution
        const productCategories = await Product.aggregate([
            { $match: { isDeleted: { $ne: true } } },
            { $group: { _id: '$category', count: { $sum: 1 }, avgPrice: { $avg: '$price' } } },
            { $sort: { count: -1 } }
        ]);

        // Smart recommendations
        const recommendations = [];
        if (allOrders.length > 0 && cancelledOrders > allOrders.length * 0.25) recommendations.push({ type: 'critical', title: 'High Platform Cancellation Rate', message: `${((cancelledOrders / allOrders.length) * 100).toFixed(0)}% orders cancelled. Investigate root causes.`, priority: 'critical' });
        if (totalStores > 0 && activeStores < totalStores * 0.7) recommendations.push({ type: 'warning', title: 'Inactive Stores', message: `${totalStores - activeStores} stores are inactive. Consider outreach programs.`, priority: 'high' });
        if (totalCustomers > 0 && allOrders.length > 0 && (allOrders.length / totalCustomers) < 1) recommendations.push({ type: 'info', title: 'Low Purchase Rate', message: 'Average orders per customer is below 1. Consider marketing campaigns.', priority: 'medium' });
        if (totalAdoptions > 0 && (successfulAdoptions / totalAdoptions) < 0.5) recommendations.push({ type: 'warning', title: 'Low Adoption Success Rate', message: `Only ${((successfulAdoptions / totalAdoptions) * 100).toFixed(0)}% adoptions succeed. Review the adoption process.`, priority: 'high' });
        if (totalStores === 0) recommendations.push({ type: 'info', title: 'No Stores Yet', message: 'Approve store applications to populate the platform with businesses.', priority: 'medium' });

        res.json({
            platform: {
                totalUsers,
                totalCustomers,
                totalAdmins,
                totalStores,
                activeStores,
                pendingApplications,
                totalPets,
                totalProducts,
                totalReviews,
                avgRating: avgPlatformRating[0]?.avg?.toFixed(1) || 0
            },
            revenue: {
                totalGross: totalGrossRevenue,
                totalPlatformFees: totalPlatformIncome,
                totalOrderRevenue: platformRevenue,
                totalBookingRevenue: bookingRevenue,
                combined: totalGrossRevenue
            },
            orders: {
                total: allOrders.length,
                delivered: deliveredOrders,
                cancelled: cancelledOrders,
                fulfillmentRate: parseFloat(fulfillmentRate),
                recent: recentOrders
            },
            adoptions: {
                total: totalAdoptions,
                successful: successfulAdoptions,
                successRate: totalAdoptions ? parseFloat(((successfulAdoptions / totalAdoptions) * 100).toFixed(1)) : 0
            },
            monthlyRevenue,
            userGrowth,
            customerGrowth,
            storeGrowth,
            storePerformance,
            speciesDistribution,
            productCategories,
            popularCategories,
            recommendations
        });
    } catch (error) {
        console.error('Super Admin DSS error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = {
    getCustomerInsights,
    getAdminInsights,
    getSuperAdminInsights
};
