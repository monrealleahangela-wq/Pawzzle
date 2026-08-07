const User = require('../models/User');
const Store = require('../models/Store');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendStaffInvitation } = require('../utils/emailService');
const Delivery = require('../models/Delivery');
const RiderEarning = require('../models/RiderEarning');
const RiderPayout = require('../models/RiderPayout');

const DEFAULT_PERMISSIONS = {
    order_staff: {
        orders: { view: true, create: false, update: true, delete: false, fullAccess: false },
        bookings: { view: true, create: false, update: true, delete: false, fullAccess: false },
        customers: { view: true, create: false, update: false, delete: false, fullAccess: false },
        admin_chat: { view: true, create: true, update: true, delete: false, fullAccess: false }
    },
    inventory_staff: {
        pets: { view: true, create: true, update: true, delete: true, fullAccess: false },
        products: { view: true, create: true, update: true, delete: true, fullAccess: false },
        inventory: { view: true, create: true, update: true, delete: true, fullAccess: false }
    },
    service_staff: {
        services: { view: true, create: true, update: true, delete: true, fullAccess: false },
        bookings: { view: true, create: true, update: true, delete: false, fullAccess: false }
    },
    delivery_rider: {}
};

const RIDER_STATUSES = ['active', 'inactive', 'suspended'];
const PHONE_PATTERN = /^(?:\+?63|0)9\d{9}$/;
const getOwnedStoreIds = async (user) => {
    if (user.role === 'super_admin') return null;
    const stores = await Store.find({ owner: user._id }).select('_id');
    return stores.map(store => store._id);
};
const canAccessStore = async (user, storeId) => {
    if (user.role === 'super_admin') return true;
    const ids = await getOwnedStoreIds(user);
    return ids.some(id => id.toString() === storeId.toString());
};
const cleanRiderProfile = (profile = {}, existing = {}) => ({
    staffId: String(profile.staffId || existing.staffId || '').trim().toUpperCase(),
    accountStatus: profile.accountStatus || existing.accountStatus || 'active',
    vehicleType: profile.vehicleType ?? existing.vehicleType ?? '',
    plateNumber: String(profile.plateNumber ?? existing.plateNumber ?? '').trim().toUpperCase(),
    licenseId: String(profile.licenseId ?? existing.licenseId ?? '').trim(),
    deliveryZone: String(profile.deliveryZone ?? existing.deliveryZone ?? '').trim(),
    earningRules: {
        baseRate: Number(profile.earningRules?.baseRate ?? existing.earningRules?.baseRate ?? 0),
        incentive: Number(profile.earningRules?.incentive ?? existing.earningRules?.incentive ?? 0),
        bonus: Number(profile.earningRules?.bonus ?? existing.earningRules?.bonus ?? 0),
        deduction: Number(profile.earningRules?.deduction ?? existing.earningRules?.deduction ?? 0)
    },
    payoutMethod: {
        type: profile.payoutMethod?.type ?? existing.payoutMethod?.type ?? '',
        accountName: String(profile.payoutMethod?.accountName ?? existing.payoutMethod?.accountName ?? '').trim(),
        accountNumber: String(profile.payoutMethod?.accountNumber ?? existing.payoutMethod?.accountNumber ?? '').trim(),
        bankName: String(profile.payoutMethod?.bankName ?? existing.payoutMethod?.bankName ?? '').trim()
    }
});
const validateRider = (profile, phone) => {
    if (!profile.staffId) return 'Staff ID is required for a Delivery Rider.';
    if (!PHONE_PATTERN.test(String(phone || '').replace(/[\s-]/g, ''))) return 'Enter a valid Philippine mobile number.';
    if (!profile.vehicleType) return 'Vehicle type is required for a Delivery Rider.';
    if (profile.vehicleType !== 'bicycle' && !profile.plateNumber) return 'Vehicle plate number is required.';
    if (!RIDER_STATUSES.includes(profile.accountStatus)) return 'Invalid rider account status.';
    if (Object.values(profile.earningRules).some(value => !Number.isFinite(value) || value < 0)) return 'Earning values must be valid non-negative amounts.';
    if (profile.earningRules.deduction > profile.earningRules.baseRate + profile.earningRules.incentive + profile.earningRules.bonus) return 'Deduction cannot exceed the rider earning.';
    if (profile.payoutMethod.type && (!profile.payoutMethod.accountName || !profile.payoutMethod.accountNumber)) return 'Complete the selected payout account details.';
    return null;
};

