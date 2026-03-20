const Store = require('../models/Store');

// Middleware to check if user is admin of their own store
const storeAdminOnly = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Access denied. User not authenticated.' });
    }

    // Super admin can access everything
    if (req.user.role === 'super_admin') {
      return next();
    }

    // Admin and Staff users can manage store resources
    if (req.user.role === 'admin' || req.user.role === 'staff') {
      if (!req.user.store) {
        // Try to find a store owned by this user (for admins)
        if (req.user.role === 'admin') {
          const ownedStore = await Store.findOne({ owner: req.user._id });
          if (ownedStore) {
            req.user.store = ownedStore._id;
          }
        }
        // Staff should already have a store assigned in the DB, if not, it will be handled below
      }

      // For store-specific routes, check if user belongs to this store
      if (req.params.storeId || req.body.storeId) {
        const storeId = req.params.storeId || req.body.storeId;
        // Allow if this is their store, or if they have no store yet (admin auto-resolve fallback)
        if (req.user.store && req.user.store.toString() !== storeId.toString()) {
          console.log(`🚫 Store Auth blocked for ${req.user.role}: User store ${req.user.store} != target store ${storeId}`);
          return res.status(403).json({ message: 'Access denied. You can only manage your own store.' });
        }
        
        // If staff has no store at all, they shouldn't be here
        if (req.user.role === 'staff' && !req.user.store) {
          return res.status(403).json({ message: 'Access denied. Staff account not assigned to a store.' });
        }
      }

      return next();
    }

    // Others (like customers) cannot access admin/store management routes
    return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });

  } catch (error) {
    console.error('Store auth middleware error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Middleware to check if user can access store-specific resources
const canAccessStore = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Access denied. User not authenticated.' });
    }

    // Super admin can access everything
    if (req.user.role === 'super_admin') {
      return next();
    }

    // Admin and Staff can access their own store
    if (req.user.role === 'admin' || req.user.role === 'staff') {
      const storeId = req.params.storeId || req.params.id;

      // If user has no store assigned, try to find one (for admins)
      if (!req.user.store && req.user.role === 'admin') {
        const ownedStore = await Store.findOne({ owner: req.user._id });
        if (ownedStore) {
          req.user.store = ownedStore._id;
        }
      }

      // Check if they are accessing a different store than their own
      if (req.user.store && storeId && req.user.store.toString() !== storeId.toString()) {
        return res.status(403).json({ message: 'Access denied. You can only access your own store.' });
      }

      // If staff has no store at all, they shouldn't be here
      if (req.user.role === 'staff' && !req.user.store) {
        return res.status(403).json({ message: 'Access denied. Staff account not assigned to a store.' });
      }

      return next();
    }

    // Customers can access stores (for viewing/buying)
    if (req.user.role === 'customer') {
      // Allow customers to view stores and products
      if (req.method === 'GET') {
        return next();
      }
      return res.status(403).json({ message: 'Access denied. Customers can only view stores.' });
    }

    return res.status(403).json({ message: 'Access denied.' });

  } catch (error) {
    console.error('Store access middleware error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  storeAdminOnly,
  canAccessStore
};
