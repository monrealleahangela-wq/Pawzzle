const jwt = require('jsonwebtoken');
const User = require('../models/User');
const {
  hasPermission, getEffectivePermissions, normalizeRole,
  isPlatformAdmin, isStoreAdmin, isOperationalStaff
} = require('../config/permissions');
const { attachStoreRolePolicy } = require('../services/rolePermissionService');

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid token.' });
    }

    if (!user.isActive || user.isDeleted) {
      return res.status(403).json({ 
        message: 'Account Disabled',
        deactivationReason: user.deactivationReason || 'Your account has been disabled. Please contact support.',
        contactSupport: 'support@petshop.com',
        isDisabled: true
      });
    }

    await attachStoreRolePolicy(user);
    req.user = user;
    
    // Update lastSeen asynchronously (don't wait for it)
    User.findByIdAndUpdate(user._id, { lastSeen: Date.now() }).catch(err => 
      console.error('Error updating lastSeen:', err)
    );

    next();
  } catch (error) {
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

// Resource/action authorization. Always enforce this on the server; UI checks are cosmetic.
const requirePermission = (...permissions) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Access denied. User not authenticated.' });
  }
  const allowed = permissions.some((permission) => hasPermission(req.user, permission));
  if (!allowed) {
    return res.status(403).json({
      message: 'Access denied. Missing required permission.',
      requiredPermissions: permissions
    });
  }
  next();
};

const attachAuthorizationContext = (req, _res, next) => {
  if (req.user) {
    req.authorization = {
      role: normalizeRole(req.user),
      permissions: getEffectivePermissions(req.user)
    };
  }
  next();
};

// Super Admin only middleware
const superAdminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Access denied. User not authenticated.' });
  }

  if (!isPlatformAdmin(req.user)) {
    return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
  }

  next();
};

// Admin and Super Admin middleware
const adminOnly = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Access denied. User not authenticated.' });
  if (!isPlatformAdmin(req.user) && !isStoreAdmin(req.user)) {
    return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
  }
  next();
};

const platformAdminOnly = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Access denied. User not authenticated.' });
  if (!isPlatformAdmin(req.user)) {
    return res.status(403).json({ message: 'Access denied. Platform administrator only.' });
  }
  next();
};

// Admin, Super Admin, and Staff middleware (for store-level operations)
const adminOrStaff = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Not authenticated.' });
  if (!isPlatformAdmin(req.user) && !isStoreAdmin(req.user) && !isOperationalStaff(req.user)) {
    return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
  }
  // Staff must belong to a store
  if (isOperationalStaff(req.user) && !isPlatformAdmin(req.user) && !isStoreAdmin(req.user) && !req.user.store) {
    return res.status(403).json({ message: 'Staff account not assigned to a store.' });
  }
  next();
};

// Staff type-specific middleware factories
const requireStaffType = (...types) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Not authenticated.' });
  if (isPlatformAdmin(req.user) || isStoreAdmin(req.user)) return next();
  const effectiveType = req.user.role === 'staff' ? req.user.staffType : req.user.role;
  if (!isOperationalStaff(req.user) || !types.includes(effectiveType)) {
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
  if (isPlatformAdmin(req.user)) {
    return next();
  }

  // Admin can access their own resources
  if (isStoreAdmin(req.user) && req.user._id.toString() === userId) {
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
  requirePermission,
  attachAuthorizationContext,
  superAdminOnly,
  platformAdminOnly,
  adminOnly,
  adminOrStaff,
  requireStaffType,
  customerOnly,
  canAccessResource
};
