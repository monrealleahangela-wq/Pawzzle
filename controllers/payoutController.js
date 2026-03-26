const Payout = require('../models/Payout');
const Store = require('../models/Store');
const Order = require('../models/Order');
const { createNotification } = require('./notificationController');

/**
 * Get payout statistics for a store
 */
const getPayoutStats = async (req, res) => {
    try {
        const store = await Store.findOne({ owner: req.user._id });
        if (!store) {
            return res.status(404).json({ message: 'Store not found' });
        }

        const pendingPayouts = await Payout.find({ store: store._id, status: 'pending' });
        const TotalPendingAmount = pendingPayouts.reduce((sum, p) => sum + p.amount, 0);

        const completedPayouts = await Payout.find({ store: store._id, status: 'completed' });
        const TotalWithdrawnAmount = completedPayouts.reduce((sum, p) => sum + p.amount, 0);

        res.json({
            balance: store.balance || 0,
            totalRevenue: store.stats?.totalRevenue || 0,
            totalPlatformFees: store.stats?.totalPlatformFees || (store.stats?.totalRevenue ? store.stats.totalRevenue * 0.1 : 0),
            pendingPayouts: TotalPendingAmount,
            totalWithdrawn: TotalWithdrawnAmount,
            payoutMethods: store.payoutMethods || []
        });
    } catch (error) {
        console.error('Get payout stats error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Request a payout
 */
const requestPayout = async (req, res) => {
    try {
        const { amount, payoutMethodId } = req.body;
        const store = await Store.findOne({ owner: req.user._id });

        if (!store) {
            return res.status(404).json({ message: 'Store not found' });
        }

        if (amount < 100) {
            return res.status(400).json({ message: 'Minimum withdrawal is ₱100' });
        }

        if (store.balance < amount) {
            return res.status(400).json({ message: 'Insufficient balance' });
        }

        const method = store.payoutMethods.id(payoutMethodId);
        if (!method) {
            return res.status(400).json({ message: 'Invalid payout method selected' });
        }

        const payout = new Payout({
            store: store._id,
            owner: req.user._id,
            amount,
            payoutMethod: {
                type: method.type,
                accountName: method.accountName,
                accountNumber: method.accountNumber,
                bankName: method.bankName
            },
            status: 'pending'
        });

        // Deduct from balance immediately to "reserve" it
        store.balance -= amount;
        await store.save();
        await payout.save();

        res.status(201).json({ message: 'Payout requested successfully', payout });
    } catch (error) {
        console.error('Request payout error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Get payout history for a store
 */
const getPayoutHistory = async (req, res) => {
    try {
        const store = await Store.findOne({ owner: req.user._id });
        if (!store) return res.status(404).json({ message: 'Store not found' });

        const payouts = await Payout.find({ store: store._id })
            .populate('store', 'name logo')
            .populate('owner', 'firstName lastName email')
            .populate('processedBy', 'firstName lastName')
            .sort({ requestedAt: -1 });
        res.json(payouts);
    } catch (error) {
        console.error('Get payout history error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Update payout methods
 */
const updatePayoutMethods = async (req, res) => {
    try {
        const { payoutMethods } = req.body;
        const store = await Store.findOne({ owner: req.user._id });
        if (!store) return res.status(404).json({ message: 'Store not found' });

        store.payoutMethods = payoutMethods;
        await store.save();

        res.json({ message: 'Payout methods updated', payoutMethods: store.payoutMethods });
    } catch (error) {
        console.error('Update payout methods error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * ADMIN: Get all payout requests
 */
const getAllPayoutRequests = async (req, res) => {
    try {
        const { status } = req.query;
        const filter = status ? { status } : {};

        const payouts = await Payout.find(filter)
            .populate('store', 'name logo')
            .populate('owner', 'firstName lastName email')
            .populate('processedBy', 'firstName lastName')
            .sort({ requestedAt: -1 });

        res.json(payouts);
    } catch (error) {
        console.error('Get all payout requests error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * ADMIN: Process payout (Accept/Reject)
 */
const processPayout = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, adminNotes } = req.body; // action: 'approve', 'reject', 'complete'

        const payout = await Payout.findById(id);
        if (!payout) return res.status(404).json({ message: 'Payout not found' });

        if (payout.status === 'completed' || payout.status === 'rejected') {
            return res.status(400).json({ message: 'Payout is already processed' });
        }

        if (action === 'approve') {
            payout.status = 'processing';
        } else if (action === 'reject') {
            payout.status = 'rejected';
            // Refund the balance back to the store
            await Store.findByIdAndUpdate(payout.store, { $inc: { balance: payout.amount } });
        } else if (action === 'complete') {
            payout.status = 'completed';
            payout.processedAt = new Date();
            payout.processedBy = req.user._id;
        }

        payout.adminNotes = adminNotes || payout.adminNotes;
        await payout.save();

        // Notify the user
        await createNotification({
            recipient: payout.owner,
            sender: req.user._id,
            type: 'order_status',
            title: 'Payout Update',
            message: `Your payout request ${payout.referenceNumber} has been ${payout.status}.`,
            relatedId: payout._id,
            relatedModel: 'Payout'
        });

        res.json({ message: `Payout marked as ${payout.status}`, payout });
    } catch (error) {
        console.error('Process payout error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    getPayoutStats,
    requestPayout,
    getPayoutHistory,
    updatePayoutMethods,
    getAllPayoutRequests,
    processPayout
};
