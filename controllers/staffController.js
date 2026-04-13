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
    try {
        console.log('--- 🚀 CREATE STAFF API HIT 🚀 ---');
        const { firstName, lastName, email, username, password, staffType, phone, storeId, permissions } = req.body;
        
        const cleanFirstName = firstName ? firstName.trim() : '';
        const cleanLastName = lastName ? lastName.trim() : '';
        const cleanEmail = email ? email.trim().toLowerCase() : '';
        const cleanUsername = username ? username.trim() : '';
        
        console.log(`Payload: ${JSON.stringify({ firstName: cleanFirstName, lastName: cleanLastName, email: cleanEmail, username: cleanUsername, staffType, phone, storeId })}`);

        const creatorId = req.user._id || req.user.id;
        console.log(`Creator ID: ${creatorId}`);

        if (!firstName || !lastName || !email || !username || !staffType) {
            console.log('❌ Missing required staff fields');
            return res.status(400).json({ message: 'Missing required staff fields' });
        }

        // Generate temporary password if not provided
        const tempPassword = password || crypto.randomBytes(6).toString('hex');
        console.log(`🔑 Generated Temp Password: ${tempPassword}`);

        // Determine target store
        let targetStoreId = storeId || req.user.store;
        if (!targetStoreId) {
            console.log('Attempting to find admin\'s default store...');
            const adminStore = await Store.findOne({ owner: req.user._id });
            if (!adminStore) {
                console.log('❌ Admin must own a store to hire staff');
                return res.status(400).json({ message: 'Admin must own a store to hire staff' });
            }
            targetStoreId = adminStore._id;
            console.log(`Default store found: ${targetStoreId}`);
        } else {
            console.log(`Target store provided: ${targetStoreId}`);
        }

        // Verify ownership/permission if not super admin
        if (req.user.role !== 'super_admin') {
            console.log(`Checking store ownership for admin (${req.user._id}) and store (${targetStoreId})...`);
            const isOwner = await Store.findOne({ _id: targetStoreId, owner: req.user._id });
            if (!isOwner) {
                console.log('❌ Store access denied for this admin');
                return res.status(403).json({ message: 'Store access denied' });
            }
            console.log('✅ Admin owns the target store.');
        } else {
            console.log('User is super_admin, skipping store ownership check.');
        }

        const validTypes = ['order_staff', 'inventory_staff', 'service_staff'];
        if (!validTypes.includes(staffType)) {
            console.log(`❌ INVALID STAFF TYPE: ${staffType}`);
            return res.status(400).json({ message: 'Invalid staff specialization' });
        }
        console.log(`Staff type validated: ${staffType}`);

        const existingUser = await User.findOne({
            $or: [{ email: cleanEmail }, { username: cleanUsername }],
            isDeleted: false
        });

        if (existingUser) {
            console.log(`❌ CONFLICT: User with email/username already exists: ${cleanEmail}/${cleanUsername}`);
            return res.status(409).json({
                message: existingUser.email === cleanEmail
                    ? 'Email is already registered. Please use a different one.'
                    : 'Username is already taken. Please use a different one.'
            });
        }
        console.log('✅ Email and Username are unique.');

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
            console.log('Staff address derived from store contact info.');
        } else {
            console.log('Using default staff address.');
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
            requiresPasswordChange: true, // 🛡️ Enforce first-login change
            address: staffAddress,
            permissions: permissions || DEFAULT_PERMISSIONS[staffType] || {}
        });

        console.log(`[StaffDebug] Attempting to save staff ${cleanEmail} with password: ${tempPassword}`);
        await staff.save();
        
        // Use a more accurate prefix check (bcryptjs uses $2a$ or $2b$)
        const isHashed = staff.password.startsWith('$2a$') || staff.password.startsWith('$2b$');
        console.log(`✅ [StaffDebug] Saved. Hashed result: ${isHashed ? 'YES' : 'RAW (ERROR!)'} | Prefix: ${staff.password.substring(0, 4)}`);

        // 📧 Send Invitation Email (Force await on production to prevent premature termination)
        console.log(`📧 Dispatching email to: ${cleanEmail}`);
        let emailSent = false;
        try {
            await sendStaffInvitation(cleanEmail, tempPassword, cleanFirstName);
            emailSent = true;
            console.log(`✅ [Email] Successfully sent to: ${cleanEmail}`);
        } catch (emailErr) {
            console.error('❌ [Email Task] Failed:', emailErr);
        }

        const staffObj = staff.toObject();
        delete staffObj.password;

        res.status(201).json({ 
            message: emailSent 
                ? 'Staff account invited successfully. An email with credentials has been sent.' 
                : 'Staff account created, but the invitation email failed to send. Please ensure the mail server is configured correctly online.', 
            staff: staffObj,
            emailSent: emailSent,
            fallbackPassword: emailSent ? null : tempPassword // Provide fallback if email completely fails
        });
    } catch (error) {
        console.error('createStaff error details:', error);
        res.status(500).json({ 
            message: 'Staff creation failed', 
            error: error.message,
            details: error.code === 11000 ? 'Database conflict (duplicate identity)' : 'Internal server error'
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
