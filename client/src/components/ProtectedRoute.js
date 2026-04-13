import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

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
  if (roles.length > 0 && !roles.includes(user?.role)) {
    switch (user?.role) {
      case 'super_admin':
        return <Navigate to="/superadmin/dashboard" replace />;
      case 'admin':
        return <Navigate to="/admin/dashboard" replace />;
      case 'staff':
        return <Navigate to="/admin/dashboard" replace />;
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
