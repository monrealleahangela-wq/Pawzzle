import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ADMIN_PORTAL_ROLES = new Set([
  'admin', 'store_owner', 'manager', 'cashier', 'inventory_staff',
  'procurement_officer', 'finance_staff', 'veterinarian', 'groomer',
  'trainer', 'boarding_staff', 'delivery_dispatcher', 'delivery_rider',
  'auditor', 'staff'
]);

const roleMatches = (userRole, allowedRoles) =>
  allowedRoles.includes(userRole) ||
  (allowedRoles.includes('admin') && ADMIN_PORTAL_ROLES.has(userRole)) ||
  (allowedRoles.includes('super_admin') && userRole === 'platform_admin');

const ProtectedRoute = ({ children, roles = [], staffTypes = [], requiredPermission = null }) => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Check basic role access
  if (roles.length > 0 && !roleMatches(user?.role, roles)) {
    switch (user?.role) {
      case 'super_admin':
      case 'platform_admin':
        return <Navigate to="/superadmin/dashboard" replace />;
      case 'admin':
      case 'staff':
      case 'store_owner':
      case 'manager':
      case 'cashier':
      case 'inventory_staff':
      case 'procurement_officer':
      case 'finance_staff':
      case 'veterinarian':
      case 'groomer':
      case 'trainer':
      case 'boarding_staff':
      case 'delivery_dispatcher':
      case 'delivery_rider':
      case 'auditor':
        return <Navigate to="/admin/dashboard" replace />;
      case 'supplier':
        return <Navigate to="/supplier/dashboard" replace />;
      case 'customer':
        return <Navigate to="/home" replace />;
      default:
        return <Navigate to="/login" replace />;
    }
  }

  // Enhanced Staff Access Logic
  if (user?.role === 'staff') {
    // 1. If a specific permission is required, check the matrix first
    if (requiredPermission) {
      const perms = user.permissions?.[requiredPermission];
      const hasPerm = perms?.view || perms?.fullAccess || perms?.create || perms?.update || perms?.delete;
      
      if (hasPerm) return children;
    }

    // 2. Fallback to traditional staffType check if specified
    if (staffTypes.length > 0 && !staffTypes.includes(user?.staffType)) {
      return <Navigate to="/admin/dashboard" replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
