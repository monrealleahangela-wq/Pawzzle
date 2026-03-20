const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    console.log('=== AUTHENTICATE MIDDLEWARE ===');
    console.log('Request path:', req.path);
    console.log('Request method:', req.method);
    console.log('Authorization header:', req.header('Authorization'));

    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      console.log('No token provided');
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    console.log('Token found:', token.substring(0, 20) + '...');

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Token decoded:', decoded);

    const user = await User.findById(decoded.id).select('-password');
    console.log('User found:', user ? user._id : 'null');
    console.log('User role:', user?.role);

    if (!user) {
      console.log('User not found in database');
      return res.status(401).json({ message: 'Invalid token.' });
    }

    if (!user.isActive || user.isDeleted) {
      console.log('User account is deactivated or deleted');
      return res.status(403).json({ 
        message: 'Account Disabled',
        deactivationReason: user.deactivationReason || 'Your account has been disabled. Please contact support.',
        contactSupport: 'support@petshop.com',
        isDisabled: true
      });
    }

    req.user = user;
    console.log('Authentication successful');
    next();
  } catch (error) {
    console.log('Authentication error:', error.message);
    res.status(401).json({ message: 'Invalid token.' });
  }
};

// Authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Access denied. User not authenticated.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    next();
  };
};

// Super Admin only middleware
const superAdminOnly = (req, res, next) => {
  console.log('=== SUPER ADMIN MIDDLEWARE CHECK ===');
  console.log('User:', req.user);
  console.log('User role:', req.user?.role);
  console.log('User ID:', req.user?._id);
  console.log('Request path:', req.path);
  console.log('Request method:', req.method);

  if (!req.user) {
    console.log('No user found in request');
    return res.status(401).json({ message: 'Access denied. User not authenticated.' });
  }

  if (req.user.role !== 'super_admin') {
    console.log('User role is not super_admin:', req.user.role);
    return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
  }

  console.log('Super admin access granted');
  next();
};

// Admin and Super Admin middleware
const adminOnly = authorize('admin', 'super_admin');

// Admin, Super Admin, and Staff middleware (for store-level operations)
const adminOrStaff = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Not authenticated.' });
  if (!['admin', 'super_admin', 'staff'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
  }
  // Staff must belong to a store
  if (req.user.role === 'staff' && !req.user.store) {
    return res.status(403).json({ message: 'Staff account not assigned to a store.' });
  }
  next();
};

// Staff type-specific middleware factories
const requireStaffType = (...types) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Not authenticated.' });
  if (req.user.role === 'admin' || req.user.role === 'super_admin') return next(); // Admins bypass
  if (req.user.role !== 'staff') return res.status(403).json({ message: 'Staff only.' });
  if (!types.includes(req.user.staffType)) {
    return res.status(403).json({ message: `This action requires one of: ${types.join(', ')}` });
  }
  next();
};

// Customer only middleware
const customerOnly = authorize('customer');

// Check if user can access their own resource or is admin
const canAccessResource = (req, res, next) => {
  const { userId } = req.params;

  // Super admin can access everything
  if (req.user.role === 'super_admin') {
    return next();
  }

  // Admin can access their own resources
  if (req.user.role === 'admin' && req.user._id.toString() === userId) {
    return next();
  }

  // Customer can only access their own resources
  if (req.user.role === 'customer' && req.user._id.toString() === userId) {
    return next();
  }

  res.status(403).json({ message: 'Access denied. You can only access your own resources.' });
};

module.exports = {
  authenticate,
  authorize,
  superAdminOnly,
  adminOnly,
  adminOrStaff,
  requireStaffType,
  customerOnly,
  canAccessResource
};
