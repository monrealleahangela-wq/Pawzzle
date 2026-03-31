const Order = require('../models/Order');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Store = require('../models/Store');

/**
 * Get all unique customers who have ordered or booked from this store
 */
const getStoreCustomers = async (req, res) => {
    try {
        const adminUser = req.user;

        // Determine the store ID
        let storeId = adminUser.store;
        if (!storeId) {
            const store = await Store.findOne({ owner: adminUser._id });
            if (!store) return res.status(404).json({ message: 'Store not found' });
            storeId = store._id;
        }

        // Fetch all orders for this store
        const orders = await Order.find({ store: storeId, isDeleted: false })
            .populate('customer', 'firstName lastName email phone avatar createdAt')
            .sort({ createdAt: -1 });

        // Fetch all bookings for this store
        const bookings = await Booking.find({ store: storeId, isDeleted: false })
            .populate('customer', 'firstName lastName email phone avatar createdAt')
            .populate('service', 'name price')
            .sort({ createdAt: -1 });

        // Build a map of unique customers with aggregated stats
        const customerMap = {};

        for (const order of orders) {
            if (!order.customer) continue;
            const cid = order.customer._id.toString();
            if (!customerMap[cid]) {
                customerMap[cid] = {
                    _id: order.customer._id,
                    firstName: order.customer.firstName,
                    lastName: order.customer.lastName,
                    email: order.customer.email,
                    phone: order.customer.phone,
                    avatar: order.customer.avatar,
                    joinedAt: order.customer.createdAt,
                    totalOrders: 0,
                    totalSpentOrders: 0,
                    totalBookings: 0,
                    totalSpentBookings: 0,
                    lastActivity: null,
                    recentOrders: [],
                    recentBookings: []
                };
            }
            customerMap[cid].totalOrders += 1;
            if (order.paymentStatus === 'paid') {
                customerMap[cid].totalSpentOrders += order.totalAmount || 0;
            }
            if (!customerMap[cid].lastActivity || new Date(order.createdAt) > new Date(customerMap[cid].lastActivity)) {
                customerMap[cid].lastActivity = order.createdAt;
            }
            if (customerMap[cid].recentOrders.length < 5) {
                customerMap[cid].recentOrders.push({
                    _id: order._id,
                    orderNumber: order.orderNumber,
                    totalAmount: order.totalAmount,
                    status: order.status,
                    paymentStatus: order.paymentStatus,
                    createdAt: order.createdAt,
                    items: order.items?.slice(0, 3)
                });
            }
        }

        for (const booking of bookings) {
            if (!booking.customer) continue;
            const cid = booking.customer._id.toString();
            if (!customerMap[cid]) {
                customerMap[cid] = {
                    _id: booking.customer._id,
                    firstName: booking.customer.firstName,
                    lastName: booking.customer.lastName,
                    email: booking.customer.email,
                    phone: booking.customer.phone,
                    avatar: booking.customer.avatar,
                    joinedAt: booking.customer.createdAt,
                    totalOrders: 0,
                    totalSpentOrders: 0,
                    totalBookings: 0,
                    totalSpentBookings: 0,
                    lastActivity: null,
                    recentOrders: [],
                    recentBookings: []
                };
            }
            customerMap[cid].totalBookings += 1;
            if (booking.paymentStatus === 'paid') {
                customerMap[cid].totalSpentBookings += booking.totalPrice || 0;
            }
            if (!customerMap[cid].lastActivity || new Date(booking.createdAt) > new Date(customerMap[cid].lastActivity)) {
                customerMap[cid].lastActivity = booking.createdAt;
            }
            if (customerMap[cid].recentBookings.length < 5) {
                customerMap[cid].recentBookings.push({
                    _id: booking._id,
                    service: booking.service?.name,
                    totalPrice: booking.totalPrice,
                    status: booking.status,
                    bookingDate: booking.bookingDate,
                    startTime: booking.startTime,
                    pet: booking.pet
                });
            }
        }

        // Convert to array, sort by last activity descending
        const customers = Object.values(customerMap)
            .map(c => ({
                ...c,
                totalSpent: c.totalSpentOrders + c.totalSpentBookings,
                totalInteractions: c.totalOrders + c.totalBookings
            }))
            .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

        res.json({ customers, total: customers.length });
    } catch (error) {
        console.error('getStoreCustomers error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const getStoreCustomerDetails = async (req, res) => {
    try {
        const adminUser = req.user;
        const customerId = req.params.customerId;

        // Determine the store ID
        let storeId = adminUser.store;
        if (!storeId) {
            const store = await Store.findOne({ owner: adminUser._id });
            if (!store) return res.status(404).json({ message: 'Store not found' });
            storeId = store._id;
        }

        const customer = await User.findById(customerId).select('firstName lastName email phone avatar createdAt shippingAddress');
        if (!customer) return res.status(404).json({ message: 'Customer not found' });

        // Fetch all orders for this store by this customer
        const orders = await Order.find({ store: storeId, customer: customerId, isDeleted: false })
            .sort({ createdAt: -1 });

        // Fetch all bookings for this store by this customer
        const bookings = await Booking.find({ store: storeId, customer: customerId, isDeleted: false })
            .populate('service', 'name price')
            .sort({ createdAt: -1 });

        const totalSpentOrders = orders.filter(o => o.paymentStatus === 'paid').reduce((acc, o) => acc + (o.totalAmount || 0), 0);
        const totalSpentBookings = bookings.filter(b => b.paymentStatus === 'paid').reduce((acc, b) => acc + (b.totalPrice || 0), 0);

        const details = {
            _id: customer._id,
            firstName: customer.firstName,
            lastName: customer.lastName,
            email: customer.email,
            phone: customer.phone,
            avatar: customer.avatar,
            joinedAt: customer.createdAt,
            shippingAddress: customer.shippingAddress,
            totalOrders: orders.length,
            totalSpentOrders,
            totalBookings: bookings.length,
            totalSpentBookings,
            totalSpent: totalSpentOrders + totalSpentBookings,
            totalInteractions: orders.length + bookings.length,
            recentOrders: orders.slice(0, 5).map(o => ({
                _id: o._id,
                orderNumber: o.orderNumber,
                totalAmount: o.totalAmount,
                status: o.status,
                paymentStatus: o.paymentStatus,
                createdAt: o.createdAt,
                items: o.items?.slice(0, 3)
            })),
            recentBookings: bookings.slice(0, 5).map(b => ({
                _id: b._id,
                service: b.service?.name,
                totalPrice: b.totalPrice,
                status: b.status,
                bookingDate: b.bookingDate,
                startTime: b.startTime,
                pet: b.pet
            }))
        };

        res.json({ customer: details });
    } catch (error) {
        console.error('getStoreCustomerDetails error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { getStoreCustomers, getStoreCustomerDetails };
