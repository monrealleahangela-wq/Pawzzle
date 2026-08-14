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
const PetProfile = require('../models/PetProfile');
const Delivery = require('../models/Delivery');
const Supplier = require('../models/Supplier');
const StoreApplication = require('../models/StoreApplication');
const PurchaseOrder = require('../models/PurchaseOrder');
const DecisionSupportService = require('../services/decisionSupportService');
const { isPlatformAdmin, isStoreAdmin, isOperationalStaff } = require('../config/permissions');

// ===== CUSTOMER DSS =====
const getLegacyCustomerInsights = async (req, res) => {
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
// Safe customer analytics endpoint. Service recommendations are calculated by
// the separate deterministic /service-recommendations endpoint.
const getCustomerInsights = async (req, res) => {
    try {
        const [orders, bookings, pets] = await Promise.all([
            Order.find({ customer: req.user._id, isDeleted: { $ne: true } }).lean(),
            Booking.find({ customer: req.user._id, isDeleted: { $ne: true } }).populate('service', 'name').populate('store', 'name').lean(),
            PetProfile.find({ owner: req.user._id }).lean()
        ]);
        const completedBookings = bookings.filter(booking => booking.status === 'completed');
        res.json({
            overview: {
                totalOrders: orders.length,
                completedOrders: orders.filter(order => order.status === 'delivered').length,
                totalSpent: orders.filter(order => order.status !== 'cancelled').reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
                completedServices: completedBookings.length
            },
            myPets: pets,
            serviceHistory: completedBookings.map(booking => ({ _id: booking._id, service: booking.service, store: booking.store, date: booking.bookingDate, status: booking.status, notes: booking.notes })),
            methodology: 'Service recommendations use deterministic weighted scoring. No AI, machine learning, diagnosis, or medical inference is used.',
            disclaimer: 'This system provides service recommendations only. For health concerns or medical advice, please consult a qualified veterinarian.'
        });
    } catch (error) {
        res.status(500).json({ message: 'Unable to load customer insights.' });
    }
};

const getAdminInsights = async (req, res) => {
    try {
        const { storeId: queryStoreId } = req.query;
        let store;
        
        // Block staff from central admin dashboard stats (Financials)
        if (req.user.role === 'staff') {
            return res.status(403).json({ 
                message: 'Access Restricted. You are only allowed to see Staff Intelligence.',
                redirectUrl: '/staff/intelligence'
            });
        }

        // Admin or Super Admin
        if (queryStoreId) {
            store = await Store.findOne({ _id: queryStoreId });
            // Verify ownership if not super admin
            if (!isPlatformAdmin(req.user) && store && store.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({ message: 'Access denied to this store' });
            }
        } else {
            store = await Store.findOne({ owner: req.user._id });
            if (!store && req.user.store) {
                store = await Store.findById(req.user.store);
            }
        }

        if (!store) return res.status(404).json({ message: 'Store not found' });
        const storeId = store._id;

        // 1. Core Analytics: Revenue & Orders
        // Be inclusive: check both storeId AND addedBy for historical consistency
        const [orders, bookings] = await Promise.all([
            Order.find({ 
                $or: [
                    { store: storeId },
                    { addedBy: store.owner }
                ], 
                isDeleted: { $ne: true } 
            }),
            Booking.find({ 
                $or: [
                    { store: storeId },
                    { addedBy: store.owner }
                ], 
                isDeleted: { $ne: true } 
            })
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
            const salesIn30Days = perf ? perf.totalSold : 0;
            const explained = DecisionSupportService.explainInventoryPosition({
                product: p,
                inventory: { quantity: p.stockQuantity, reorderLevel: p.minStockThreshold || 10 },
                unitsLast30: salesIn30Days,
                unitsPrevious30: 0,
                observations: perf ? 1 : 0
            });

            recommendations.push({
                type: 'restock',
                title: 'Smart Inventory Alert',
                productId: p._id,
                productName: p.name,
                message: explained.why,
                priority: explained.inventoryPosition.daysRemaining !== null && explained.inventoryPosition.daysRemaining <= 3 ? 'critical' : 'high',
                velocity: explained.usageTrend.dailyUsage.toFixed(2),
                daysUntilOut: explained.inventoryPosition.daysRemaining,
                suggestedReorderQuantity: explained.decision.suggestedReorderQuantity,
                confidence: explained.confidence,
                confidenceLabel: explained.confidenceLabel,
                forecastReason: explained.forecastReason,
                why: explained.why,
                basedOn: explained.basedOn,
                recommendedAction: explained.recommendedAction,
                action: 'Review Reorder'
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
                    action: 'Adjust Strategy',
                    why: `${item.totalSold} paid units were recorded for ${item.name}.`,
                    basedOn: [`${item.totalSold} units sold`, `₱${Number(item.revenue || 0).toLocaleString()} recorded revenue`],
                    recommendedAction: 'Validate the recent trend and supplier lead time before increasing the next purchase quantity.'
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
                action: 'Create Promo',
                why: `${p.name} remains above 10 units with fewer than five recorded paid sales.`,
                basedOn: [`${p.stockQuantity} units on hand`, 'Fewer than five recorded sales in the observed period'],
                recommendedAction: 'Review a bundle or targeted promotion after checking margin and expiration risk.'
            });
        });

        // 7. Growth & Performance Dynamics
        const now = new Date();
        const sixtyDaysAgo = new Date(now.getTime() - (60 * 24 * 60 * 60 * 1000));

        const calculateGrowth = (current, previous) => {
            if (previous === 0) return current > 0 ? 100 : 0;
            return parseFloat(((current - previous) / previous * 100).toFixed(1));
        };

        // Orders Growth
        const currentOrders = orders.filter(o => o.createdAt >= thirtyDaysAgo).length;
        const previousOrders = orders.filter(o => o.createdAt < thirtyDaysAgo && o.createdAt >= sixtyDaysAgo).length;
        const ordersGrowth = calculateGrowth(currentOrders, previousOrders);

        // Bookings Growth
        const currentBookings = bookings.filter(b => b.createdAt >= thirtyDaysAgo).length;
        const previousBookings = bookings.filter(b => b.createdAt < thirtyDaysAgo && b.createdAt >= sixtyDaysAgo).length;
        const bookingsGrowth = calculateGrowth(currentBookings, previousBookings);

        // Revenue/Earnings Growth
        const currentRevenue = orders.filter(o => o.paymentStatus === 'paid' && o.createdAt >= thirtyDaysAgo).reduce((s, o) => s + (o.netAmount || 0), 0) +
                               bookings.filter(b => b.paymentStatus === 'paid' && b.createdAt >= thirtyDaysAgo).reduce((s, b) => s + (b.netAmount || 0), 0);
        const previousRevenue = orders.filter(o => o.paymentStatus === 'paid' && o.createdAt < thirtyDaysAgo && o.createdAt >= sixtyDaysAgo).reduce((s, o) => s + (o.netAmount || 0), 0) +
                                bookings.filter(b => b.paymentStatus === 'paid' && b.createdAt < thirtyDaysAgo && b.createdAt >= sixtyDaysAgo).reduce((s, b) => s + (b.netAmount || 0), 0);
        const revenueGrowth = calculateGrowth(currentRevenue, previousRevenue);

        // Inventory Growth (New listings)
        const currentPets = allPets.filter(p => p.createdAt >= thirtyDaysAgo).length;
        const previousPets = allPets.filter(p => p.createdAt < thirtyDaysAgo && p.createdAt >= sixtyDaysAgo).length;
        const petsGrowth = calculateGrowth(currentPets, previousPets);

        const currentProducts = allProducts.filter(p => p.createdAt >= thirtyDaysAgo).length;
        const previousProducts = allProducts.filter(p => p.createdAt < thirtyDaysAgo && p.createdAt >= sixtyDaysAgo).length;
        const productsGrowth = calculateGrowth(currentProducts, previousProducts);

        // No historical payout/balance ledger is available here, so do not fabricate a balance trend.
        const balanceGrowth = 0;

        // Monthly revenue for chart
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const monthlyRevenue = await Order.aggregate([
            { $match: { store: storeId, status: 'delivered', createdAt: { $gte: sixMonthsAgo }, isDeleted: { $ne: true } } },
            { $group: { _id: { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } }, revenue: { $sum: '$totalAmount' } } },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        // Calculate Average Rating
        const storeReviews = await Review.find({ storeId, isDeleted: { $ne: true } });
        const avgRating = storeReviews.length > 0
            ? (storeReviews.reduce((sum, r) => sum + r.rating, 0) / storeReviews.length).toFixed(1)
            : 5.0;

        res.json({
            roleProfile: {
                role: req.user.role,
                isStaff: false
            },
            overview: {
                totalGross: totalGrossRevenue,
                totalRevenue: totalNetEarnings, 
                availableBalance: store.balance,
                totalOrders: orders.length,
                activeProducts: allProducts.filter(p => !p.isDeleted).length,
                activePets: allPets.filter(p => p.status === 'available').length,
                avgRating: parseFloat(avgRating),
                growth: {
                    orders: ordersGrowth,
                    bookings: bookingsGrowth,
                    revenue: revenueGrowth,
                    pets: petsGrowth,
                    products: productsGrowth,
                    balance: balanceGrowth
                }
            },
            salesHistory: {
                topSelling,
                categoryTrends
            },
            inventory: {
                levels: {
                    healthy: allProducts.filter(p => p.stockQuantity > 20).length,
                    low: allProducts.filter(p => p.stockQuantity <= 20 && p.stockQuantity > 0).length,
                    out: allProducts.filter(p => p.stockQuantity === 0).length
                },
                slowMoving: slowMoving.map(p => ({ id: p._id, name: p.name, stock: p.stockQuantity, category: p.category })),
                needsRestock: needsRestock.map(p => ({ id: p._id, name: p.name, stock: p.stockQuantity, category: p.category }))
            },
            customers: {
                patterns: customerPatterns
            },
            recommendations,
            monthlyRevenue,
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

// ===== STAFF DECISION SUPPORT SYSTEM (DSS) =====
const getStaffInsights = async (req, res) => {
    try {
        if (!isOperationalStaff(req.user) && !isStoreAdmin(req.user) && !isPlatformAdmin(req.user)) {
            return res.status(403).json({ message: 'Access restricted to Staff.' });
        }

        const storeId = req.user.store;
        if (!storeId) {
            return res.status(400).json({ message: 'Staff account not linked to any store.' });
        }

        const staffType = req.user.staffType || 'general';

        // 1. Fetch relevant datasets
        const [orders, bookings, products, pets] = await Promise.all([
            Order.find({ store: storeId, isDeleted: { $ne: true } }).lean(),
            Booking.find({ store: storeId, isDeleted: { $ne: true } }).lean(),
            Product.find({ store: storeId, isDeleted: { $ne: true } }).lean(),
            Pet.find({ store: storeId, isDeleted: { $ne: true } }).lean()
        ]);

        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        const sixtyDaysAgo = new Date(now.getTime() - (60 * 24 * 60 * 60 * 1000));

        const calculateGrowth = (current, previous) => {
            if (previous === 0) return current > 0 ? 100 : 0;
            return parseFloat(((current - previous) / previous * 100).toFixed(1));
        };

        const currentOrders = orders.filter(o => o.createdAt >= thirtyDaysAgo).length;
        const previousOrders = orders.filter(o => o.createdAt < thirtyDaysAgo && o.createdAt >= sixtyDaysAgo).length;
        
        const currentBookings = bookings.filter(b => b.createdAt >= thirtyDaysAgo).length;
        const previousBookings = bookings.filter(b => b.createdAt < thirtyDaysAgo && b.createdAt >= sixtyDaysAgo).length;

        const currentPets = pets.filter(p => p.createdAt >= thirtyDaysAgo).length;
        const previousPets = pets.filter(p => p.createdAt < thirtyDaysAgo && p.createdAt >= sixtyDaysAgo).length;

        const currentProducts = products.filter(p => p.createdAt >= thirtyDaysAgo).length;
        const previousProducts = products.filter(p => p.createdAt < thirtyDaysAgo && p.createdAt >= sixtyDaysAgo).length;

        const recommendations = [];
        const criticalAlerts = [];

        // --- INVENTORY LOGIC ---
        const lowStock = products.filter(p => (p.stockQuantity <= 5 || p.stockQuantity < (p.minStockThreshold || 10)) && p.isActive);
        lowStock.forEach(p => {
            recommendations.push({
                type: 'restock',
                title: 'Restock Required',
                productName: p.name,
                message: `${p.name} is running low (${p.stockQuantity} remaining).`,
                priority: p.stockQuantity <= 3 ? 'critical' : 'high',
                daysUntilOut: 'Unknown',
                velocity: 'N/A'
            });
        });

        // --- ORDER LOGIC ---
        const pendingOrders = orders.filter(o => ['pending', 'confirmed'].includes(o.status));
        const twentyFourHoursAgo = new Date();
        twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
        const delayedOrders = pendingOrders.filter(o => new Date(o.createdAt) < twentyFourHoursAgo);
        
        if (delayedOrders.length > 0) {
            criticalAlerts.push({
                type: 'order_delay',
                title: 'Fulfillment Latency',
                message: `${delayedOrders.length} orders are delayed past 24 hours.`
            });
        }

        // --- SERVICE LOGIC ---
        const bookingsPending = bookings.filter(b => b.status === 'pending');

        // Compatible Structure for AdminDSS.js
        res.json({
            roleProfile: {
                role: req.user.role,
                isStaff: true,
                staffType
            },
            overview: {
                totalRevenue: 0, // Staff don't see financial data usually
                totalOrders: orders.length,
                totalBookings: bookings.length,
                activeProducts: products.length,
                activePets: pets.length,
                growth: {
                    orders: calculateGrowth(currentOrders, previousOrders),
                    bookings: calculateGrowth(currentBookings, previousBookings),
                    revenue: 0,
                    pets: calculateGrowth(currentPets, previousPets),
                    products: calculateGrowth(currentProducts, previousProducts),
                    balance: 0
                }
            },
            inventory: {
                levels: {
                    healthy: products.filter(p => p.stockQuantity > 20).length,
                    low: products.filter(p => p.stockQuantity <= 20 && p.stockQuantity > 0).length,
                    out: products.filter(p => p.stockQuantity === 0).length
                }
            },
            salesHistory: {
                topSelling: [],
                categoryTrends: {}
            },
            customers: { patterns: [] },
            recommendations,
            criticalAlerts,
            monthlyRevenue: [],
            conversionRate: 0
        });
    } catch (error) {
        console.error('Staff DSS error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// ===== SUPER ADMIN DSS =====
const getSuperAdminInsights = async (req, res) => {
    try {
        const superAdminUsers = await User.find({ role: { $in: ['super_admin', 'platform_admin'] } }).select('_id');
        const superAdminIds = superAdminUsers.map(u => u._id);

        const totalUsers = await User.countDocuments({ isDeleted: { $ne: true } });
        const totalCustomers = await User.countDocuments({ role: 'customer', isActive: { $ne: false }, isDeleted: { $ne: true } });
        const totalAdmins = await User.countDocuments({ role: { $in: ['admin', 'store_owner'] }, isDeleted: { $ne: true } });
        const recentUsers = await User.find({ isDeleted: { $ne: true } })
            .select('firstName lastName role isActive createdAt')
            .sort({ createdAt: -1 })
            .limit(8)
            .lean();

        const storeFilter = { isDeleted: { $ne: true }, owner: { $nin: superAdminIds } };
        const totalStores = await Store.countDocuments(storeFilter);
        const activeStores = await Store.countDocuments({ ...storeFilter, isActive: true });
        const [verifiedStores, actualPendingApplications, activeSuppliers, totalOrderCount, totalBookingCount] = await Promise.all([
            Store.countDocuments({ ...storeFilter, verificationStatus: 'verified' }),
            StoreApplication.countDocuments({ status: { $in: ['submitted', 'pending_review', 'requires_more_info'] } }),
            Supplier.countDocuments({ status: 'verified', isActive: { $ne: false }, isDeleted: { $ne: true } }),
            Order.countDocuments({ isDeleted: { $ne: true } }),
            Booking.countDocuments({ isDeleted: { $ne: true } })
        ]);

        // Revenue from PAID transactions
        const allOrders = await Order.find({ paymentStatus: 'paid', isDeleted: { $ne: true } })
            .sort({ createdAt: -1 })
            .populate('customer', 'firstName lastName');
        const recentOrders = allOrders.slice(0, 8);
        
        const allBookings = await Booking.find({ paymentStatus: 'paid', isDeleted: { $ne: true } });
        const [platformBookings, platformPurchaseOrders, platformStores] = await Promise.all([
            Booking.find({ isDeleted: { $ne: true } }).select('store status bookingDate startTime createdAt').lean(),
            PurchaseOrder.find({ isDeleted: { $ne: true } }).populate('supplier', 'businessName').lean(),
            Store.find(storeFilter).select('name isActive verificationStatus').lean()
        ]);
        
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
        const monthlyBookingRevenue = await Booking.aggregate([
            { $match: { createdAt: { $gte: sixMonthsAgo }, paymentStatus: 'paid', isDeleted: { $ne: true } } },
            { $group: { _id: { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } }, revenue: { $sum: '$totalPrice' }, fees: { $sum: '$platformFee' }, bookings: { $sum: 1 } } },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);
        const monthlyRevenueMap = new Map(monthlyRevenue.map(row => [`${row._id.year}-${row._id.month}`, row]));
        monthlyBookingRevenue.forEach(row => {
            const key = `${row._id.year}-${row._id.month}`;
            const existing = monthlyRevenueMap.get(key) || { _id: row._id, revenue: 0, fees: 0, orders: 0 };
            existing.revenue += row.revenue || 0;
            existing.fees += row.fees || 0;
            existing.bookings = row.bookings || 0;
            monthlyRevenueMap.set(key, existing);
        });
        const combinedMonthlyRevenue = [...monthlyRevenueMap.values()].sort((a, b) => a._id.year - b._id.year || a._id.month - b._id.month);

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
        const deliveryRows = await Delivery.find({}).select('status assignmentType pickedUpAt assignedAt deliveredAt createdAt').lean();
        const completedDeliveries = deliveryRows.filter(row => row.status === 'delivered');
        const deliveryDurations = completedDeliveries.map(row => {
            const start = row.pickedUpAt || row.assignedAt || row.createdAt;
            return start && row.deliveredAt ? (new Date(row.deliveredAt) - new Date(start)) / 60000 : null;
        }).filter(value => value !== null && value >= 0);
        const applicationStatus = await StoreApplication.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        const platformBookingDemand = DecisionSupportService.bookingDemandForecast(platformBookings);
        const platformSupplierReliability = DecisionSupportService.supplierInsights(platformPurchaseOrders);
        const storesNeedingIntervention = platformStores.map(storeRow => {
            const ownBookings = platformBookings.filter(booking => String(booking.store) === String(storeRow._id));
            const cancelled = ownBookings.filter(booking => ['cancelled', 'rejected', 'no_show'].includes(booking.status)).length;
            const cancellationRate = ownBookings.length ? cancelled / ownBookings.length * 100 : 0;
            const reasons = [];
            if (!storeRow.isActive) reasons.push('Store is inactive.');
            if (cancellationRate >= 25) reasons.push(`${cancellationRate.toFixed(1)}% booking cancellation rate.`);
            if (!ownBookings.length) reasons.push('No recorded booking activity.');
            return reasons.length ? {
                store: { id: storeRow._id, name: storeRow.name },
                severity: !storeRow.isActive || cancellationRate >= 35 ? 'high' : 'medium',
                why: reasons.join(' '),
                basedOn: [`${ownBookings.length} recorded bookings`, `${cancelled} cancelled or rejected bookings`, `Active status: ${storeRow.isActive !== false}`],
                recommendedAction: !storeRow.isActive ? 'Review store activation and application status.' : cancellationRate >= 25 ? 'Review booking cancellation reasons and staffing coverage.' : 'Verify onboarding and service availability.'
            } : null;
        }).filter(Boolean).slice(0, 8);

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

        // --- NEW: HI-FI DSS METRICS (Throughput, Velocity, Dynamics) ---
        const now = new Date();
        const last24h = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        const prev24h = new Date(now.getTime() - (48 * 60 * 60 * 1000));
        const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

        // 1. Transaction Velocity (Last 24h vs Previous 24h)
        const currentVelocity = await Order.countDocuments({ createdAt: { $gte: last24h }, isDeleted: { $ne: true } }) +
                                 await Booking.countDocuments({ createdAt: { $gte: last24h }, isDeleted: { $ne: true } });
        const previousVelocity = await Order.countDocuments({ createdAt: { $gte: prev24h, $lt: last24h }, isDeleted: { $ne: true } }) +
                                  await Booking.countDocuments({ createdAt: { $gte: prev24h, $lt: last24h }, isDeleted: { $ne: true } });
        const velocityTrend = previousVelocity === 0 ? (currentVelocity > 0 ? 100 : 0) : ((currentVelocity - previousVelocity) / previousVelocity) * 100;

        // 2. Marketplace Throughput (Volume per period)
        const dailyThroughput = currentVelocity; 
        const weeklyThroughput = await Order.countDocuments({ createdAt: { $gte: sevenDaysAgo }, isDeleted: { $ne: true } }) +
                                  await Booking.countDocuments({ createdAt: { $gte: sevenDaysAgo }, isDeleted: { $ne: true } });
        const monthlyThroughput = await Order.countDocuments({ createdAt: { $gte: thirtyDaysAgo }, isDeleted: { $ne: true } }) +
                                   await Booking.countDocuments({ createdAt: { $gte: thirtyDaysAgo }, isDeleted: { $ne: true } });

        // 3. Robust Category Dynamics (Unified View)
        const unifiedCategories = [
            ...productCategories.map(c => ({ name: c._id, count: c.count, type: 'Product' })),
            ...speciesDistribution.map(s => ({ name: s._id, count: s.count, type: 'Species' }))
        ].sort((a, b) => b.count - a.count).slice(0, 8);


        // Smart recommendations
        const recommendations = [];
        if (allOrders.length > 0 && cancelledOrders > allOrders.length * 0.25) recommendations.push({ type: 'critical', title: 'High Platform Cancellation Rate', message: `${((cancelledOrders / allOrders.length) * 100).toFixed(0)}% orders cancelled. Investigate root causes.`, priority: 'critical', why: 'The paid-order cancellation share is above the 25% intervention threshold.', basedOn: [`${cancelledOrders} cancelled of ${allOrders.length} paid orders`], recommendedAction: 'Review cancellation reasons and affected stores before changing policy.' });
        if (totalStores > 0 && activeStores < totalStores * 0.7) recommendations.push({ type: 'warning', title: 'Inactive Stores', message: `${totalStores - activeStores} stores are inactive. Consider outreach programs.`, priority: 'high', why: 'Fewer than 70% of registered stores are currently active.', basedOn: [`${activeStores} active of ${totalStores} stores`], recommendedAction: 'Review inactive store verification and operational status.' });
        if (totalCustomers > 0 && allOrders.length > 0 && (allOrders.length / totalCustomers) < 1) recommendations.push({ type: 'info', title: 'Low Purchase Rate', message: 'Average orders per customer is below 1. Consider marketing campaigns.', priority: 'medium', why: 'Recorded paid orders are fewer than active customer accounts.', basedOn: [`${allOrders.length} paid orders`, `${totalCustomers} active customers`], recommendedAction: 'Inspect conversion by store and category before planning engagement activity.' });
        if (totalAdoptions > 0 && (successfulAdoptions / totalAdoptions) < 0.5) recommendations.push({ type: 'warning', title: 'Low Adoption Success Rate', message: `Only ${((successfulAdoptions / totalAdoptions) * 100).toFixed(0)}% adoptions succeed. Review the adoption process.`, priority: 'high', why: 'Fewer than half of recorded adoption requests reached an approved or delivered state.', basedOn: [`${successfulAdoptions} successful of ${totalAdoptions} requests`], recommendedAction: 'Review application rejection, handover, and cancellation reasons.' });
        if (totalStores === 0) recommendations.push({ type: 'info', title: 'No Stores Yet', message: 'Approve store applications to populate the platform with businesses.', priority: 'medium', why: 'There are no non-platform stores in the registry.', basedOn: ['Current store records'], recommendedAction: 'Review pending store applications.' });

        res.json({
            platform: {
                totalUsers,
                totalCustomers,
                totalAdmins,
                totalStores,
                activeStores,
                verifiedStores,
                pendingApplications: actualPendingApplications,
                activeSuppliers,
                totalPets,
                totalProducts,
                totalReviews,
                avgRating: avgPlatformRating[0]?.avg?.toFixed(1) || 0
            },
            recentUsers,
            revenue: {
                totalGross: totalGrossRevenue,
                totalPlatformFees: totalPlatformIncome,
                totalOrderRevenue: platformRevenue,
                totalBookingRevenue: bookingRevenue,
                combined: totalGrossRevenue
            },
            orders: {
                total: totalOrderCount,
                paid: allOrders.length,
                delivered: deliveredOrders,
                cancelled: cancelledOrders,
                fulfillmentRate: parseFloat(fulfillmentRate),
                recent: recentOrders
            },
            bookings: {
                total: totalBookingCount,
                paid: allBookings.length,
                completed: allBookings.filter(row => ['completed', 'finished'].includes(row.status)).length,
                pending: allBookings.filter(row => ['pending', 'awaiting_customer_confirmation', 'awaiting_payment'].includes(row.status)).length
            },
            deliveries: {
                total: deliveryRows.length,
                active: deliveryRows.filter(row => !['delivered', 'cancelled', 'returned_to_store'].includes(row.status)).length,
                completed: completedDeliveries.length,
                failed: deliveryRows.filter(row => ['failed_attempt', 'returned_to_store', 'declined'].includes(row.status)).length,
                internal: deliveryRows.filter(row => row.assignmentType === 'internal').length,
                thirdParty: deliveryRows.filter(row => row.assignmentType === 'third_party').length,
                averageMinutes: deliveryDurations.length ? Math.round(deliveryDurations.reduce((total, value) => total + value, 0) / deliveryDurations.length) : 0
            },
            applicationStatus,
            adoptions: {
                total: totalAdoptions,
                successful: successfulAdoptions,
                successRate: totalAdoptions ? parseFloat(((successfulAdoptions / totalAdoptions) * 100).toFixed(1)) : 0
            },
            monthlyRevenue: combinedMonthlyRevenue,
            userGrowth,
            customerGrowth,
            storeGrowth,
            storePerformance,
            speciesDistribution,
            productCategories,
            popularCategories,
            unifiedCategories,
            throughput: {
                daily: dailyThroughput,
                weekly: weeklyThroughput,
                monthly: monthlyThroughput
            },
            velocity: {
                current: currentVelocity,
                previous: previousVelocity,
                trend: velocityTrend.toFixed(1)
            },
            recommendations,
            platformDecisionSupport: {
                highestPerformingStores: storePerformance.map(row => ({ ...row, why: `${row.storeName} leads recorded delivered-order revenue.`, basedOn: [`${row.orderCount} delivered orders`, `₱${Number(row.revenue || 0).toLocaleString()} revenue`], recommendedAction: 'Monitor this store as a positive operating benchmark.' })),
                storesNeedingIntervention,
                supplierReliability: platformSupplierReliability.slice(0, 8),
                bookingDemand: platformBookingDemand
            }
        });
    } catch (error) {
        console.error('Super Admin DSS error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = {
    getCustomerInsights,
    getAdminInsights,
    getStaffInsights,
    getSuperAdminInsights
};
