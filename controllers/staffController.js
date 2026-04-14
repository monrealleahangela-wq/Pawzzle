const User = require('../models/User');
const Store = require('../models/Store');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendStaffInvitation } = require('../utils/emailService');

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
    }
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
        const { firstName, lastName, email, username, phone, staffType, targetStoreId, permissions } = req.body;

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
            const isOwner = await Store.findOne({ _id: targetStoreId, owner: req.user._id });
            if (!isOwner) {
                return res.status(403).json({ message: 'Store access denied' });
            }
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
        const { firstName, lastName, phone, staffType, isActive, permissions } = req.body;

        const query = { _id: id, role: 'staff' };
        if (req.user.role !== 'super_admin') {
            query.store = req.user.store;
        }

        const staff = await User.findOne(query);
        if (!staff) {
            return res.status(404).json({ message: 'Staff member not found or access denied' });
        }

        if (firstName) staff.firstName = firstName;
        if (lastName) staff.lastName = lastName;
        if (phone !== undefined) staff.phone = phone;
        if (staffType) staff.staffType = staffType;
        if (isActive !== undefined) staff.isActive = isActive;
        
        if (permissions) {
            staff.permissions = permissions;
            staff.markModified('permissions'); // Ensure Mongoose detects object structure changes
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
