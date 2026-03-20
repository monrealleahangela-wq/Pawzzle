const Voucher = require('../models/Voucher');

// Get all vouchers for the store
const getAllVouchers = async (req, res) => {
    try {
        const { search, isActive, page = 1, limit = 10 } = req.query;

        // Multi-tenant isolation: filter by store ID (from req.user.store)
        if (!req.user.store && req.user.role !== 'super_admin') {
            return res.status(403).json({ message: 'User does not have an assigned store' });
        }

        let filter = { isDeleted: { $ne: true } };

        if (req.user.role !== 'super_admin') {
            filter.store = req.user.store;
        }

        if (isActive === 'true') filter.isActive = true;
        if (isActive === 'false') filter.isActive = false;

        if (search) {
            filter.code = new RegExp(search, 'i');
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const vouchers = await Voucher.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Voucher.countDocuments(filter);

        res.json({
            vouchers,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalVouchers: total,
                hasNext: page * limit < total,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        console.error('Get vouchers error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Create a new voucher
const createVoucher = async (req, res) => {
    try {
        const { code, discountType, discountValue, minPurchase, startDate, endDate, usageLimit } = req.body;

        if (!req.user.store) {
            return res.status(403).json({ message: 'User does not have an assigned store' });
        }

        // Check if code already exists for this store
        const existingVoucher = await Voucher.findOne({ code: code.toUpperCase(), store: req.user.store });
        if (existingVoucher) {
            return res.status(400).json({ message: 'Voucher code already exists for this store' });
        }

        const voucher = new Voucher({
            code: code.toUpperCase(),
            discountType,
            discountValue,
            minPurchase,
            startDate,
            endDate,
            usageLimit,
            store: req.user.store
        });

        await voucher.save();
        res.status(201).json(voucher);
    } catch (error) {
        console.error('Create voucher error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Update a voucher
const updateVoucher = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const voucher = await Voucher.findOne({ _id: id, store: req.user.store });
        if (!voucher) {
            return res.status(404).json({ message: 'Voucher not found' });
        }

        // Don't allow updating the code if it's already used or exists elsewhere
        if (updateData.code && updateData.code.toUpperCase() !== voucher.code) {
            const existingVoucher = await Voucher.findOne({ code: updateData.code.toUpperCase(), store: req.user.store });
            if (existingVoucher) {
                return res.status(400).json({ message: 'Voucher code already exists' });
            }
            updateData.code = updateData.code.toUpperCase();
        }

        Object.assign(voucher, updateData);
        await voucher.save();

        res.json(voucher);
    } catch (error) {
        console.error('Update voucher error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Delete a voucher (soft delete)
const deleteVoucher = async (req, res) => {
    try {
        const { id } = req.params;
        const voucher = await Voucher.findOne({ _id: id, store: req.user.store });

        if (!voucher) {
            return res.status(404).json({ message: 'Voucher not found' });
        }

        voucher.isDeleted = true;
        await voucher.save();
        res.json({ message: 'Voucher deleted successfully' });
    } catch (error) {
        console.error('Delete voucher error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Toggle voucher status
const toggleVoucherStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const voucher = await Voucher.findOne({ _id: id, store: req.user.store });

        if (!voucher) {
            return res.status(404).json({ message: 'Voucher not found' });
        }

        voucher.isActive = !voucher.isActive;
        await voucher.save();

        res.json(voucher);
    } catch (error) {
        console.error('Toggle voucher status error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    getAllVouchers,
    createVoucher,
    updateVoucher,
    deleteVoucher,
    toggleVoucherStatus
};
