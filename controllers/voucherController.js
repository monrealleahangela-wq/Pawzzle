const Voucher = require('../models/Voucher');
const UserVoucher = require('../models/UserVoucher');

// Get all claimable vouchers for a specific store or all stores
const getAvailableVouchers = async (req, res) => {
    try {
        const { storeId } = req.query;
        let query = { isActive: true, isDeleted: false };
        if (storeId) query.store = storeId;

        // Current date check
        const now = new Date();
        query.startDate = { $lte: now };
        query.endDate = { $gte: now };

        const vouchers = await Voucher.find(query).populate('store', 'name');

        // Check which ones are already claimed by the user
        const claimedIds = await UserVoucher.find({ user: req.user._id })
            .distinct('voucher');

        const availableVouchers = vouchers.filter(v => 
            !claimedIds.includes(v._id.toString()) && 
            (v.usageLimit === null || v.usedCount < v.usageLimit)
        );

        res.json({ vouchers: availableVouchers });
    } catch (error) {
        console.error('Get available vouchers error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Claim a voucher
const claimVoucher = async (req, res) => {
    try {
        const { voucherId } = req.body;
        const voucher = await Voucher.findById(voucherId);

        if (!voucher || !voucher.isActive || voucher.isDeleted) {
            return res.status(404).json({ message: 'Voucher not found or inactive' });
        }

        const now = new Date();
        if (now < voucher.startDate || now > voucher.endDate) {
            return res.status(400).json({ message: 'Voucher is not valid at this time' });
        }

        if (voucher.usageLimit !== null && voucher.usedCount >= voucher.usageLimit) {
            return res.status(400).json({ message: 'Voucher usage limit reached' });
        }

        // Check if already claimed
        const existingClaim = await UserVoucher.findOne({ user: req.user._id, voucher: voucherId });
        if (existingClaim) {
            return res.status(400).json({ message: 'Voucher already claimed' });
        }

        const userVoucher = new UserVoucher({
            user: req.user._id,
            voucher: voucherId,
            status: 'claimed'
        });

        await userVoucher.save();

        res.status(201).json({ message: 'Voucher claimed successfully', userVoucher });
    } catch (error) {
        console.error('Claim voucher error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get user's claimed vouchers
const getMyVouchers = async (req, res) => {
    try {
        const claimed = await UserVoucher.find({ user: req.user._id, status: 'claimed' })
            .populate({
                path: 'voucher',
                populate: { path: 'store', select: 'name' }
            });

        // Filter valid ones (not expired)
        const now = new Date();
        const validVouchers = claimed.filter(cv => 
            cv.voucher && 
            cv.voucher.isActive && 
            !cv.voucher.isDeleted &&
            now <= cv.voucher.endDate
        );

        res.json({ vouchers: validVouchers });
    } catch (error) {
        console.error('Get my vouchers error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Verify a voucher code
const verifyVoucher = async (req, res) => {
    try {
        const { code, storeId, purchaseAmount } = req.body;

        if (!code) {
            return res.status(400).json({ message: 'Voucher code is required' });
        }

        const voucher = await Voucher.findOne({
            code: code.toUpperCase(),
            isActive: true,
            store: storeId // Vouchers are store-specific
        });

        if (!voucher) {
            return res.status(404).json({ message: 'Invalid or expired voucher code' });
        }

        // NEW: Check if the user has claimed this voucher
        const claimedVoucher = await UserVoucher.findOne({
            user: req.user._id,
            voucher: voucher._id,
            status: 'claimed'
        });

        if (!claimedVoucher) {
            return res.status(400).json({ message: 'Voucher must be claimed first before use' });
        }

        const now = new Date();
        if (now < voucher.startDate || now > voucher.endDate) {
            return res.status(400).json({ message: 'Voucher is not valid at this time' });
        }

        if (voucher.usageLimit !== null && voucher.usedCount >= voucher.usageLimit) {
            return res.status(400).json({ message: 'Voucher usage limit reached' });
        }

        if (purchaseAmount < voucher.minPurchase) {
            return res.status(400).json({ message: `Minimum purchase of ₱${voucher.minPurchase} required for this voucher` });
        }

        let discountAmount = 0;
        if (voucher.discountType === 'percentage') {
            discountAmount = (purchaseAmount * (voucher.discountValue / 100));
        } else {
            discountAmount = voucher.discountValue;
        }

        res.json({
            message: 'Voucher applied successfully',
            voucher: {
                _id: voucher._id,
                code: voucher.code,
                discountType: voucher.discountType,
                discountValue: voucher.discountValue,
                discountAmount: Math.min(discountAmount, purchaseAmount)
            }
        });
    } catch (error) {
        console.error('Verify voucher error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    getAvailableVouchers,
    claimVoucher,
    getMyVouchers,
    verifyVoucher
};
