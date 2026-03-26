const User = require('../models/User');
const Store = require('../models/Store');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendStaffInvitation } = require('../utils/emailService');

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
    try {
        const { firstName, lastName, email, username, password, staffType, phone, storeId } = req.body;

        if (!firstName || !lastName || !email || !username || !staffType) {
            return res.status(400).json({ message: 'Missing required staff fields' });
        }

        // Generate temporary password if not provided
        const tempPassword = password || crypto.randomBytes(6).toString('hex');

        // Determine target store
        let targetStoreId = storeId || req.user.store;
        if (!targetStoreId) {
            const adminStore = await Store.findOne({ owner: req.user._id });
            if (!adminStore) {
                return res.status(400).json({ message: 'Admin must own a store to hire staff' });
            }
            targetStoreId = adminStore._id;
        }

        // Verify ownership/permission if not super admin
        if (req.user.role !== 'super_admin') {
            const isOwner = await Store.findOne({ _id: targetStoreId, owner: req.user._id });
            if (!isOwner) return res.status(403).json({ message: 'Store access denied' });
        }

        const validTypes = ['order_staff', 'inventory_staff', 'service_staff'];
        if (!validTypes.includes(staffType)) {
            return res.status(400).json({ message: 'Invalid staff specialization' });
        }

        const existing = await User.findOne({ $or: [{ email }, { username }] });
        if (existing) {
            return res.status(409).json({ message: 'Credentials already registered' });
        }

        const store = await Store.findById(targetStoreId);
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
            firstName,
            lastName,
            email,
            username,
            password: tempPassword,
            phone: phone || '',
            role: 'staff',
            staffType,
            store: targetStoreId,
            createdBy: req.user._id,
            isActive: true,
            requiresPasswordChange: true, // 🛡️ Enforce first-login change
            address: staffAddress
        });

        await staff.save();

        // 📧 Send Invitation Email
        try {
            await sendStaffInvitation(email, tempPassword, firstName);
        } catch (emailErr) {
            console.error('Failed to send staff welcome email:', emailErr.message);
            // We still proceed since account is created
        }

        const staffObj = staff.toObject();
        delete staffObj.password;

        res.status(201).json({ 
            message: 'Staff account invited successfully. An email with credentials has been sent.', 
            staff: staffObj 
        });
    } catch (error) {
        console.error('createStaff error:', error);
        res.status(500).json({ message: 'Staff creation failed' });
    }
};

/**
 * Update a staff member's details
 */
const updateStaff = async (req, res) => {
    try {
        const { id } = req.params;
        const { firstName, lastName, phone, staffType, isActive } = req.body;

        const staff = await User.findOne({ _id: id, store: req.user.store, role: 'staff' });
        if (!staff) {
            return res.status(404).json({ message: 'Staff member not found' });
        }

        if (firstName) staff.firstName = firstName;
        if (lastName) staff.lastName = lastName;
        if (phone !== undefined) staff.phone = phone;
        if (staffType) staff.staffType = staffType;
        if (isActive !== undefined) staff.isActive = isActive;

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
        const staff = await User.findOne({ _id: id, store: req.user.store, role: 'staff' });
        if (!staff) return res.status(404).json({ message: 'Staff member not found' });

        staff.isActive = !staff.isActive;
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
        const staff = await User.findOne({ _id: id, store: req.user.store, role: 'staff' });
        if (!staff) return res.status(404).json({ message: 'Staff member not found' });

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

        const staff = await User.findOne({ _id: id, store: req.user.store, role: 'staff' });
        if (!staff) return res.status(404).json({ message: 'Staff member not found' });

        staff.password = newPassword; // Pre-save hook will hash it
        await staff.save();

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        console.error('resetStaffPassword error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    getMyStaff,
    createStaff,
    updateStaff,
    toggleStaffStatus,
    deleteStaff,
    resetStaffPassword
};
