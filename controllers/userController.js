const { validationResult } = require('express-validator');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');

// Get all users (Admin only)
const getAllUsers = async (req, res) => {
  try {
    const { role, isActive, search, page = 1, limit = 10, dateRange } = req.query;

    console.log('🔍 getAllUsers called with:', { role, isActive, search, page, limit, dateRange });
    console.log('👤 Request user:', req.user);

    let filter = { isDeleted: { $ne: true } };

    // Apply dateRange filter
    if (dateRange) {
      const now = new Date();
      let startDate;
      if (dateRange === 'today') {
        startDate = new Date(now.setHours(0, 0, 0, 0));
      } else if (dateRange === 'week') {
        startDate = new Date(now.setDate(now.getDate() - 7));
        startDate.setHours(0, 0, 0, 0); // Ensure start of the day
      } else if (dateRange === 'month') {
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        startDate.setHours(0, 0, 0, 0); // Ensure start of the day
      } else if (dateRange === 'year') {
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        startDate.setHours(0, 0, 0, 0); // Ensure start of the day
      }

      if (startDate) {
        filter.createdAt = { $gte: startDate };
      }
    }

    // Super admin can see all users
    if (req.user.role === 'super_admin') {
      if (role && role !== '') filter.role = role;
      // Only add isActive filter if it's specifically set to 'true' or 'false'
      if (isActive !== undefined && isActive !== null && isActive !== '') {
        filter.isActive = isActive === 'true' || isActive === true;
      }
      // Add search functionality
      if (search && search !== '') {
        filter.$or = [
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } } // Added phone to search
        ];
      }

      console.log('Super admin filter:', filter);
    }

    else if (req.user.role === 'admin' || req.user.role === 'staff') {
      try {
        filter.role = 'customer';
        
        // Use the user's store ID if available
        let storeId = req.user.store;
        
        // Fallback for admins who don't have the field set but own a store
        if (!storeId && req.user.role === 'admin') {
          const Store = require('../models/Store');
          const ownedStore = await Store.findOne({ owner: req.user._id });
          if (ownedStore) storeId = ownedStore._id;
        }

        if (storeId) {
          // If we want to filter customers by store, we would need to check if customers are linked to stores
          // In some models, they might be. If not, admins/staff see all active customers for now,
          // or we can implement store-based customer assignment later.
          filter.isActive = true;
        } else {
          // If no store linked, admins/staff can still see active customers by default
          filter.isActive = true;
        }

        console.log(`${req.user.role} filter:`, filter);
      } catch (error) {
        console.error(`${req.user.role} filter error:`, error);
        filter.role = 'customer';
        filter.isActive = true;
      }
    } else {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const skip = (page - 1) * limit;
    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    console.log('🔍 Final MongoDB filter:', JSON.stringify(filter));
    console.log('📊 Final query result:', users.length);

    const total = await User.countDocuments(filter);

    res.json({
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalUsers: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get user by ID (Admin only or own user)
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check permissions: customers can only see their own profile
    // Admins and staff can see customers
    if (req.user.role === 'customer' && user._id.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Optional: for staff/admin, verify they "own" the customer or store relationship
    // For now, allow any admin/staff to see customers if they aren't a customer themselves

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update user (Admin only or own user)
const updateUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check permissions
    // Super admins can update anyone
    // Admins can only update themselves
    // Customers can only update themselves
    if (req.user.role !== 'super_admin' && user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied. You can only update your own profile.' });
    }

    const { firstName, lastName, phone, address, role, isActive, avatar } = req.body;
    console.log('Update user request body:', req.body);
    console.log('User ID:', req.params.id);
    console.log('Requesting user:', req.user);

    // Only super admin can change user roles or status
    if (req.body.role && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only super admin can change user roles' });
    }

    if (req.body.isActive !== undefined && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only super admin can change active status' });
    }

    // Update fields
    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.phone = phone || user.phone;
    user.avatar = avatar || user.avatar;

    // Safely handle address update
    if (address && typeof address === 'object') {
      user.address = {
        street: address.street || user.address?.street || 'N/A',
        city: address.city || user.address?.city || 'N/A',
        province: address.province || user.address?.province || 'Cavite',
        barangay: address.barangay || user.address?.barangay || 'N/A',
        zipCode: address.zipCode || user.address?.zipCode || '',
        country: address.country || user.address?.country || 'PH'
      };
    } else if (!user.address || !user.address.street) {
      // Initialize with defaults if missing to prevent validation errors
      user.address = {
        street: user.address?.street || 'N/A',
        city: user.address?.city || 'N/A',
        province: user.address?.province || 'Cavite',
        barangay: user.address?.barangay || 'N/A',
        zipCode: user.address?.zipCode || '',
        country: user.address?.country || 'PH'
      };
    }

    if (role !== undefined && req.user.role === 'super_admin') {
      user.role = role;
    }

    if (isActive !== undefined && req.user.role === 'super_admin') {
      if (user.isActive && !isActive) {
        // Being deactivated
        user.deactivationReason = req.body.deactivationReason || 'Account disabled by administrator.';
        user.deactivatedAt = new Date();
      } else if (!user.isActive && isActive) {
        // Being reactivated
        user.deactivationReason = null;
        user.deactivatedAt = null;
      }
      user.isActive = isActive;
    }

    await user.save();

    await ActivityLog.create({
      user: user._id,
      action: 'Updated Profile',
      details: 'Updated account settings or personal info',
      ipAddress: req.ip
    });

    const updatedUser = await User.findById(user._id).select('-password').populate('store');

    res.json({
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete user (Super Admin only)
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent self-deletion
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    await User.findByIdAndUpdate(req.params.id, { 
      isDeleted: true, 
      isActive: false,
      deactivationReason: 'Account deleted by administrator.',
      deactivatedAt: new Date()
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete own account (Soft delete)
const deleteMyAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Super admins should use the regular deleteUser or avoid self-deletion via UI
    if (user.role === 'super_admin') {
      return res.status(400).json({ message: 'Super administrators cannot delete their own account through this endpoint.' });
    }

    // Soft delete the user
    user.isDeleted = true;
    user.isActive = false;
    user.deactivationReason = 'Account closed by user.';
    user.deactivatedAt = new Date();
    
    // We keep the email and username for audit but the partial index 
    // in models/User.js allows new users to reuse them.
    await user.save();

    await ActivityLog.create({
      user: user._id,
      action: 'Account Deleted',
      details: 'User initiated self-account closure (Soft Delete)',
      ipAddress: req.ip
    });

    res.json({ message: 'Your account has been successfully closed. We hope to see you again!' });
  } catch (error) {
    console.error('deleteMyAccount error:', error);
    res.status(500).json({ message: 'Failed to delete account' });
  }
};

// Toggle user active status (Super Admin only)
const toggleUserStatus = async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent self-deactivation
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ message: 'Cannot deactivate your own account' });
    }

    user.isActive = !user.isActive;
    
    if (!user.isActive) {
      user.deactivationReason = reason || 'Account disabled by administrator for security or policy review.';
      user.deactivatedAt = new Date();
    } else {
      user.deactivationReason = null;
      user.deactivatedAt = null;
    }

    await user.save();

    res.json({
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
      isActive: user.isActive,
      deactivationReason: user.deactivationReason
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get user credentials (Super Admin only)
const getUserCredentials = async (req, res) => {
  try {
    // Only super admin can view credentials
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied. Super admin only.' });
    }

    const user = await User.findById(req.params.id).select('+password'); // Include hashed password

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Return user with hashed password for admin viewing
    res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        password: user.password, // Return the hashed password
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        address: user.address,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Get user credentials error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get admin settings
const getAdminSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const settings = user.shippingSettings || {
      freeShipping: true,
      shippingFee: 0,
      freeShippingThreshold: 1000
    };

    res.json(settings);
  } catch (error) {
    console.error('Get admin settings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update admin settings
const updateAdminSettings = async (req, res) => {
  try {
    const { freeShipping, shippingFee, freeShippingThreshold } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.shippingSettings = {
      freeShipping: freeShipping !== undefined ? freeShipping : user.shippingSettings?.freeShipping,
      shippingFee: shippingFee !== undefined ? Number(shippingFee) : user.shippingSettings?.shippingFee,
      freeShippingThreshold: freeShippingThreshold !== undefined ? Number(freeShippingThreshold) : user.shippingSettings?.freeShippingThreshold
    };

    await user.save();

    res.json({
      message: 'Settings updated successfully',
      settings: user.shippingSettings
    });
  } catch (error) {
    console.error('Update admin settings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get user activity logs
const getActivityLogs = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const logs = await ActivityLog.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({ logs });
  } catch (error) {
    console.error('Get activity logs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  deleteMyAccount,
  getUserCredentials,
  toggleUserStatus,
  getAdminSettings,
  updateAdminSettings,
  getActivityLogs
};