/**
 * Get all staff under the current admin's store
 */
const getMyStaff = async (req, res) => {
    try {
        const { storeId } = req.query;
        let query = { role: 'staff', isDeleted: false };

        if (req.user.role === 'super_admin') {
            if (storeId) query.store = storeId;
        } else {
            // Find all stores owned by this admin
            const adminStores = await Store.find({ owner: req.user._id }).select('_id');
            const storeIds = adminStores.map(s => s._id);

            if (storeId) {
                if (!storeIds.map(id => id.toString()).includes(storeId)) {
                    return res.status(403).json({ message: 'Access denied to this store' });
                }
                query.store = storeId;
            } else {
                query.store = { $in: storeIds };
            }
        }

        const staff = await User.find(query)
            .populate('store', 'name')
            .select('-password')
            .sort({ createdAt: -1 });

        res.json({ staff });
    } catch (error) {
        console.error('getMyStaff error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Create a new staff account under the admin's store
 */
const createStaff = async (req, res) => {
    console.log('--- 🚀 INITIATING STAFF ONBOARDING 🚀 ---');
    try {
        const { firstName, lastName, email, username, phone, staffType, targetStoreId, permissions, riderProfile } = req.body;

        // Standardize inputs
        const cleanEmail = email?.trim().toLowerCase();
        const cleanUsername = username?.trim();
        const cleanFirstName = firstName?.trim();
        const cleanLastName = lastName?.trim();

        if (!cleanEmail || !cleanFirstName || !cleanLastName || !cleanUsername || !staffType || !targetStoreId) {
            return res.status(400).json({ message: 'Missing required staff metadata fields' });
        }

        // Verify store access
        if (req.user.role !== 'super_admin') {
            if (!(await canAccessStore(req.user, targetStoreId))) {
                return res.status(403).json({ message: 'Store access denied' });
            }
        }

        let normalizedRiderProfile;
        if (staffType === 'delivery_rider') {
            normalizedRiderProfile = cleanRiderProfile(riderProfile);
            const riderError = validateRider(normalizedRiderProfile, phone);
            if (riderError) return res.status(400).json({ message: riderError });
            const duplicateStaffId = await User.findOne({ 'riderProfile.staffId': normalizedRiderProfile.staffId, isDeleted: false });
            if (duplicateStaffId) return res.status(409).json({ message: 'Staff ID is already registered.' });
        }

        // Check uniqueness
        const existingUser = await User.findOne({
            $or: [{ email: cleanEmail }, { username: cleanUsername }],
            isDeleted: false
        });

        if (existingUser) {
            return res.status(409).json({
                message: existingUser.email === cleanEmail
                    ? 'Email is already registered.'
                    : 'Username is already taken.'
            });
        }

        // 🛡️ SECURITY: Generate temporary secure password
        const tempPassword = crypto.randomBytes(6).toString('hex');
        const store = await Store.findById(targetStoreId);
        
        // Use store address as base
        let staffAddress = { street: 'N/A', city: 'N/A', province: 'Cavite', barangay: 'N/A', country: 'PH' };
        if (store?.contactInfo?.address) {
            staffAddress = {
                street: store.contactInfo.address.street || 'N/A',
                city: store.contactInfo.address.city || 'N/A',
                province: store.contactInfo.address.state || store.contactInfo.address.province || 'Cavite',
                barangay: store.contactInfo.address.barangay || 'N/A',
                zipCode: store.contactInfo.address.zipCode || '',
                country: 'PH'
            };
        }

        const staff = new User({
            firstName: cleanFirstName,
            lastName: cleanLastName,
            email: cleanEmail,
            username: cleanUsername,
            password: tempPassword,
            phone: phone || '',
            role: 'staff',
            staffType,
            store: targetStoreId,
            createdBy: req.user._id,
            isActive: true,
            requiresPasswordChange: true,
            address: staffAddress,
            permissions: permissions || DEFAULT_PERMISSIONS[staffType] || {}
        });
        if (normalizedRiderProfile) staff.riderProfile = normalizedRiderProfile;

        await staff.save();
        console.log('✅ Staff record saved.');

        // 📧 Send Invitation Email
        let emailResult = { success: false };
        try {
            emailResult = await sendStaffInvitation(cleanEmail, tempPassword, cleanFirstName);
        } catch (emailErr) {
            console.error('❌ Email Task Error:', emailErr.message);
            emailResult = { success: false, error: emailErr.message };
        }
        
        const emailSent = emailResult.success;
        const staffObj = staff.toObject();
        delete staffObj.password;

        let message = emailSent 
            ? 'Staff account created and invitation sent successfully.' 
            : `Staff created, but email failed: ${emailResult.errorMessage || emailResult.error || 'Unknown service error'}.`;
        
        return res.status(201).json({ 
            message: message,
            staff: staffObj,
            emailSent: emailSent,
            emailProvider: emailResult.provider,
            emailError: emailResult.errorMessage || emailResult.error,
            credentialsProvided: true
        });
    } catch (error) {
        console.error('CRITICAL: createStaff catch-all triggered:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ message: `Validation Failed: ${messages.join(', ')}` });
        }
        return res.status(500).json({ 
            message: error.code === 11000 ? 'Identity already exists' : 'Internal server failure during staff boarding', 
            error: error.message
        });
    }
};

/**
 * Update a staff member's details
 */
const updateStaff = async (req, res) => {
    try {
        const { id } = req.params;
        const { firstName, lastName, phone, staffType, isActive, permissions, riderProfile } = req.body;

        const query = { _id: id, role: 'staff', isDeleted: false };

        const staff = await User.findOne(query);
        if (!staff) {
            return res.status(404).json({ message: 'Staff member not found or access denied' });
        }
        if (!(await canAccessStore(req.user, staff.store))) return res.status(403).json({ message: 'Staff member not found or access denied' });

        if (firstName) staff.firstName = firstName;
        if (lastName) staff.lastName = lastName;
        if (phone !== undefined) staff.phone = phone;
        if (staffType) staff.staffType = staffType;
        if (isActive !== undefined) staff.isActive = isActive;
        
        if (permissions) {
            staff.permissions = permissions;
            staff.markModified('permissions'); // Ensure Mongoose detects object structure changes
        }
        const resultingType = staffType || staff.staffType;
        if (resultingType === 'delivery_rider') {
            const normalized = cleanRiderProfile(riderProfile, staff.riderProfile || {});
            const riderError = validateRider(normalized, phone !== undefined ? phone : staff.phone);
            if (riderError) return res.status(400).json({ message: riderError });
            const duplicate = await User.findOne({ _id: { $ne: staff._id }, 'riderProfile.staffId': normalized.staffId, isDeleted: false });
            if (duplicate) return res.status(409).json({ message: 'Staff ID is already registered.' });
            staff.riderProfile = normalized;
            staff.isActive = normalized.accountStatus === 'active';
        }

        await staff.save();

        const staffObj = staff.toObject();
        delete staffObj.password;

        res.json({ message: 'Staff updated successfully', staff: staffObj });
    } catch (error) {
        console.error('updateStaff error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Deactivate / reactivate a staff account
 */
const toggleStaffStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const staff = await User.findOne({ _id: id, role: 'staff', isDeleted: false });
        if (!staff) return res.status(404).json({ message: 'Staff member not found' });
        if (!(await canAccessStore(req.user, staff.store))) return res.status(403).json({ message: 'Staff member not found' });

        staff.isActive = !staff.isActive;
        if (staff.staffType === 'delivery_rider') staff.riderProfile.accountStatus = staff.isActive ? 'active' : 'inactive';
        await staff.save();

        res.json({
            message: `Staff account ${staff.isActive ? 'activated' : 'deactivated'} successfully`,
            isActive: staff.isActive
        });
    } catch (error) {
        console.error('toggleStaffStatus error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Permanently delete (soft-delete) a staff account
 */
const deleteStaff = async (req, res) => {
    try {
        const { id } = req.params;
        const staff = await User.findOne({ _id: id, role: 'staff', isDeleted: false });
        if (!staff) return res.status(404).json({ message: 'Staff member not found' });
        if (!(await canAccessStore(req.user, staff.store))) return res.status(403).json({ message: 'Staff member not found' });

        staff.isDeleted = true;
        staff.isActive = false;
        await staff.save();

        res.json({ message: 'Staff account removed successfully' });
    } catch (error) {
        console.error('deleteStaff error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Reset staff password (admin action)
 */
const resetStaffPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        const staff = await User.findOne({ _id: id, role: 'staff', isDeleted: false });
        if (!staff) return res.status(404).json({ message: 'Staff member not found' });
        if (!(await canAccessStore(req.user, staff.store))) return res.status(403).json({ message: 'Staff member not found' });

        staff.password = newPassword; // Pre-save hook will hash it
        await staff.save();

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        console.error('resetStaffPassword error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const getEligibleRiders = async (req, res) => {
    try {
        const storeIds = req.user.role === 'super_admin'
            ? (req.query.storeId ? [req.query.storeId] : [])
            : await getOwnedStoreIds(req.user);
        const query = {
            role: 'staff', staffType: 'delivery_rider', isDeleted: false, isActive: true,
            'riderProfile.accountStatus': 'active'
        };
        if (storeIds?.length) query.store = { $in: storeIds };
        const riders = await User.find(query).select('-password').populate('store', 'name').lean();
        const counts = await Delivery.aggregate([
            { $match: { assignedRider: { $in: riders.map(r => r._id) }, status: { $nin: ['delivered', 'cancelled', 'returned_to_store'] } } },
            { $group: { _id: '$assignedRider', count: { $sum: 1 } } }
        ]);
        const byRider = Object.fromEntries(counts.map(row => [row._id.toString(), row.count]));
        res.json({ riders: riders.map(rider => ({ ...rider, activeDeliveryCount: byRider[rider._id.toString()] || 0, availability: 'available' })) });
    } catch (error) {
        console.error('getEligibleRiders error:', error);
        res.status(500).json({ message: 'Unable to load eligible riders.' });
    }
};

const getRiderDetails = async (req, res) => {
    try {
        const rider = await User.findOne({ _id: req.params.id, role: 'staff', staffType: 'delivery_rider', isDeleted: false })
            .select('-password').populate('store', 'name').lean();
        if (!rider) return res.status(404).json({ message: 'Delivery Rider not found.' });
        if (req.user._id.toString() !== rider._id.toString() && !(await canAccessStore(req.user, rider.store._id || rider.store))) return res.status(403).json({ message: 'Access denied.' });
        const [deliveries, earnings, payouts] = await Promise.all([
            Delivery.find({ assignedRider: rider._id }).populate({ path: 'order', populate: { path: 'customer', select: 'firstName lastName' } }).sort({ createdAt: -1 }).limit(100).lean(),
            RiderEarning.find({ rider: rider._id }).populate('delivery', 'trackingToken status deliveredAt proofOfDelivery').sort({ earnedAt: -1 }).lean(),
            RiderPayout.find({ rider: rider._id }).sort({ createdAt: -1 }).lean()
        ]);
        const completed = deliveries.filter(d => d.status === 'delivered').length;
        const failed = deliveries.filter(d => ['failed_attempt', 'returned_to_store'].includes(d.status)).length;
        const totalFinished = completed + failed;
        const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
        const sum = (items, predicate = () => true) => items.filter(predicate).reduce((total, item) => total + item.amount, 0);
        res.json({
            rider,
            stats: { totalAssigned: deliveries.length, completed, failed, successRate: totalFinished ? Math.round(completed / totalFinished * 100) : 0 },
            earnings: {
                today: sum(earnings, e => new Date(e.earnedAt) >= startToday),
                available: sum(earnings, e => e.status === 'available'),
                pending: sum(earnings, e => e.status === 'processing'),
                totalPaid: sum(earnings, e => e.status === 'paid'),
                records: earnings
            },
            payouts,
            deliveries
        });
    } catch (error) {
        console.error('getRiderDetails error:', error);
        res.status(500).json({ message: 'Unable to load rider information.' });
    }
};

const getMyRiderDetails = async (req, res) => {
    if (req.user.role !== 'staff' || req.user.staffType !== 'delivery_rider') return res.status(403).json({ message: 'Delivery Rider access only.' });
    req.params.id = req.user._id.toString();
    return getRiderDetails(req, res);
};

const createRiderPayout = async (req, res) => {
    try {
        const rider = await User.findOne({ _id: req.params.id, role: 'staff', staffType: 'delivery_rider', isDeleted: false });
        if (!rider) return res.status(404).json({ message: 'Delivery Rider not found.' });
        if (!(await canAccessStore(req.user, rider.store))) return res.status(403).json({ message: 'Access denied.' });
        const earnings = await RiderEarning.find({ rider: rider._id, status: 'available' });
        if (!earnings.length) return res.status(400).json({ message: 'This rider has no available earnings.' });
        const amount = earnings.reduce((total, earning) => total + earning.amount, 0);
        const method = rider.riderProfile?.payoutMethod;
        if (!method?.type || !method.accountName || !method.accountNumber) return res.status(400).json({ message: 'Configure the rider payout method first.' });
        const payout = await RiderPayout.create({ rider: rider._id, store: rider.store, amount, earnings: earnings.map(e => e._id), paymentMethod: method });
        await RiderEarning.updateMany({ _id: { $in: earnings.map(e => e._id) } }, { status: 'processing', payout: payout._id });
        res.status(201).json({ message: 'Rider payout created.', payout });
    } catch (error) {
        console.error('createRiderPayout error:', error);
        res.status(500).json({ message: 'Unable to create rider payout.' });
    }
};

const updateRiderPayout = async (req, res) => {
    try {
        const payout = await RiderPayout.findById(req.params.payoutId);
        if (!payout) return res.status(404).json({ message: 'Payout not found.' });
        if (!(await canAccessStore(req.user, payout.store))) return res.status(403).json({ message: 'Access denied.' });
        const { status, referenceNumber, notes } = req.body;
        if (!['processing', 'paid', 'failed'].includes(status)) return res.status(400).json({ message: 'Invalid payout status.' });
        if (status === 'paid' && !String(referenceNumber || '').trim()) return res.status(400).json({ message: 'Reference number is required for paid payouts.' });
        payout.status = status; payout.referenceNumber = referenceNumber || payout.referenceNumber; payout.notes = notes || payout.notes;
        payout.processedBy = req.user._id; payout.processedAt = new Date(); await payout.save();
        await RiderEarning.updateMany({ _id: { $in: payout.earnings } }, { status: status === 'paid' ? 'paid' : status === 'failed' ? 'available' : 'processing', payout: status === 'failed' ? null : payout._id });
        res.json({ message: `Payout marked ${status}.`, payout });
    } catch (error) {
        console.error('updateRiderPayout error:', error);
        res.status(500).json({ message: 'Unable to update rider payout.' });
    }
};

module.exports = {
    getMyStaff,
    createStaff,
    updateStaff,
    toggleStaffStatus,
    deleteStaff,
    resetStaffPassword,
    getEligibleRiders,
    getRiderDetails,
    getMyRiderDetails,
    createRiderPayout,
    updateRiderPayout
};
